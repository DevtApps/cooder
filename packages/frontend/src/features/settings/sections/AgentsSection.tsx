import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { ApiResponse, CLIProvider, UserSettings } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { CliDeviceLoginDialog } from '@/features/agents/CliDeviceLoginDialog';
import { AgentInstallList } from '@/features/agents/AgentInstallList';
import { ProviderLoginsPanel } from '@/features/agents/ProviderLoginsPanel';
import { CliSubagentsSection } from '@/features/agents/CliSubagentsSection';
import { SubagentUpstreamsSection } from '@/features/agents/SubagentUpstreamsSection';
import { modelLabel, useCliProviders } from '@/features/agents/useCliProviders';
import { CLI_PROVIDER_LABEL } from '@/lib/providers';
import { Section } from '@/features/shell/Page';
import { SettingGroup, SettingRow, SwitchRow } from '../primitives';
import { useUserSettings } from '../useUserSettings';

interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  authMode: 'chatgpt' | 'api-key' | 'none';
  configHome: string;
}

interface CodexFeature {
  name: string;
  stage: string;
  enabled: boolean;
}

const selectClass =
  'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const WEB_SEARCH: Array<{ value: NonNullable<UserSettings['codexWebSearch']>; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'cached', label: 'Cached' },
  { value: 'live', label: 'Live' },
  { value: 'disabled', label: 'Disabled' },
];

export function AgentsSection() {
  const { settings, update } = useUserSettings();
  const { providers, usable } = useCliProviders();

  const enabled = new Set(settings?.enabledCliProviders ?? providers.map((p) => p.id));
  const toggleEnabled = (id: CLIProvider, on: boolean) => {
    const next = new Set(enabled);
    if (on) next.add(id);
    else next.delete(id);
    if (next.size === 0) {
      toast({ title: 'Keep at least one agent on', variant: 'destructive' });
      return;
    }
    update.mutate({ enabledCliProviders: [...next] });
  };

  return (
    <>
      <SettingGroup
        title="Installed agents"
        description="Agents live in Cooder's own folder, apart from CLIs already on this computer."
      >
        <AgentInstallList />
      </SettingGroup>

      <Section title="Sign in" description="Each agent signs in its own way.">
        <ProviderLoginsPanel />
      </Section>

      {usable.length > 0 && (
        <SettingGroup title="Defaults">
          <SettingRow
            title="Default agent"
            description="Used when you start a session without choosing."
          >
            <select
              aria-label="Default agent"
              className={selectClass}
              value={settings?.defaultCliProvider ?? usable[0]!.id}
              onChange={(event) =>
                update.mutate({ defaultCliProvider: event.target.value as CLIProvider })
              }
            >
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </SettingRow>
          {usable.map((agent) => (
            <SettingRow key={agent.id} title={`${agent.name} model`}>
              <select
                aria-label={`${agent.name} default model`}
                className={`${selectClass} max-w-[14rem]`}
                value={settings?.cliProviderModels?.[agent.id] ?? ''}
                onChange={(event) =>
                  update.mutate({
                    cliProviderModels: {
                      ...settings?.cliProviderModels,
                      [agent.id]: event.target.value,
                    },
                  })
                }
              >
                <option value="">
                  Default{agent.defaultModel ? ` (${modelLabel(agent, agent.defaultModel)})` : ''}
                </option>
                {(agent.models ?? []).map((model) => (
                  <option key={model} value={model}>
                    {modelLabel(agent, model)}
                  </option>
                ))}
              </select>
            </SettingRow>
          ))}
        </SettingGroup>
      )}

      {providers.filter((provider) => provider.configured).length > 1 && (
        <SettingGroup title="Show in menus" description="Turn off agents you do not use.">
          {providers
            .filter((agent) => agent.configured)
            .map((agent) => (
              <SwitchRow
                key={agent.id}
                title={agent.name || CLI_PROVIDER_LABEL[agent.id]}
                checked={enabled.has(agent.id)}
                disabled={update.isPending}
                onChange={(on) => toggleEnabled(agent.id, on)}
              />
            ))}
        </SettingGroup>
      )}

      {usable.some((agent) => agent.id === 'codex') && <CodexSettings />}

      <Section title="Subagents" description="Models and CLIs the agents hand work to.">
        <SubagentUpstreamsSection />
        <CliSubagentsSection />
      </Section>
    </>
  );
}

function CodexSettings() {
  const queryClient = useQueryClient();
  const { settings, update } = useUserSettings();

  const status = useQuery({
    queryKey: ['codex-status'],
    queryFn: async () => (await api.get<ApiResponse<CodexStatus>>('/api/codex/status')).data.data,
  });
  const features = useQuery({
    queryKey: ['codex-features'],
    queryFn: async () =>
      (await api.get<ApiResponse<CodexFeature[]>>('/api/codex/features')).data.data ?? [],
  });
  const toggle = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.post(`/api/codex/features/${encodeURIComponent(name)}`, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['codex-features'] }),
    onError: (error: Error) =>
      toast({
        title: 'Could not change the feature',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const shown = (features.data ?? []).filter(
    (f) => f.stage !== 'removed' && f.stage !== 'deprecated'
  );

  return (
    <>
      <SettingGroup title="Codex">
        <SettingRow
          title="Account"
          description={
            status.data?.installed
              ? `${status.data.version ?? 'Installed'} · ${status.data.configHome}`
              : 'Codex is not installed.'
          }
        >
          <CliDeviceLoginDialog
            provider="codex"
            authenticated={status.data?.authenticated}
            disabled={!status.data?.installed}
            onCompleted={() => void status.refetch()}
          />
        </SettingRow>
        <SettingRow
          title="Web search"
          description="Applied to the next Codex turn through its web_search setting."
        >
          <select
            aria-label="Web search"
            className={selectClass}
            value={settings?.codexWebSearch ?? 'auto'}
            onChange={(event) =>
              update.mutate({
                codexWebSearch: event.target.value as UserSettings['codexWebSearch'],
              })
            }
          >
            {WEB_SEARCH.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title="Codex features"
        description="Saved to Codex's own config; start a new session after changing them."
      >
        {features.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No features reported.</p>
        ) : (
          shown
            .slice(0, 40)
            .map((feature) => (
              <SwitchRow
                key={feature.name}
                title={feature.name}
                description={feature.stage}
                checked={feature.enabled}
                disabled={toggle.isPending}
                onChange={(enabled) => toggle.mutate({ name: feature.name, enabled })}
              />
            ))
        )}
      </SettingGroup>
    </>
  );
}
