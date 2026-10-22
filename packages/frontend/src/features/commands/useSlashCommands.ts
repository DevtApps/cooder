import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  Command,
  CommandExecutionResult,
  Message,
  Session,
  UsageSnapshot,
} from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { socketService } from '@/services/socket';
import { toast } from '@/hooks/use-toast';
import { useSessionStore } from '@/stores/sessionStore';
import { paths } from '@/features/shell/paths';
import { useWorkspaceStore } from '@/features/workspace/workspaceStore';

/** Old settings tab/section names mapped onto the sections that exist now. */
function settingsSection(tab?: string, section?: string): string {
  const bySection: Record<string, string> = {
    appearance: 'appearance',
    'default-directory': 'workspace',
    'provider-logins': 'agents',
    'active-providers': 'agents',
    'mcp-servers': 'extensions',
    skills: 'extensions',
    plugins: 'extensions',
    'github-token': 'integrations',
    'usage-alerts': 'usage',
    'cli-updates': 'system',
    'provider-diagnostics': 'system',
  };
  if (section && bySection[section]) return bySection[section]!;
  const byTab: Record<string, string> = {
    security: 'security',
    integrations: 'integrations',
    extensions: 'extensions',
    analytics: 'usage',
    diagnostics: 'system',
    admin: 'admin',
    'api-keys': 'agents',
  };
  return (tab && byTab[tab]) || 'agents';
}

export function useSlashCommands(
  session: Session | null,
  usage: UsageSnapshot | undefined,
  mode: { current: string }
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = session?.id;
  const cwd = session?.workingDirectory;

  const list = useQuery({
    queryKey: ['commands', cwd],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Command[]>>(
          `/api/commands?projectPath=${encodeURIComponent(cwd ?? '')}`
        )
      ).data.data ?? [],
    enabled: !!cwd,
    staleTime: 60_000,
  });

  const execute = useCallback(
    async (input: string) => {
      if (!sessionId || !session) return;
      const store = useSessionStore.getState();
      const messages: Message[] = store.messages[sessionId] ?? [];
      const say = (content: string) =>
        store.addMessage(sessionId, {
          id: crypto.randomUUID(),
          sessionId,
          chatId: null,
          role: 'assistant',
          content,
          createdAt: new Date().toISOString(),
        });

      try {
        const response = await api.post<ApiResponse<CommandExecutionResult>>(
          '/api/commands/execute',
          {
            input,
            projectPath: cwd,
            sessionId,
            currentModel: session.cliModel ?? session.runtime?.model ?? undefined,
            provider: session.cliProvider,
            usage: usage && {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadTokens: usage.cacheReadTokens,
              cacheCreationTokens: usage.cacheCreationTokens,
              totalTokens: usage.totalTokens,
              contextWindow: usage.contextWindow,
              contextUsedPercent: usage.contextUsedPercent,
              cost: usage.totalCostUsd,
            },
          }
        );
        const result = response.data.data;
        if (!result) return;
        if (!result.success && result.error) return say(`⚠️ ${result.error}`);
        const data = (result.data ?? {}) as Record<string, unknown>;

        switch (result.action) {
          case 'clear':
            store.setMessages(sessionId, []);
            break;
          case 'send_message':
          case 'forward_to_cli':
            if (result.response) void socketService.sendMessage(sessionId, result.response);
            break;
          case 'open_login':
            window.location.href = `/auth/${encodeURIComponent(
              typeof data.provider === 'string' && data.provider ? data.provider : 'codex'
            )}`;
            break;
          case 'rename_session': {
            const name = typeof data.name === 'string' ? data.name : '';
            if (!name) break;
            await api.put(`/api/sessions/${sessionId}`, { name });
            void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
            void queryClient.invalidateQueries({ queryKey: ['sessions'] });
            toast({ title: `Renamed to "${name}"` });
            break;
          }
          case 'copy_response': {
            const n = typeof data.n === 'number' && data.n > 0 ? data.n : 1;
            const target = messages.filter((m) => m.role === 'assistant').at(-n);
            if (!target?.content) {
              toast({ title: 'No matching response to copy' });
              break;
            }
            await navigator.clipboard.writeText(target.content);
            toast({ title: n > 1 ? `Response #${n} copied` : 'Last response copied' });
            break;
          }
          case 'export_conversation': {
            const filename =
              typeof data.filename === 'string' && data.filename
                ? data.filename
                : `session-${sessionId}-${new Date().toISOString().slice(0, 10)}.txt`;
            const body = messages
              .map((m) => `### ${m.role.toUpperCase()} · ${m.createdAt}\n\n${m.content}\n`)
              .join('\n---\n\n');
            const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast({ title: `Saved ${filename}` });
            break;
          }
          case 'new_session':
            navigate(paths.newSession(cwd));
            break;
          case 'resume_session':
            navigate(paths.home());
            break;
          case 'open_settings':
            navigate(
              paths.settings(
                settingsSection(
                  typeof data.tab === 'string' ? data.tab : undefined,
                  typeof data.section === 'string' ? data.section : undefined
                )
              )
            );
            break;
          case 'open_permissions':
            navigate(paths.settings('security'));
            break;
          case 'open_diff':
            useWorkspaceStore.getState().show('changes');
            break;
          case 'open_feedback':
            window.open(
              'https://github.com/anthropics/claude-code/issues/new',
              '_blank',
              'noopener,noreferrer'
            );
            break;
          case 'show_doctor':
            say(
              [
                '**Diagnostics**',
                '',
                `- Session: \`${sessionId}\``,
                `- Agent: ${session.cliProvider}`,
                `- Model: ${session.runtime?.model || session.cliModel || 'default'}`,
                `- Mode: ${mode.current}`,
                `- Folder: ${cwd ?? 'none'}`,
                `- Messages: ${messages.length}`,
                usage
                  ? `- Usage: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out, $${usage.totalCostUsd.toFixed(4)}`
                  : '- Usage: no data',
              ].join('\n')
            );
            break;
          default:
            if (result.response) say(result.response);
        }
      } catch (error) {
        say(`⚠️ Command failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    },
    [cwd, mode, navigate, queryClient, session, sessionId, usage]
  );

  return { commands: list.data ?? [], execute };
}
