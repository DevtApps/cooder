import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, Loader2, RotateCw, Square, Trash2 } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { processesKey, useProcesses, type RunInfo } from './useProcesses';

function duration(from: number, to: number | null): string {
  const seconds = Math.max(0, Math.round(((to ?? Date.now()) - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function StatusDot({ status }: { status: RunInfo['status'] }) {
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        status === 'running' && 'animate-pulse bg-success motion-reduce:animate-none',
        status === 'failed' && 'bg-destructive',
        (status === 'exited' || status === 'stopped') && 'bg-muted-foreground/50'
      )}
      title={status}
    />
  );
}

function Logs({ sessionId, id, running }: { sessionId: string; id: string; running: boolean }) {
  const box = useRef<HTMLPreElement>(null);
  const logs = useQuery({
    queryKey: ['process-logs', sessionId, id],
    queryFn: async () =>
      (
        await api.get<ApiResponse<{ log: string }>>(
          `/api/processes/${id}/logs?sessionId=${encodeURIComponent(sessionId)}`
        )
      ).data.data?.log ?? '',
    refetchInterval: running ? 1500 : false,
  });
  // Follow the output unless the user scrolled up to read.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const nearEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    if (nearEnd) element.scrollTop = element.scrollHeight;
  }, [logs.data]);
  return (
    <pre
      ref={box}
      className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] leading-snug text-foreground/85"
    >
      {logs.isLoading ? 'Loading…' : logs.data || '(no output yet)'}
    </pre>
  );
}

function Run({ run, sessionId }: { run: RunInfo; sessionId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const base = `/api/processes/${run.id}`;
  const query = `?sessionId=${encodeURIComponent(sessionId)}`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: processesKey(sessionId) });
  const onError = (error: unknown) =>
    toast({
      title: 'Could not do that',
      description: error instanceof Error ? error.message : undefined,
      variant: 'destructive',
    });

  const stop = useMutation({
    mutationFn: () => api.post(`${base}/stop${query}`),
    onSuccess: refresh,
    onError,
  });
  const restart = useMutation({
    mutationFn: () => api.post(`${base}/restart${query}`),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`${base}${query}`),
    onSuccess: refresh,
    onError,
  });
  const openUrl = useMutation({
    mutationFn: (url: string) => api.post('/api/browser/open', { sessionId, url }),
    onError,
  });

  const running = run.status === 'running';
  const busy = stop.isPending || restart.isPending || remove.isPending;
  const button =
    'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50';

  return (
    <li className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Hide output' : 'Show output'}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
            aria-hidden
          />
          <StatusDot status={run.status} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{run.name}</span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {run.command}
            </span>
          </span>
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {running
            ? duration(run.startedAt, null)
            : `${run.status}${run.exitCode != null ? ` · ${run.exitCode}` : ''}`}
        </span>
        {running ? (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => stop.mutate()}
            aria-label="Stop"
            title="Stop"
          >
            {stop.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => restart.mutate()}
              aria-label="Run again"
              title="Run again"
            >
              {restart.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => remove.mutate()}
              aria-label="Remove"
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {running && run.urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
          {run.urls.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => openUrl.mutate(url)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-info transition-colors hover:bg-accent"
              title="Open in the browser panel"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              {url.replace(/^https?:\/\//, '')}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="px-2.5 pb-2.5">
          <Logs sessionId={sessionId} id={run.id} running={running} />
        </div>
      )}
    </li>
  );
}

/** What the agents keep running for this session, with output and a stop button. */
export function RunsTab({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useProcesses(sessionId);
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nothing is running. When an agent starts a dev server or another long-lived command, it
        shows up here so you can read its output and stop it.
      </p>
    );
  }
  return (
    <ul className="space-y-2 p-3">
      {data.map((run) => (
        <Run key={run.id} run={run} sessionId={sessionId} />
      ))}
    </ul>
  );
}
