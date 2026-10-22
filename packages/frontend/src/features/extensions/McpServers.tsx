import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, Plus, Server, Trash2, XCircle, Zap } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Panel, Section } from '@/features/shell/Page';
import { cn } from '@/lib/utils';
import { Field } from '@/features/settings/primitives';

interface McpServer {
  id: string;
  name: string;
  type: 'subprocess' | 'sse';
  command?: string;
  url?: string;
  readOnly?: boolean;
}

type TestState = { testing: boolean; connected?: boolean; error?: string };

const EMPTY = { name: '', type: 'subprocess' as McpServer['type'], command: '', url: '' };

function errorToast(title: string) {
  return (error: Error) => toast({ title, description: error.message, variant: 'destructive' });
}

/** Model Context Protocol servers the agents can call. */
export function McpServers() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const servers = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: async () =>
      (await api.get<ApiResponse<McpServer[]>>('/api/mcp-servers')).data.data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => api.post('/api/mcp-servers', draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      setAdding(false);
      setDraft(EMPTY);
    },
    onError: errorToast('Could not add the server'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/mcp-servers/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] }),
    onError: errorToast('Could not remove the server'),
  });

  const test = async (id: string) => {
    setTests((current) => ({ ...current, [id]: { testing: true } }));
    try {
      const response = await api.post<ApiResponse<{ connected: boolean; error?: string }>>(
        `/api/mcp-servers/${id}/test`
      );
      const result = response.data.data;
      setTests((current) => ({
        ...current,
        [id]: { testing: false, connected: result?.connected, error: result?.error },
      }));
    } catch (error) {
      setTests((current) => ({
        ...current,
        [id]: {
          testing: false,
          connected: false,
          error: error instanceof Error ? error.message : 'Test failed',
        },
      }));
    }
  };

  const valid =
    draft.name.trim() !== '' && (draft.type === 'subprocess' ? draft.command : draft.url) !== '';

  return (
    <Section
      title="MCP servers"
      description="Tools and data the agents can reach."
      actions={
        !adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add
          </Button>
        )
      }
    >
      {adding && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <Panel className="divide-y divide-border">
            <Field label="Name" htmlFor="mcp-name">
              <Input
                id="mcp-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="filesystem"
                autoFocus
              />
            </Field>
            <Field label="Type" htmlFor="mcp-type">
              <select
                id="mcp-type"
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value as McpServer['type'] })
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="subprocess">Command (runs on this machine)</option>
                <option value="sse">URL (server-sent events)</option>
              </select>
            </Field>
            {draft.type === 'subprocess' ? (
              <Field label="Command" htmlFor="mcp-command">
                <Input
                  id="mcp-command"
                  className="font-mono text-sm"
                  value={draft.command}
                  onChange={(event) => setDraft({ ...draft, command: event.target.value })}
                  placeholder="pnpm dlx @modelcontextprotocol/server-filesystem /path"
                />
              </Field>
            ) : (
              <Field label="URL" htmlFor="mcp-url">
                <Input
                  id="mcp-url"
                  className="font-mono text-sm"
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                  placeholder="https://example.com/mcp/sse"
                />
              </Field>
            )}
            <div className="flex justify-end gap-2 px-4 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!valid || create.isPending}>
                {create.isPending ? 'Adding…' : 'Add server'}
              </Button>
            </div>
          </Panel>
        </form>
      )}

      <Panel>
        {servers.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : (servers.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Server className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No MCP servers yet</p>
            <p className="text-xs text-muted-foreground">Add one to give the agents new tools.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {servers.data!.map((server) => {
              const state = tests[server.id];
              return (
                <li key={server.id} className="group flex items-center gap-3 px-4 py-3">
                  {state?.testing ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : state?.connected === true ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-success"
                      aria-label="Connected"
                    />
                  ) : state?.connected === false ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="Failed" />
                  ) : (
                    <Server className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {server.name}
                      {server.readOnly && (
                        <Lock className="h-3 w-3 text-muted-foreground" aria-label="Global" />
                      )}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {server.type === 'subprocess' ? server.command : server.url}
                    </p>
                    {state?.error && (
                      <p className="truncate text-xs text-destructive">{state.error}</p>
                    )}
                  </div>
                  <div
                    className={cn(
                      'flex shrink-0 gap-1',
                      '[@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void test(server.id)}
                      disabled={state?.testing}
                    >
                      <Zap className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Test
                    </Button>
                    {!server.readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${server.name}`}
                        onClick={() => remove.mutate(server.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </Section>
  );
}
