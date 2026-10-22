import { useQuery } from '@tanstack/react-query';
import type { CLIProvider } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatResetDelta } from '@/features/analytics/model';
import {
  USAGE_PROVIDER_LABELS,
  USAGE_PROVIDERS,
  limitWindows,
  type UsageLimitsResponse,
} from '@/features/analytics/limits';
import { cn } from '@/lib/utils';

const SIZE = 22;
const STROKE = 3;

function tone(percent: number) {
  return percent >= 90 ? 'destructive' : percent >= 70 ? 'warning' : 'brand';
}

/** Circular gauge of the most used quota window. */
function Ring({ percent }: { percent: number }) {
  const radius = (SIZE - STROKE) / 2;
  const length = 2 * Math.PI * radius;
  const center = SIZE / 2;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * length} ${length}`}
        transform={`rotate(-90 ${center} ${center})`}
        className={cn(
          tone(percent) === 'destructive' && 'stroke-destructive',
          tone(percent) === 'warning' && 'stroke-warning',
          tone(percent) === 'brand' && 'stroke-brand'
        )}
      />
    </svg>
  );
}

/**
 * Quota of the session's agent, like the plan limits in the Claude apps: a
 * small ring in the composer, the windows (session, weekly…) when opened.
 * Renders nothing for agents that report no limits.
 */
export function UsageLimitsPopover({ provider }: { provider: CLIProvider }) {
  const tracker = USAGE_PROVIDERS.find((item) => item === provider);
  const query = useQuery({
    queryKey: ['usage-limits', tracker],
    queryFn: async () =>
      (await api.get<UsageLimitsResponse>(`/api/usage/limits?provider=${tracker}`)).data,
    enabled: !!tracker,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const response = query.data;
  if (!tracker || !response?.success || !response.supported || !response.data) return null;
  const windows = limitWindows(response.provider, response.data);
  if (windows.length === 0) return null;

  const highest = Math.max(...windows.map((window) => window.utilization));
  const percent = Math.max(0, Math.min(100, highest));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Usage limits, ${Math.round(percent)}% used`}
        title="Usage limits"
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-accent data-[popup-open]:bg-accent"
      >
        <Ring percent={percent} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-80 p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Usage limits · {USAGE_PROVIDER_LABELS[tracker]}
          {response.data.subscriptionType ? ` · ${response.data.subscriptionType}` : ''}
        </p>
        <div className="space-y-4">
          {windows.map((window) => {
            const used = Math.max(0, Math.min(100, window.utilization));
            return (
              <div key={window.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{window.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {window.resetsAt ? `Resets ${formatResetDelta(window.resetsAt)} · ` : ''}
                    {Math.round(used)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      tone(used) === 'destructive' && 'bg-destructive',
                      tone(used) === 'warning' && 'bg-warning',
                      tone(used) === 'brand' && 'bg-brand'
                    )}
                    style={{ width: `${used}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
