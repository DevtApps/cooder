import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { socketService } from '@/services/socket';

/**
 * Messages typed here that the server has not confirmed. They are kept in this
 * browser, so a dropped connection never loses what was written.
 */
export function OutboxBanner({ sessionId }: { sessionId: string }) {
  const [entries, setEntries] = useState(() => socketService.getOutboxEntries());

  useEffect(() => {
    const refresh = () => setEntries(socketService.getOutboxEntries());
    window.addEventListener('cooder:outbox-changed', refresh);
    window.addEventListener('storage', refresh);
    refresh();
    return () => {
      window.removeEventListener('cooder:outbox-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const waiting = entries.filter((entry) => entry.sessionId === sessionId);
  if (waiting.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5" role="status">
      {waiting.map((entry) => (
        <div
          key={entry.clientMessageId}
          className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words">{entry.message}</p>
            <p className="text-xs text-muted-foreground">
              {entry.sending
                ? 'Waiting for the server…'
                : (entry.error ?? 'Not sent yet · saved in this browser')}
            </p>
          </div>
          {!entry.sending && (
            <div className="flex shrink-0 gap-3 text-xs">
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void socketService.retryOutboxEntry(entry.clientMessageId)}
              >
                Retry
              </button>
              <button
                type="button"
                className="text-muted-foreground underline underline-offset-2"
                onClick={() => socketService.discardOutboxEntry(entry.clientMessageId)}
              >
                Discard
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
