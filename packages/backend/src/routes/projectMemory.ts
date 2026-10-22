import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireHookSecret } from '../middleware/hookSecret.js';
import { isAllowedBasePath } from '../utils/allowedPaths.js';
import { getRunnerAccessDecision } from '../utils/runnerAccess.js';
import { get as pgGet } from '../db/pg.js';
import { addFact, listFacts, removeFact, updateFact } from '../services/projectMemory.js';

const router = Router();

function projectFolder(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new AppError('workingDirectory is required', 400, 'MISSING_PARAM');
  }
  const resolved = path.resolve(value);
  if (!isAllowedBasePath(resolved)) {
    throw new AppError('Working directory not allowed', 403, 'FORBIDDEN_PATH');
  }
  return resolved;
}

const factSchema = z.object({ content: z.string().min(1).max(2000) });
const userOf = (req: unknown) => (req as AuthenticatedRequest).userId;
const fail = (error: unknown, status = 400): never => {
  throw new AppError(error instanceof Error ? error.message : 'Failed', status, 'MEMORY_ERROR');
};

router.get('/', requireAuth, async (req, res) => {
  const cwd = projectFolder(req.query.workingDirectory);
  res.json({ success: true, data: await listFacts(userOf(req), cwd) });
});

router.post('/', requireAuth, async (req, res) => {
  const cwd = projectFolder(req.body?.workingDirectory);
  const parsed = factSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  try {
    const { fact } = await addFact(userOf(req), cwd, parsed.data.content, null);
    res.json({ success: true, data: fact });
  } catch (error) {
    fail(error);
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const cwd = projectFolder(req.body?.workingDirectory);
  const parsed = factSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  try {
    res.json({
      success: true,
      data: await updateFact(userOf(req), cwd, String(req.params.id ?? ''), parsed.data.content),
    });
  } catch (error) {
    fail(error, 404);
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const cwd = projectFolder(req.query.workingDirectory);
  await removeFact(userOf(req), cwd, String(req.params.id ?? ''));
  res.json({ success: true });
});

// Called by scripts/mcp-servers/memory.mjs on behalf of an agent in a session.
router.post('/internal/call', requireHookSecret, async (req, res) => {
  const parsed = z
    .object({
      tool: z.string().min(1).max(64),
      args: z.record(z.string(), z.unknown()).default({}),
    })
    .safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'INVALID_INPUT');
  const sessionId = req.header('x-webui-session-id') || '';
  const session = sessionId
    ? ((await pgGet(
        'SELECT user_id, working_directory FROM sessions WHERE id = ?',
        sessionId
      )) as unknown as { user_id: string; working_directory: string } | undefined)
    : undefined;
  if (!session)
    throw new AppError('A valid WebUI session identity is required', 403, 'SESSION_REQUIRED');
  const decision = await getRunnerAccessDecision(session.user_id);
  if (!decision.allowed) throw new AppError(decision.reason || 'Not allowed', 403, 'FORBIDDEN');

  const { tool, args } = parsed.data;
  const user = session.user_id;
  const cwd = session.working_directory;
  const text = (value: unknown) => String(value ?? '');
  try {
    switch (tool) {
      case 'remember': {
        const { fact, duplicate } = await addFact(user, cwd, text(args.fact), sessionId);
        return void res.json({
          success: true,
          data: { text: duplicate ? `Already known (${fact.id}).` : `Saved as ${fact.id}.` },
        });
      }
      case 'recall': {
        const query = text(args.query).toLowerCase().trim();
        const facts = (await listFacts(user, cwd)).filter(
          (fact) => !query || fact.content.toLowerCase().includes(query)
        );
        return void res.json({
          success: true,
          data: {
            text: facts.length
              ? facts.map((fact) => `[${fact.id}] ${fact.content}`).join('\n')
              : 'No saved facts for this project.',
          },
        });
      }
      case 'update_memory': {
        const fact = await updateFact(user, cwd, text(args.id), text(args.fact));
        return void res.json({ success: true, data: { text: `Updated ${fact.id}.` } });
      }
      case 'forget': {
        const removed = await removeFact(user, cwd, text(args.id));
        return void res.json({
          success: true,
          data: { text: removed ? 'Forgotten.' : 'No such fact.' },
        });
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    fail(error);
  }
});

export default router;
