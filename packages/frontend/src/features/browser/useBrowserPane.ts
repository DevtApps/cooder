import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface PaneState {
  tabs: TabInfo[];
  activeTabId: string | null;
}

export interface Frame {
  tabId: string;
  data: string;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

type Status = 'connecting' | 'ready' | 'error';

/**
 * Connection to the Chrome the backend runs for a session: tab state comes in,
 * screencast frames are handed to `onFrame`, input and navigation go out.
 */
export function useBrowserPane(
  sessionId: string,
  size: Size | null,
  onFrame: (frame: Frame) => void
) {
  const [state, setState] = useState<PaneState>({ tabs: [], activeTabId: null });
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const hasSize = size !== null;

  useEffect(() => {
    if (!hasSize) return;
    const token = useAuthStore.getState().token;
    const socket = io('/browser', { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    setStatus('connecting');

    const attach = () => {
      const current = sizeRef.current!;
      socket.emit(
        'browser:attach',
        { sessionId, width: current.width, height: current.height },
        (result: { ok: boolean; error?: string; state?: PaneState }) => {
          if (result.ok && result.state) {
            setState(result.state);
            setStatus('ready');
            setError(null);
          } else {
            setStatus('error');
            setError(result.error ?? 'The browser could not start.');
          }
        }
      );
    };

    socket.on('connect', attach);
    socket.on('connect_error', (failure) => {
      setStatus('error');
      setError(failure.message || 'The browser connection failed.');
    });
    socket.on('browser:state', setState);
    socket.on('browser:frame', (frame: Frame) => frameRef.current(frame));
    socket.on('browser:error', (data: { message: string }) =>
      toast({ title: 'Browser', description: data.message, variant: 'destructive' })
    );
    socket.on(
      'browser:download',
      (data: { filename: string; path?: string; status: string; error?: string }) => {
        if (data.status === 'saved') {
          toast({ title: `Downloaded ${data.filename}`, description: data.path });
        } else if (data.status === 'blocked') {
          toast({
            title: `Download blocked: ${data.filename}`,
            description: 'Downloads are turned off in Settings → Browser.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: `Download failed: ${data.filename}`,
            description: data.error,
            variant: 'destructive',
          });
        }
      }
    );

    return () => {
      socket.emit('browser:detach', { sessionId });
      socket.disconnect();
      socketRef.current = null;
    };
    // Reconnect only when the session or the first measurement changes;
    // later size changes go through `resize`.
  }, [hasSize, sessionId]);

  const send = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      socketRef.current?.emit(event, { sessionId, ...payload });
    },
    [sessionId]
  );

  const screenshot = useCallback(
    () =>
      new Promise<{ data: string; url: string; title: string } | null>((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve(null);
        socket.emit(
          'browser:screenshot',
          { sessionId },
          (result: { ok: boolean; data?: string; url?: string; title?: string }) =>
            resolve(
              result.ok && result.data
                ? { data: result.data, url: result.url ?? '', title: result.title ?? '' }
                : null
            )
        );
      }),
    [sessionId]
  );

  return { state, status, error, send, screenshot };
}
