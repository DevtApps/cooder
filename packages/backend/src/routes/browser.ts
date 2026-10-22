import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { isAllowedBasePath } from '../utils/allowedPaths.js';
import { getRunnerAccessDecision } from '../utils/runnerAccess.js';
import { requireHookSecret } from '../middleware/hookSecret.js';
import { get as pgGet } from '../db/pg.js';
import { runBrowserTool } from '../services/browserPane/agentTools.js';
import { getBrowserPanes } from '../services/browserPane/index.js';
import { emitToSession } from '../websocket/index.js';
import { getBrowserStatus, installBrowser } from '../services/browserPane/binaries.js';
import {
  readBrowserSettings,
  resolveDownloadsDir,
  writeBrowserSettings,
} from '../services/browserPane/settings.js';

const router = Router();

/** Tools that put a page in front of the user, so the panel should be visible. */
const SHOWS_BROWSER = new Set(['navigate', 'tabs_create', 'tabs_select']);

const installSchema = z.object({ browser: z.enum(['chrome', 'firefox']) });
const settingsSchema = z.object({
  downloadsDir: z.string().trim().min(1).nullable().optional(),
  allowDownloads: z.boolean().optional(),
});

router.get('/status', requireAuth, (_req, res) => {
  const settings = readBrowserSettings();
  res.json({
    success: true,
    data: { ...getBrowserStatus(), settings, downloadsDir: resolveDownloadsDir(settings) },
  });
});

// Downloading a browser is a multi-minute install on the host, like updating the CLIs.
router.post('/install', requireAuth, requireAdmin, async (req, res) => {
  const parsed = installSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  const decision = await getRunnerAccessDecision((req as AuthenticatedRequest).userId);
  if (!decision.allowed) throw new AppError(decision.reason || 'Not allowed', 403, 'FORBIDDEN');
  try {
    const output = await installBrowser(parsed.data.browser);
    res.json({ success: true, data: { output, status: getBrowserStatus() } });
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message.split('\n').slice(-3).join(' ') : 'Install failed',
      500,
      'INSTALL_FAILED'
    );
  }
});

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  const current = readBrowserSettings();
  const next = {
    downloadsDir:
      parsed.data.downloadsDir === undefined ? current.downloadsDir : parsed.data.downloadsDir,
    allowDownloads: parsed.data.allowDownloads ?? current.allowDownloads,
  };
  if (next.downloadsDir && !isAllowedBasePath(next.downloadsDir)) {
    throw new AppError('That folder is outside the allowed paths', 403, 'FORBIDDEN_PATH');
  }
  writeBrowserSettings(next);
  res.json({ success: true, data: { ...next, downloadsDir: resolveDownloadsDir(next) } });
});

// The panel asks for a page (a dev server the agent started, a link in a run).
router.post('/open', requireAuth, async (req, res) => {
  const parsed = z
    .object({ sessionId: z.string().min(1), url: z.string().min(1).max(2048) })
    .safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  const row = (await pgGet(
    'SELECT user_id FROM sessions WHERE id = ?',
    parsed.data.sessionId
  )) as unknown as { user_id: string } | undefined;
  if (!row || row.user_id !== (req as AuthenticatedRequest).userId) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }
  const decision = await getRunnerAccessDecision(row.user_id);
  if (!decision.allowed) throw new AppError(decision.reason || 'Not allowed', 403, 'FORBIDDEN');
  await runBrowserTool(getBrowserPanes(), parsed.data.sessionId, 'navigate', {
    url: parsed.data.url,
  });
  emitToSession(parsed.data.sessionId, 'browser:show', {});
  res.json({ success: true });
});

// Called by scripts/mcp-servers/browser.mjs on behalf of an agent in a session.
router.post('/internal/call', requireHookSecret, async (req, res) => {
  const parsed = z
    .object({
      tool: z.string().min(1).max(64),
      args: z.record(z.string(), z.unknown()).default({}),
    })
    .safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid input', 400, 'INVALID_INPUT');
  const sessionId = req.header('x-webui-session-id') || '';
  const row = sessionId
    ? ((await pgGet('SELECT user_id FROM sessions WHERE id = ?', sessionId)) as unknown as
        | { user_id: string }
        | undefined)
    : undefined;
  if (!row?.user_id) {
    throw new AppError('A valid WebUI session identity is required', 403, 'SESSION_REQUIRED');
  }
  const decision = await getRunnerAccessDecision(row.user_id);
  if (!decision.allowed) throw new AppError(decision.reason || 'Not allowed', 403, 'FORBIDDEN');
  try {
    const data = await runBrowserTool(
      getBrowserPanes(),
      sessionId,
      parsed.data.tool,
      parsed.data.args
    );
    // The agent is showing the user something: surface the browser panel.
    if (SHOWS_BROWSER.has(parsed.data.tool)) emitToSession(sessionId, 'browser:show', {});
    res.json({ success: true, data });
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : 'Browser tool failed',
      400,
      'BROWSER_TOOL_FAILED'
    );
  }
});

export default router;
