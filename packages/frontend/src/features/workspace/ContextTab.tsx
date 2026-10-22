import type { Session, UsageSnapshot } from '@plum-code-webui/shared';
import { formatNumber } from '@/lib/analyticsFormat';
import { cn } from '@/lib/utils';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

/** Model, folder and how full the context window is. */
export function ContextTab({ session, usage }: { session: Session; usage?: UsageSnapshot }) {
  // The store's live snapshot can lag behind the one the server keeps.
  const snapshot = usage ?? session.telemetry?.usage ?? undefined;
  const percent = snapshot ? Math.min(100, Math.max(0, snapshot.contextUsedPercent)) : null;
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <h3 className="text-xs font-medium">Context window</h3>
        {snapshot && percent !== null ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  percent >= 90 ? 'bg-destructive' : percent >= 70 ? 'bg-warning' : 'bg-brand'
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {percent.toFixed(0)}% of {formatNumber(snapshot.contextWindow)} tokens
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No usage yet in this session.</p>
        )}
      </section>

      {snapshot && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium">Usage</h3>
          <dl className="space-y-1.5">
            <Row label="Input" value={formatNumber(snapshot.inputTokens)} />
            <Row label="Output" value={formatNumber(snapshot.outputTokens)} />
            <Row label="Cache read" value={formatNumber(snapshot.cacheReadTokens)} />
            <Row label="Cache write" value={formatNumber(snapshot.cacheCreationTokens)} />
            <Row label="Cost (API equivalent)" value={`$${snapshot.totalCostUsd.toFixed(4)}`} />
          </dl>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-medium">Session</h3>
        <dl className="space-y-1.5">
          <Row label="Agent" value={session.cliProvider} />
          <Row label="Model" value={session.runtime?.model || session.cliModel || 'default'} />
          <Row label="Folder" value={session.workingDirectory} />
        </dl>
      </section>
    </div>
  );
}
