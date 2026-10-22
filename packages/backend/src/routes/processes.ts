import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireHookSecret } from '../middleware/hookSecret.js';
import { getRunnerAccessDecision } from '../utils/runnerAccess.js';
import { get as pgGet } from '../db/pg.js';
import { processManager } from '../services/processes/ProcessManager.js';

const router = Router();

interface Owned {
  user_id: string;
  working_directory: string;
}

async function ownedSession(sessionId: string, userId?: string): Promise<Owned> {
  const row = sessionId
    ? ((await pgGet(
        'SELECT user_id, working_directory FROM sessions WHERE id = ?',
        sessionId
      )) as unknown as Owned | undefined)
    : undefined;
  if (!row || (userId && row.user_id !== userId)) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }
  const decision = await getRunnerAccessDecision(row.user_id);
  if (!decision.allowed) throw new AppError(decision.reason || 'Not allowed', 403, 'FORBIDDEN');
  return row;
}

const sessionIdOf = (req: { query: Record<string, unknown> }): string =>
  typeof req.query.sessionId === 'string' ? req.query.sessionId : '';

router.get('/', requireAuth, async (req, res) => {
  const sessionId = sessionIdOf(req);
  await ownedSession(sessionId, (req as AuthenticatedRequest).userId);
  res.json({ success: true, data: processManager.list(sessionId) });
});

router.get('/:id/logs', requireAuth, async (req, res) => {
  const sessionId = sessionIdOf(req);
  await ownedSession(sessionId, (req as AuthenticatedRequest).userId);
  try {
    res.json({
      success: true,
      data: { log: processManager.logs(sessionId, String(req.params.id ?? '')) },
    });
  } catch (error) {
    throw new AppError((error as Error).message, 404, 'NOT_FOUND');
  }
});

router.post('/:id/stop', requireAuth, async (req, res) => {
  const sessionId = sessionIdOf(req);
  await ownedSession(sessionId, (req as AuthenticatedRequest).userId);
  try {
    res.json({
      success: true,
      data: await processManager.stop(sessionId, String(req.params.id ?? '')),
    });
  } catch (error) {
    throw new AppError((error as Error).message, 404, 'NOT_FOUND');
  }
});

router.post('/:id/restart', requireAuth, async (req, res) => {
  const sessionId = sessionIdOf(req);
  await ownedSession(sessionId, (req as AuthenticatedRequest).userId);
  try {
    res.json({
      success: true,
      data: await processManager.restart(sessionId, String(req.params.id ?? '')),
    });
  } catch (error) {
    throw new AppError((error as Error).message, 404, 'NOT_FOUND');
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const sessionId = sessionIdOf(req);
  await ownedSession(sessionId, (req as AuthenticatedRequest).userId);
  try {
    processManager.remove(sessionId, String(req.params.id ?? ''));
    res.json({ success: true });
  } catch (error) {
    throw new AppError((error as Error).message, 400, 'INVALID_STATE');
  }
});

function table(rows: ReturnType<typeof processManager.list>): string {
  if (rows.length === 0) return 'No background processes in this session.';
  return rows
    .map((p) => {
      const state = p.status === 'running' ? 'running' : `${p.status} (exit ${p.exitCode ?? '?'})`;
      const urls = p.urls.length ? ` urls: ${p.urls.join(', ')}` : '';
      return `${p.id}  ${state}  ${p.name}  [${p.command}]${urls}`;
    })
    .join('\n');
}

// Called by scripts/mcp-servers/processes.mjs on behalf of an agent in a session.
router.post('/internal/call', requireHookSecret, async (req, res) => {
  const parsed = z
    .object({
      tool: z.string().min(1).max(64),
      args: z.record(z.string(), z.unknown()).default({}),
    })
    .safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'INVALID_INPUT');
  const sessionId = req.header('x-webui-session-id') || '';
  const session = await ownedSession(sessionId);
  const { tool, args } = parsed.data;
  const id = typeof args.id === 'string' ? args.id : '';
  try {
    switch (tool) {
      case 'bg_start': {
        const cwd = typeof args.cwd === 'string' && args.cwd ? args.cwd : session.working_directory;
        const info = await processManager.start(sessionId, {
          command: String(args.command ?? ''),
          name: typeof args.name === 'string' ? args.name : undefined,
          cwd,
        });
        const tail = processManager.logs(sessionId, info.id, 3000);
        const state =
          info.status === 'running' ? 'running' : `already ${info.status} (exit ${info.exitCode})`;
        const urls = info.urls.length ? `\nurls: ${info.urls.join(', ')}` : '';
        return void res.json({
          success: true,
          data: {
            text: `id ${info.id}: ${state}${urls}\n--- output so far ---\n${tail || '(none yet)'}`,
          },
        });
      }
      case 'bg_list':
        return void res.json({
          success: true,
          data: { text: table(processManager.list(sessionId)) },
        });
      case 'bg_logs': {
        const tail = Math.min(Math.max(Number(args.tail) || 4000, 200), 60_000);
        return void res.json({
          success: true,
          data: { text: processManager.logs(sessionId, id, tail) || '(no output yet)' },
        });
      }
      case 'bg_stop': {
        const info = await processManager.stop(sessionId, id);
        return void res.json({ success: true, data: { text: `${info.id}: ${info.status}` } });
      }
      case 'bg_restart': {
        const info = await processManager.restart(sessionId, id);
        return void res.json({ success: true, data: { text: `${info.id}: ${info.status}` } });
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : 'Process tool failed',
      400,
      'PROCESS_TOOL_FAILED'
    );
  }
});

export default router;
