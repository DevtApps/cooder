import jwt from 'jsonwebtoken';
import type { Server } from 'socket.io';
import { get as pgGet } from '../../db/pg.js';
import { config } from '../../config.js';
import { getRunnerAccessDecision } from '../../utils/runnerAccess.js';
import { BrowserPaneManager, type KeyInput, type MouseInput } from './BrowserPane.js';

const NAMESPACE = '/browser';
const room = (sessionId: string) => `browser:${sessionId}`;

let manager: BrowserPaneManager | null = null;

/** The one manager the panel's socket and the agents' tools both drive. */
export function getBrowserPanes(): BrowserPaneManager {
  if (!manager) throw new Error('The browser panel is not running');
  return manager;
}

async function ownsSession(sessionId: string, userId: string): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const row = await pgGet('SELECT 1 FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId);
  return !!row;
}

interface Ack {
  (result: { ok: boolean; error?: string; [key: string]: unknown }): void;
}

/**
 * Socket namespace of the browser panel. A viewer attaches to one of its own
 * sessions, receives screencast frames and tab state, and sends input back.
 */
export function setupBrowserNamespace(io: Server): void {
  const namespace = io.of(NAMESPACE);
  manager = new BrowserPaneManager((sessionId, event, payload) => {
    namespace.to(room(sessionId)).emit(event, payload);
  });

  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      // Driving a browser on the host is as powerful as running a CLI.
      const access = await getRunnerAccessDecision(decoded.userId);
      if (!access.allowed) return next(new Error(access.reason || 'Browser access denied'));
      socket.data.userId = decoded.userId;
      socket.data.attached = new Set<string>();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  namespace.on('connection', (socket) => {
    const attached = socket.data.attached as Set<string>;
    const panes = getBrowserPanes();

    /** Runs an event for a session this socket attached to. */
    const guard =
      <T extends { sessionId: string }>(handler: (data: T) => Promise<void> | void) =>
      async (data: T) => {
        if (!data || !attached.has(data.sessionId)) return;
        try {
          await handler(data);
        } catch (error) {
          socket.emit('browser:error', {
            message: error instanceof Error ? error.message : 'Browser action failed',
          });
        }
      };

    socket.on(
      'browser:attach',
      async (data: { sessionId: string; width: number; height: number }, ack?: Ack) => {
        try {
          if (!(await ownsSession(data?.sessionId, socket.data.userId))) {
            return ack?.({ ok: false, error: 'Forbidden: session not owned' });
          }
          const width = Math.max(200, Math.min(4000, Math.round(data.width) || 1024));
          const height = Math.max(200, Math.min(4000, Math.round(data.height) || 700));
          if (!attached.has(data.sessionId)) {
            attached.add(data.sessionId);
            await socket.join(room(data.sessionId));
          }
          const state = await panes.attach(data.sessionId, { width, height });
          ack?.({ ok: true, state });
        } catch (error) {
          attached.delete(data?.sessionId);
          ack?.({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not start the browser',
          });
        }
      }
    );

    socket.on('browser:detach', (data: { sessionId: string }) => {
      if (!data || !attached.delete(data.sessionId)) return;
      void socket.leave(room(data.sessionId));
      panes.detach(data.sessionId);
    });

    socket.on(
      'browser:new-tab',
      guard((d: { sessionId: string; url?: string }) => panes.openTab(d.sessionId, d.url))
    );
    socket.on(
      'browser:close-tab',
      guard((d: { sessionId: string; tabId: string }) => panes.closeTab(d.sessionId, d.tabId))
    );
    socket.on(
      'browser:select-tab',
      guard((d: { sessionId: string; tabId: string }) => panes.select(d.sessionId, d.tabId))
    );
    socket.on(
      'browser:navigate',
      guard((d: { sessionId: string; tabId: string; url: string }) =>
        panes.navigate(d.sessionId, d.tabId, d.url)
      )
    );
    socket.on(
      'browser:nav',
      guard((d: { sessionId: string; action: 'back' | 'forward' | 'reload' | 'stop' }) =>
        panes.nav(d.sessionId, d.action)
      )
    );
    socket.on(
      'browser:resize',
      guard((d: { sessionId: string; width: number; height: number }) =>
        panes.resize(d.sessionId, {
          width: Math.max(200, Math.min(4000, Math.round(d.width))),
          height: Math.max(200, Math.min(4000, Math.round(d.height))),
        })
      )
    );
    socket.on(
      'browser:mouse',
      guard((d: { sessionId: string } & MouseInput) => panes.mouse(d.sessionId, d))
    );
    socket.on(
      'browser:key',
      guard((d: { sessionId: string } & KeyInput) => panes.key(d.sessionId, d))
    );
    socket.on(
      'browser:paste',
      guard((d: { sessionId: string; text: string }) => panes.paste(d.sessionId, String(d.text)))
    );
    socket.on('browser:screenshot', async (data: { sessionId: string }, ack?: Ack) => {
      if (!data || !attached.has(data.sessionId))
        return ack?.({ ok: false, error: 'Not attached' });
      const shot = await panes.screenshot(data.sessionId).catch(() => null);
      ack?.(shot ? { ok: true, ...shot } : { ok: false, error: 'No page to capture' });
    });

    socket.on('disconnect', () => {
      for (const sessionId of attached) panes.detach(sessionId);
      attached.clear();
    });
  });
}
