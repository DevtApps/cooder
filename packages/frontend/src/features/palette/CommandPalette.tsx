import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Brain,
  Download,
  FolderOpen,
  Hand,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { SessionMode } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { socketService } from '@/services/socket';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionStore } from '@/stores/sessionStore';
import { useCommandPaletteStore } from '@/stores/commandPaletteStore';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { paths } from '@/features/shell/paths';
import { useSessions } from '@/features/shell/useSessions';
import { useSessionActions, useSessionDialogs } from '@/features/session/sessionActions';
import { TOOLS } from '@/features/workspace/tools';
import { useWorkspaceStore, type CoreTab } from '@/features/workspace/workspaceStore';

interface MessageHit {
  id: string;
  sessionId: string;
  chatId?: string | null;
  snippet?: string;
  content: string;
  sessionName?: string;
  jump?: { sessionId: string; chatId: string | null; messageId: string };
}

const SECTIONS = [
  ['appearance', 'Appearance'],
  ['workspace', 'Workspace'],
  ['agents', 'Agents'],
  ['extensions', 'Extensions'],
  ['integrations', 'Integrations'],
  ['usage', 'Usage alerts'],
  ['security', 'Security'],
  ['system', 'System'],
] as const;

const CORE_TABS: Array<[CoreTab, string]> = [
  ['progress', 'Progress'],
  ['changes', 'Changes'],
  ['files', 'Files'],
  ['context', 'Context'],
  ['terminal', 'Terminal'],
  ['runs', 'Runs'],
];

const MODES: Array<[SessionMode, string, LucideIcon]> = [
  ['planning', 'Plan mode', Brain],
  ['auto-accept', 'Auto mode', ShieldCheck],
  ['manual', 'Ask before acting', Hand],
  ['danger', 'YOLO mode', Zap],
];

const MIN_QUERY = 2;

/** Ctrl+K: go anywhere, act on the open session, search every message. */
export function CommandPalette() {
  const { open, setOpen } = useCommandPaletteStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { sessions } = useSessions();
  const actions = useSessionActions();
  const { askRename, askRemove } = useSessionDialogs();
  const show = useWorkspaceStore((s) => s.show);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 250);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        useCommandPaletteStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const activeId = location.pathname.match(/\/session\/([^/]+)/)?.[1] ?? null;
  const active = activeId ? sessions.find((s) => s.id === activeId) : undefined;
  const running = useSessionStore((s) => (activeId ? Boolean(s.lifecycle[activeId]?.busy) : false));

  const hits = useQuery({
    queryKey: ['palette-messages', debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced, limit: '8' });
      const response = await api.get<{ success: boolean; data?: MessageHit[] }>(
        `/api/sessions/messages/search?${params}`
      );
      return response.data.data ?? [];
    },
    enabled: open && debounced.length >= MIN_QUERY,
    staleTime: 30_000,
  });

  const recents = useMemo(() => sessions.slice(0, 12), [sessions]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const openMessage = (hit: MessageHit) => {
    const target = hit.jump ?? {
      sessionId: hit.sessionId,
      chatId: hit.chatId ?? null,
      messageId: hit.id,
    };
    const params = new URLSearchParams({ message: target.messageId });
    if (target.chatId) params.set('chat', target.chatId);
    navigate(`${paths.session(target.sessionId)}?${params.toString()}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search sessions, actions and messages…"
      />
      <CommandList>
        {!hits.data?.length && <CommandEmpty>Nothing found.</CommandEmpty>}

        {active && (
          <>
            <CommandGroup heading={active.name}>
              {running && (
                <CommandItem onSelect={() => run(() => socketService.interruptSession(active.id))}>
                  <Square className="mr-2 h-4 w-4" /> Stop the agent
                </CommandItem>
              )}
              <CommandItem onSelect={() => run(() => askRename(active))}>
                <Pencil className="mr-2 h-4 w-4" /> Rename session
              </CommandItem>
              <CommandItem onSelect={() => run(() => void actions.toggleStar(active.id))}>
                <Star className="mr-2 h-4 w-4" /> {active.starred ? 'Remove star' : 'Star session'}
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions.restart(active.id))}>
                <RotateCcw className="mr-2 h-4 w-4" /> Restart session
              </CommandItem>
              <CommandItem
                onSelect={() => run(() => void actions.exportMarkdown(active.id, active.name))}
              >
                <Download className="mr-2 h-4 w-4" /> Export as Markdown
              </CommandItem>
              <CommandItem onSelect={() => run(() => askRemove(active))}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete session
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Permission mode">
              {MODES.map(([mode, label, Icon]) => (
                <CommandItem
                  key={mode}
                  value={`mode ${label}`}
                  onSelect={() => run(() => socketService.setSessionMode(active.id, mode))}
                >
                  <Icon className="mr-2 h-4 w-4" /> {label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Panel">
              {CORE_TABS.map(([tab, label]) => (
                <CommandItem
                  key={tab}
                  value={`panel ${label}`}
                  onSelect={() => run(() => show(tab))}
                >
                  <FolderOpen className="mr-2 h-4 w-4" /> {label}
                </CommandItem>
              ))}
              {TOOLS.map((tool) => (
                <CommandItem
                  key={tool.value}
                  value={`tool ${tool.label} ${tool.description}`}
                  onSelect={() => run(() => show(tool.value))}
                >
                  <tool.icon className="mr-2 h-4 w-4" /> {tool.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          <CommandItem
            onSelect={() => run(() => navigate(paths.newSession(active?.workingDirectory)))}
          >
            <Plus className="mr-2 h-4 w-4" /> New session
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate(paths.analytics()))}>
            <BarChart3 className="mr-2 h-4 w-4" /> Analytics
          </CommandItem>
          {SECTIONS.map(([id, label]) => (
            <CommandItem
              key={id}
              value={`settings ${label}`}
              onSelect={() => run(() => navigate(paths.settings(id)))}
            >
              <Settings className="mr-2 h-4 w-4" /> Settings · {label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Sessions">
          {recents.map((session) => (
            <CommandItem
              key={session.id}
              value={`session ${session.name} ${session.workingDirectory}`}
              onSelect={() => run(() => navigate(paths.session(session.id)))}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              <span className="truncate">{session.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {(hits.data?.length ?? 0) > 0 && (
          <CommandGroup heading="Messages" forceMount>
            {hits.data!.map((hit) => (
              <CommandItem
                key={hit.id}
                forceMount
                value={`message ${hit.id} ${query}`}
                onSelect={() => run(() => openMessage(hit))}
                className="items-start"
              >
                <MessageSquare className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-muted-foreground">
                    {hit.sessionName ?? 'Session'}
                  </span>
                  <span className="line-clamp-2 text-sm">{hit.snippet || hit.content}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
