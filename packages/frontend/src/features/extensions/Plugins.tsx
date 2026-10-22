import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Puzzle, Search, Store, Trash2 } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MarketplaceBrowserDialog } from '@/components/ui/marketplace-browser';
import { PluginEditorDialog } from '@/components/ui/plugin-editor';
import { toast } from '@/hooks/use-toast';
import { Panel, Section } from '@/features/shell/Page';
import { useCliProviders } from '@/features/agents/useCliProviders';

const PROVIDER = 'claude';
const withProvider = (endpoint: string) =>
  `${endpoint}${endpoint.includes('?') ? '&' : '?'}provider=${PROVIDER}`;

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  category?: string;
  dirPath: string;
  source: 'user' | 'marketplace';
  enabled: boolean;
  marketplace?: string;
}

interface CodexPlugin {
  id: string;
  name: string;
  marketplace: string;
  displayName: string;
  description: string;
  enabled: boolean;
  installed: boolean;
}

function errorToast(title: string) {
  return (error: Error) => toast({ title, description: error.message, variant: 'destructive' });
}

function EmptyNote({ children }: { children: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Plugins() {
  const { usable } = useCliProviders();
  return (
    <>
      <ClaudePlugins />
      {usable.some((agent) => agent.id === 'codex') && <CodexPlugins />}
    </>
  );
}

function ClaudePlugins() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [browseOpen, setBrowseOpen] = useState(false);
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    name?: string;
    plugin?: PluginInfo;
  } | null>(null);

  const plugins = useQuery({
    queryKey: ['installed-plugins', PROVIDER],
    queryFn: async () =>
      (await api.get<ApiResponse<PluginInfo[]>>(withProvider('/api/claude-config/plugins'))).data
        .data ?? [],
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['installed-plugins', PROVIDER] });

  const toggle = useMutation({
    mutationFn: async (name: string) =>
      api.put(withProvider(`/api/claude-config/plugin/${name}/toggle`)),
    onSuccess: refresh,
    onError: errorToast('Could not change the plugin'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      api.delete(withProvider(`/api/claude-config/plugin/${encodeURIComponent(id)}`)),
    onSuccess: refresh,
    onError: errorToast('Could not remove the plugin'),
  });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (plugins.data ?? []).filter(
      (plugin) =>
        !needle ||
        `${plugin.name} ${plugin.description} ${plugin.category ?? ''}`
          .toLowerCase()
          .includes(needle)
    );
  }, [plugins.data, query]);

  return (
    <Section
      title="Plugins"
      description="Commands, agents and tools packaged together."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBrowseOpen(true)}>
            <Store className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Browse
          </Button>
          <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Create
          </Button>
        </div>
      }
    >
      {(plugins.data?.length ?? 0) > 4 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plugins"
            aria-label="Search plugins"
            className="pl-9"
          />
        </div>
      )}
      <Panel>
        {plugins.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyNote>{query ? 'No plugin matches.' : 'No plugins installed.'}</EmptyNote>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((plugin) => {
              const isUser = plugin.source === 'user';
              const baseName = isUser
                ? plugin.dirPath.split('/').pop()?.replace('.disabled', '') || plugin.name
                : plugin.name;
              return (
                <li key={plugin.id} className="flex items-center gap-3 px-4 py-3">
                  <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {plugin.name}{' '}
                      <span className="font-normal text-muted-foreground">v{plugin.version}</span>
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {plugin.description || 'No description'}
                      {!isUser && plugin.marketplace ? ` · @${plugin.marketplace}` : ''}
                    </p>
                  </div>
                  {isUser && (
                    <>
                      <Switch
                        checked={plugin.enabled}
                        onCheckedChange={() => toggle.mutate(baseName)}
                        aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${plugin.name}`}
                        onClick={() => setEditor({ mode: 'edit', name: baseName, plugin })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Uninstall ${plugin.name}`}
                    onClick={() => remove.mutate(plugin.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <PluginEditorDialog
        open={!!editor}
        onOpenChange={(open) => !open && setEditor(null)}
        mode={editor?.mode ?? 'create'}
        editName={editor?.name}
        initialData={
          editor?.plugin && {
            name: editor.plugin.name,
            description: editor.plugin.description,
            version: editor.plugin.version,
            author: editor.plugin.author,
            category: editor.plugin.category,
            content: '', // fetched by the editor
          }
        }
        configProvider={PROVIDER}
      />
      <MarketplaceBrowserDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        configProvider={PROVIDER}
      />
    </Section>
  );
}

function CodexPlugins() {
  const queryClient = useQueryClient();
  const [browseOpen, setBrowseOpen] = useState(false);
  const plugins = useQuery({
    queryKey: ['codex-plugins'],
    queryFn: async () =>
      (await api.get<ApiResponse<CodexPlugin[]>>('/api/codex/plugins')).data.data ?? [],
  });
  const change = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/api/codex/plugins/${encodeURIComponent(id)}`, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['codex-plugins'] });
      toast({ title: 'New Codex sessions will load the updated plugins.' });
    },
    onError: errorToast('Could not change the plugin'),
  });

  const enabled = (plugins.data ?? []).filter((p) => p.enabled);

  return (
    <Section
      title="Codex plugins"
      description="OpenAI's curated plugins; they apply to new Codex sessions."
      actions={
        <Button variant="outline" size="sm" onClick={() => setBrowseOpen(true)}>
          <Store className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Marketplace
        </Button>
      }
    >
      <Panel>
        {plugins.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : enabled.length === 0 ? (
          <EmptyNote>No Codex plugin is on. Open the marketplace to add one.</EmptyNote>
        ) : (
          <ul className="divide-y divide-border">
            {enabled.map((plugin) => (
              <li key={plugin.id} className="flex items-center gap-3 px-4 py-3">
                <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{plugin.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {plugin.name}@{plugin.marketplace}
                  </p>
                </div>
                <Switch
                  checked
                  onCheckedChange={() => change.mutate({ id: plugin.id, enabled: false })}
                  aria-label={`Disable ${plugin.displayName}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <MarketplaceBrowserDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        configProvider="codex"
      />
    </Section>
  );
}
