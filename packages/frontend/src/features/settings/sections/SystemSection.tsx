import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type {
  ApiResponse,
  CLIProvider,
  CliProviderUpdateResponse,
  CliProviderUpdateResult,
} from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { CLI_PROVIDER_LABEL } from '@/lib/providers';
import { Panel, Section } from '@/features/shell/Page';
import { cn } from '@/lib/utils';
import { SettingGroup, SettingRow } from '../primitives';
import { useI18n } from '@/lib/i18n';

interface Diagnostic {
  id: CLIProvider;
  name: string;
  command: string;
  binaryPath: string | null;
  installed: boolean;
  version: string | null;
  credentialsPath: string;
  authenticated: boolean;
  defaultModel: string | null;
  modelCount: number;
  mcpServerCount: number;
  codexModelsCache: { exists: boolean; modelCount: number } | null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-mono" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function SystemSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<CliProviderUpdateResult[] | null>(null);

  const diagnostics = useQuery({
    queryKey: ['provider-diagnostics'],
    queryFn: async () =>
      (await api.get<ApiResponse<Diagnostic[]>>('/api/cli-providers/diagnostics')).data.data ?? [],
  });

  const update = useMutation({
    mutationFn: async () =>
      (await api.post<ApiResponse<CliProviderUpdateResponse>>('/api/cli-providers/update', {})).data
        .data?.results ?? [],
    onSuccess: (data) => {
      setResults(data);
      void queryClient.invalidateQueries({ queryKey: ['provider-diagnostics'] });
      void queryClient.invalidateQueries({ queryKey: ['cli-providers'] });
    },
    onError: (error: Error) =>
      toast({
        title: t('system.updateFailed'),
        description: error.message,
        variant: 'destructive',
      }),
  });

  return (
    <>
      <Section
        title={t('system.agentDiagnostics')}
        description={t('system.agentDiagnosticsDescription')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void diagnostics.refetch()}
            disabled={diagnostics.isFetching}
          >
            <RefreshCw
              className={cn('mr-1.5 h-3.5 w-3.5', diagnostics.isFetching && 'animate-spin')}
              aria-hidden
            />
            {t('common.refresh')}
          </Button>
        }
      >
        {diagnostics.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-label={t('common.loading')}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(diagnostics.data ?? []).map((agent) => {
              const ready = agent.installed && agent.authenticated;
              return (
                <Panel key={agent.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.version ||
                          (agent.installed ? agent.command : t('system.notInstalled'))}
                      </p>
                    </div>
                    {ready ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-success"
                        aria-label={t('common.ready')}
                      />
                    ) : (
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-warning"
                        aria-label={t('common.needsAttention')}
                      />
                    )}
                  </div>
                  <dl className="space-y-1">
                    <Detail label={t('system.binary')} value={agent.binaryPath || 'not found'} />
                    <Detail label={t('system.credentials')} value={agent.credentialsPath} />
                    <Detail
                      label={t('system.models')}
                      value={`${agent.modelCount} · ${t('system.default')} ${agent.defaultModel || 'auto'}`}
                    />
                    <Detail label={t('system.mcpServers')} value={String(agent.mcpServerCount)} />
                  </dl>
                </Panel>
              );
            })}
          </div>
        )}
      </Section>

      <SettingGroup title={t('system.updates')}>
        <SettingRow
          title={t('system.updateAgents')}
          description={t('system.updateAgentsDescription')}
        >
          <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {update.isPending ? t('system.updating') : t('common.updateNow')}
          </Button>
        </SettingRow>
        {results && (
          <div className="space-y-2 px-4 py-3">
            {results.map((result) => (
              <div key={result.provider} className="flex items-center justify-between text-sm">
                <span>{CLI_PROVIDER_LABEL[result.provider]}</span>
                <span
                  className={cn(
                    'text-xs',
                    result.status === 'updated' ? 'text-success' : 'text-destructive'
                  )}
                >
                  {result.status}
                </span>
              </div>
            ))}
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs">
              {results
                .map((r) => `# ${CLI_PROVIDER_LABEL[r.provider]}\n${r.output || 'No output.'}`)
                .join('\n\n')}
            </pre>
          </div>
        )}
      </SettingGroup>
    </>
  );
}
