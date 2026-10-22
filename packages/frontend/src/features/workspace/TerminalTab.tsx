import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

/** Resolve a theme token (`--background`) to a color xterm can paint. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : fallback;
}

function themeFromApp() {
  return {
    background: token('--background', '#262624'),
    foreground: token('--foreground', '#faf9f5'),
    cursor: token('--brand', '#d97757'),
    selectionBackground: 'rgba(217, 119, 87, 0.3)',
  };
}

/** A shell in the session's project folder; it survives closing the tab for a while. */
export function TerminalTab({ sessionId }: { sessionId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error' | 'exited'>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const term = new Terminal({
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: themeFromApp(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();

    const token = useAuthStore.getState().token;
    const socket = io('/terminal', { auth: { token }, transports: ['websocket'] });

    const attach = () => {
      socket.emit(
        'terminal:attach',
        { sessionId, cols: term.cols, rows: term.rows },
        (result: { ok: boolean; error?: string; buffer?: string }) => {
          if (!result.ok) {
            setStatus('error');
            setError(result.error ?? 'The terminal could not start.');
            return;
          }
          term.reset();
          if (result.buffer) term.write(result.buffer);
          setStatus('ready');
          setError(null);
          term.focus();
        }
      );
    };
    socket.on('connect', attach);
    socket.on('connect_error', (e) => {
      setStatus('error');
      setError(e.message);
    });
    socket.on('terminal:data', (m: { sessionId: string; data: string }) => {
      if (m.sessionId === sessionId) term.write(m.data);
    });
    socket.on('terminal:exit', (m: { sessionId: string }) => {
      if (m.sessionId !== sessionId) return;
      term.write('\r\n\x1b[2m[process exited — reopen the tab for a new shell]\x1b[0m\r\n');
      setStatus('exited');
    });

    const input = term.onData((data) => socket.emit('terminal:input', { sessionId, data }));
    const resize = term.onResize(({ cols, rows }) =>
      socket.emit('terminal:resize', { sessionId, cols, rows })
    );
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // hidden or zero-sized
      }
    });
    observer.observe(element);

    // Follow light/dark changes.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = themeFromApp();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      themeObserver.disconnect();
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.emit('terminal:detach', { sessionId });
      socket.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="relative h-full bg-background p-2">
      <div ref={host} className="h-full w-full" />
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      )}
      {status === 'error' && (
        <p className="absolute inset-x-3 top-3 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
