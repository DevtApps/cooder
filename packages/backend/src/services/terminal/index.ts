import fs from 'fs';
import os from 'os';
import jwt from 'jsonwebtoken';
import * as pty from 'node-pty';
import type { Server } from 'socket.io';
import { get as pgGet } from '../../db/pg.js';
import { config } from '../../config.js';
import { hostShell, hostShellEnv } from '../../utils/hostShell.js';
import { getRunnerAccessDecision } from '../../utils/runnerAccess.js';

const NAMESPACE = '/terminal';
const room = (sessionId: string) => `terminal:${sessionId}`;
const SCROLLBACK_CHARS = 200_000;
const IDLE_CLOSE_MS = 10 * 60_000;

interface Shell {
  proc: pty.IPty;
  buffer: string;
  viewers: number;
  idle?: NodeJS.Timeout;
}

const shells = new Map<string, Shell>();

function shellEnv(): Record<string, string> {
  return { ...hostShellEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}

async function sessionFor(
  sessionId: string,
  userId: string
): Promise<{ working_directory: string } | undefined> {
  if (!sessionId || !userId) return undefined;
  return (await pgGet(
    'SELECT working_directory FROM sessions WHERE id = ? AND user_id = ?',
    sessionId,
    userId
  )) as { working_directory: string } | undefined;
}

function closeShell(sessionId: string): void {
  const shell = shells.get(sessionId);
  if (!shell) return;
  shells.delete(sessionId);
  if (shell.idle) clearTimeout(shell.idle);
  try {
    shell.proc.kill();
  } catch {
    // already gone
  }
}

/** Socket namespace of the terminal tab: one shell per session, in its project folder. */
export function setupTerminalNamespace(io: Server): void {
  const namespace = io.of(NAMESPACE);

  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      const access = await getRunnerAccessDecision(decoded.userId);
      if (!access.allowed) return next(new Error(access.reason || 'Terminal access denied'));
      socket.data.userId = decoded.userId;
      socket.data.attached = new Set<string>();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  namespace.on('connection', (socket) => {
    const attached = socket.data.attached as Set<string>;

    const release = (sessionId: string) => {
      if (!attached.delete(sessionId)) return;
      void socket.leave(room(sessionId));
      const shell = shells.get(sessionId);
      if (!shell) return;
      shell.viewers = Math.max(0, shell.viewers - 1);
      if (shell.viewers === 0) {
        shell.idle = setTimeout(() => closeShell(sessionId), IDLE_CLOSE_MS);
      }
    };

    socket.on(
      'terminal:attach',
      async (
        data: { sessionId: string; cols: number; rows: number },
        ack?: (result: { ok: boolean; error?: string; buffer?: string }) => void
      ) => {
        try {
          const session = await sessionFor(data?.sessionId, socket.data.userId);
          if (!session) return ack?.({ ok: false, error: 'Forbidden: session not owned' });
          const cols = Math.max(20, Math.min(500, Math.round(data.cols) || 80));
          const rows = Math.max(5, Math.min(200, Math.round(data.rows) || 24));
          let shell = shells.get(data.sessionId);
          if (!shell) {
            const cwd = fs.existsSync(session.working_directory)
              ? session.working_directory
              : os.homedir();
            const proc = pty.spawn(hostShell(), [], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd,
              env: shellEnv(),
            });
            shell = { proc, buffer: '', viewers: 0 };
            const created = shell;
            proc.onData((chunk) => {
              created.buffer = (created.buffer + chunk).slice(-SCROLLBACK_CHARS);
              namespace.to(room(data.sessionId)).emit('terminal:data', {
                sessionId: data.sessionId,
                data: chunk,
              });
            });
            proc.onExit(({ exitCode }) => {
              if (shells.get(data.sessionId) === created) shells.delete(data.sessionId);
              if (created.idle) clearTimeout(created.idle);
              namespace.to(room(data.sessionId)).emit('terminal:exit', {
                sessionId: data.sessionId,
                exitCode,
              });
            });
            shells.set(data.sessionId, shell);
          } else {
            shell.proc.resize(cols, rows);
          }
          if (shell.idle) clearTimeout(shell.idle);
          if (!attached.has(data.sessionId)) {
            attached.add(data.sessionId);
            shell.viewers += 1;
            await socket.join(room(data.sessionId));
          }
          ack?.({ ok: true, buffer: shell.buffer });
        } catch (error) {
          ack?.({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not start the terminal',
          });
        }
      }
    );

    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      if (!data || !attached.has(data.sessionId) || typeof data.data !== 'string') return;
      shells.get(data.sessionId)?.proc.write(data.data);
    });

    socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
      if (!data || !attached.has(data.sessionId)) return;
      const cols = Math.max(20, Math.min(500, Math.round(data.cols) || 80));
      const rows = Math.max(5, Math.min(200, Math.round(data.rows) || 24));
      try {
        shells.get(data.sessionId)?.proc.resize(cols, rows);
      } catch {
        // the shell exited
      }
    });

    // Closing the tab keeps the shell for a while; this one ends it.
    socket.on('terminal:kill', (data: { sessionId: string }) => {
      if (data && attached.has(data.sessionId)) closeShell(data.sessionId);
    });

    socket.on('terminal:detach', (data: { sessionId: string }) => {
      if (data) release(data.sessionId);
    });

    socket.on('disconnect', () => {
      for (const sessionId of [...attached]) release(sessionId);
    });
  });
}
