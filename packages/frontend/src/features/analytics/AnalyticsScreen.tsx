import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { formatNumber } from '@/lib/analyticsFormat';
import { useCliProviders } from '@/features/agents/useCliProviders';
import { Page, Panel, Section, Segmented } from '@/features/shell/Page';
import { paths } from '@/features/shell/paths';
import { cn } from '@/lib/utils';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import {
  USAGE_METRICS,
  formatCurrency,
  formatMetric,
  formatAxisMetric,
  formatRelativeTime,
  formatResetDelta,
  getProviderColor,
  metricValue,
  percentChange,
  type AnalyticsSummary,
  type TimelineData,
  type UsageMetric,
} from './model';
import {
  USAGE_PROVIDERS,
  USAGE_PROVIDER_LABELS,
  limitWindows,
  type UsageLimitsResponse,
} from './limits';

type Period = '24h' | '7d' | '30d' | '90d' | 'all';

// "Week" and "Month" are calendar windows (the Codex weekly quota resets on a
// week boundary); 24h and 90d are rolling.
const PERIODS: Array<{ value: Period; label: TranslationKey }> = [
  { value: '24h', label: 'analytics.hours24' },
  { value: '7d', label: 'analytics.week' },
  { value: '30d', label: 'analytics.month' },
  { value: '90d', label: 'analytics.days90' },
  { value: 'all', label: 'analytics.all' },
];

const COMPARE: Record<Period, TranslationKey> = {
  '24h': 'analytics.previous24h',
  '7d': 'analytics.sameTimeLastWeek',
  '30d': 'analytics.sameTimeLastMonth',
  '90d': 'analytics.previous90days',
  all: 'analytics.allRecordedUsage',
};

const REFRESH_MS = 30_000;

function Delta({ change, caption }: { change: number | null; caption: string }) {
  if (change === null) return <span className="text-xs text-muted-foreground">{caption}</span>;
  const up = change > 0;
  return (
    <span className="text-xs text-muted-foreground">
      <span className={cn('font-medium', up ? 'text-warning' : 'text-success')}>
        {up ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change).toFixed(change === 0 ? 0 : 1)}%
      </span>{' '}
      {caption}
    </span>
  );
}

function Kpi({
  label,
  value,
  change,
  caption,
}: {
  label: string;
  value: string;
  change: number | null;
  caption: string;
}) {
  return (
    <Panel className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums tracking-tight">{value}</p>
      <div className="mt-1">
        <Delta change={change} caption={caption} />
      </div>
    </Panel>
  );
}

export function AnalyticsScreen() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>('7d');
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<UsageMetric>('cost');
  // Fixed per mount so the query keys stay stable across a DST change.
  const tz = useMemo(() => -new Date().getTimezoneOffset(), []);
  const granularity = period === '24h' ? 'hour' : 'day';

  const summary = useQuery({
    queryKey: ['analytics-summary', period, offset, tz],
    queryFn: async () =>
      (
        await api.get<ApiResponse<AnalyticsSummary>>(
          `/api/analytics/summary?period=${period}&tz=${tz}&offset=${offset}`
        )
      ).data.data,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const timeline = useQuery({
    queryKey: ['analytics-timeline', period, offset, tz, granularity],
    queryFn: async () =>
      (
        await api.get<ApiResponse<TimelineData[]>>(
          `/api/analytics/timeline?period=${period}&tz=${tz}&offset=${offset}&granularity=${granularity}`
        )
      ).data.data,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const data = summary.data;
  const totals = data?.totals;
  const previous = data?.comparison?.totals;
  const caption = t(COMPARE[period]);
  const periods = PERIODS.map((item) => ({ value: item.value, label: t(item.label) }));
  const metricLabels = {
    cost: t('analytics.spend'),
    tokens: t('analytics.tokens'),
    requests: t('analytics.requests'),
  } satisfies Record<UsageMetric, string>;

  const cacheRate = (input: number, read: number, write: number) => {
    const prompt = input + read + write;
    return prompt > 0 ? (read / prompt) * 100 : null;
  };
  const cache = totals
    ? cacheRate(totals.inputTokens, totals.cacheReadTokens, totals.cacheCreationTokens)
    : null;
  const previousCache = previous
    ? cacheRate(previous.inputTokens, previous.cacheReadTokens, previous.cacheCreationTokens)
    : null;

  const providers = useMemo(
    () => [...(data?.byProvider ?? [])].filter((p) => p.requests > 0),
    [data?.byProvider]
  );

  const chartData = useMemo(
    () =>
      (timeline.data ?? []).map((row) => {
        const point: Record<string, string | number> = { label: row.date };
        for (const provider of providers) {
          const entry = row.providers?.[provider.provider];
          point[provider.provider] = entry ? metricValue(entry, metric) : 0;
        }
        return point;
      }),
    [metric, providers, timeline.data]
  );

  const window = data?.window;

  return (
    <Page
      wide
      title={t('analytics.title')}
      description={window?.label ?? t('analytics.description')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {period !== 'all' && (
            <div className="flex items-center">
              <button
                type="button"
                disabled={!window?.canGoPrevious}
                onClick={() => setOffset((value) => value + 1)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                aria-label={t('analytics.previousPeriod')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!window?.canGoNext}
                onClick={() => setOffset((value) => Math.max(0, value - 1))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                aria-label={t('analytics.nextPeriod')}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <Segmented
            label={t('analytics.period')}
            value={period}
            onChange={(value) => {
              setPeriod(value);
              setOffset(0);
            }}
            options={periods}
          />
        </div>
      }
    >
      {summary.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('analytics.usageCouldNotLoad')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('analytics.spend')}
          value={totals ? formatCurrency(totals.totalCost) : '—'}
          change={totals && previous ? percentChange(totals.totalCost, previous.totalCost) : null}
          caption={caption}
        />
        <Kpi
          label={t('analytics.tokens')}
          value={totals ? formatNumber(totals.totalTokens) : '—'}
          change={
            totals && previous ? percentChange(totals.totalTokens, previous.totalTokens) : null
          }
          caption={caption}
        />
        <Kpi
          label={t('analytics.requests')}
          value={totals ? totals.totalRequests.toLocaleString('en-US') : '—'}
          change={
            totals && previous ? percentChange(totals.totalRequests, previous.totalRequests) : null
          }
          caption={caption}
        />
        <Kpi
          label={t('analytics.cacheHitRate')}
          value={cache === null ? '—' : `${cache.toFixed(0)}%`}
          change={cache !== null ? percentChange(cache, previousCache) : null}
          caption={caption}
        />
      </div>

      <Section
        title={t('analytics.usageOverTime')}
        actions={
          <Segmented
            label={t('analytics.metric')}
            value={metric}
            onChange={setMetric}
            options={USAGE_METRICS.map((m) => ({ value: m.value, label: metricLabels[m.value] }))}
          />
        }
      >
        <Panel className="p-4">
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {timeline.isLoading ? t('analytics.loading') : t('analytics.noUsagePeriod')}
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  maxBarSize={56}
                >
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value: number) =>
                      metric === 'cost' && value < 10
                        ? `$${value.toFixed(value < 1 ? 2 : 1)}`
                        : formatAxisMetric(metric, value)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--accent))', opacity: 0.5 }}
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [
                      formatMetric(metric, Number(value ?? 0)),
                      String(name),
                    ]}
                  />
                  {providers.map((provider) => (
                    <Bar
                      key={provider.provider}
                      dataKey={provider.provider}
                      stackId="usage"
                      fill={getProviderColor(provider.provider)}
                      radius={0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {providers.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {providers.map((provider) => (
                <li key={provider.provider} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: getProviderColor(provider.provider) }}
                  />
                  {provider.provider}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>

      <LimitsSection providerNames={providers.map((p) => p.provider.toLowerCase())} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={t('analytics.byModel')}>
          <Panel>
            {data && data.byModel.length > 0 ? (
              <ul className="divide-y divide-border">
                {[...data.byModel]
                  .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
                  .slice(0, 8)
                  .map((row) => (
                    <li
                      key={`${row.provider}:${row.model}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: getProviderColor(row.provider) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{row.model ?? 'unknown'}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMetric(metric, metricValue(row, metric))}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t('analytics.noUsageYet')}</p>
            )}
          </Panel>
        </Section>

        <Section title={t('analytics.topSessions')}>
          <Panel>
            {data && data.bySession.length > 0 ? (
              <ul className="divide-y divide-border">
                {[...data.bySession]
                  .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
                  .slice(0, 8)
                  .map((row) => (
                    <li key={row.session_id}>
                      <Link
                        to={paths.session(row.session_id)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {row.session_name || row.session_id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(row.last_active)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMetric(metric, metricValue(row, metric))}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t('analytics.noSessionsYet')}</p>
            )}
          </Panel>
        </Section>
      </div>

      {data && data.pricingAudit.unpricedTokens > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatNumber(data.pricingAudit.unpricedTokens)} tokens come from models without a price (
          {data.pricingAudit.missingPricingModels.map((m) => m.model).join(', ')}); they count in
          tokens but not in spend.
        </p>
      )}
    </Page>
  );
}

/** Quota windows of the agents that report them (5 hour, weekly…). */
function LimitsSection({ providerNames }: { providerNames: string[] }) {
  const { t } = useI18n();
  const { usable } = useCliProviders();
  const known = new Set([...usable.map((p) => p.id as string), ...providerNames]);
  const trackers = USAGE_PROVIDERS.filter((tracker) => known.has(tracker));

  const results = useQueries({
    queries: trackers.map((tracker) => ({
      queryKey: ['usage-limits', tracker],
      queryFn: async () => {
        const response = await api.get<UsageLimitsResponse>(
          `/api/usage/limits?provider=${tracker}`
        );
        return response.data;
      },
      staleTime: 5 * 60_000,
      refetchInterval: 15 * 60_000,
      retry: 1,
    })),
  });

  const entries = results
    .map((result, index) => ({ tracker: trackers[index]!, response: result.data }))
    .filter((entry) => entry.response?.success && entry.response.supported && entry.response.data);

  if (entries.length === 0) return null;

  return (
    <Section title={t('analytics.limits')} description={t('analytics.limitsDescription')}>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(({ tracker, response }) => {
          const windows = limitWindows(response!.provider, response!.data!);
          return (
            <Panel key={tracker} className="space-y-3 p-4">
              <p className="text-sm font-medium">{USAGE_PROVIDER_LABELS[tracker]}</p>
              {windows.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('analytics.noQuotaWindows')}</p>
              )}
              {windows.map((window) => {
                const used = Math.max(0, Math.min(100, window.utilization));
                return (
                  <div key={window.key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span>{window.title}</span>
                      <span className="tabular-nums text-muted-foreground">{used.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          used >= 90 ? 'bg-destructive' : used >= 70 ? 'bg-warning' : 'bg-brand'
                        )}
                        style={{ width: `${used}%` }}
                      />
                    </div>
                    {window.resetsAt && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('analytics.resets')} {formatResetDelta(window.resetsAt)}
                      </p>
                    )}
                  </div>
                );
              })}
            </Panel>
          );
        })}
      </div>
    </Section>
  );
}
