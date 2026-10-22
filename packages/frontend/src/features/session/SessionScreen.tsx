import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  Brain,
  Folder,
  Gauge,
  GitCompare,
  Globe,
  ListChecks,
  Loader2,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AgentPicker } from '@/features/chat/AgentPicker';
import { ModePicker } from '@/features/chat/ModePicker';
import { UsageLimitsPopover } from '@/features/chat/UsageLimitsPopover';
import { useSlashCommands } from '@/features/commands/useSlashCommands';
import { SessionMenu } from './SessionMenu';
import { Composer } from '@/features/chat/Composer';
import { OutboxBanner } from '@/features/chat/OutboxBanner';
import { Thread } from '@/features/chat/Thread';
import { ApprovalCard, QuestionCard } from '@/features/chat/PromptCards';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { WorkspacePanel } from '@/features/workspace/WorkspacePanel';
import { socketService } from '@/services/socket';
import { useProcesses } from '@/features/workspace/useProcesses';
import { useWorkspaceStore, type WorkspaceTab } from '@/features/workspace/workspaceStore';
import { useQueryClient } from '@tanstack/react-query';
import { projectName } from '@/features/shell/useSessions';
import { useSessionConversation } from './useSessionConversation';
import { useI18n, type TranslationKey } from '@/lib/i18n';

function agentError(error: unknown, title: string) {
  toast({
    title,
    description: error instanceof Error ? error.message : undefined,
    variant: 'destructive',
  });
}

const PANEL_BUTTONS: Array<{ tab: WorkspaceTab; labelKey: TranslationKey; Icon: LucideIcon }> = [
  { tab: 'preview', labelKey: 'session.browser', Icon: Globe },
  { tab: 'terminal', labelKey: 'session.terminal', Icon: SquareTerminal },
  { tab: 'runs', labelKey: 'session.runs', Icon: Activity },
  { tab: 'changes', labelKey: 'session.changes', Icon: GitCompare },
  { tab: 'files', labelKey: 'session.files', Icon: Folder },
  { tab: 'context', labelKey: 'session.context', Icon: Gauge },
  { tab: 'memory', labelKey: 'session.memory', Icon: Brain },
  { tab: 'progress', labelKey: 'session.progress', Icon: ListChecks },
];

export function SessionScreen() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const conversation = useSessionConversation(id);
  const slash = useSlashCommands(conversation.session, conversation.usage, {
    current: conversation.mode,
  });
  const { session, isRunning, interrupt } = conversation;
  const threadRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const wide = useMediaQuery('(min-width: 1024px)');
  const {
    open: panelOpen,
    tab: panelTab,
    setOpen: togglePanel,
    show: showTab,
    expanded,
  } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const runningCount = (useProcesses(id ?? '').data ?? []).filter(
    (p) => p.status === 'running'
  ).length;

  // The agent opened or navigated a page: show the browser panel.
  useEffect(() => {
    const socket = socketService.getSocket() as unknown as {
      on: (event: string, handler: () => void) => void;
      off: (event: string, handler: () => void) => void;
    } | null;
    if (!socket) return;
    const show = () => useWorkspaceStore.getState().show('preview');
    socket.on('browser:show', show);
    return () => socket.off('browser:show', show);
  }, [id]);

  // Bring a search hit into view once its window is loaded.
  const { highlightId, timeline, firstItemIndex } = conversation;
  useEffect(() => {
    if (!highlightId) return;
    const index = timeline.findIndex(
      (item) => item.type === 'message' && item.data.id === highlightId
    );
    if (index >= 0) {
      threadRef.current?.scrollToIndex({ index: firstItemIndex + index, align: 'center' });
    }
  }, [firstItemIndex, highlightId, timeline]);

  // Esc stops the run, like the CLI; not while a dialog or menu has focus.
  useEffect(() => {
    if (!isRunning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      event.preventDefault();
      interrupt();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [interrupt, isRunning]);

  if (!id) return null;

  if (conversation.sessionError || (!conversation.isLoading && !session)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{t('session.couldNotLoad')}</p>
        <button type="button" onClick={conversation.retry} className="text-sm underline">
          {t('session.tryAgain')}
        </button>
      </div>
    );
  }

  const prompts =
    conversation.pendingPermission || conversation.pendingQuestion ? (
      <>
        {conversation.pendingPermission && (
          <ApprovalCard
            permission={conversation.pendingPermission}
            onRespond={conversation.respondToPermission}
          />
        )}
        {conversation.pendingQuestion && (
          <QuestionCard
            question={conversation.pendingQuestion}
            onRespond={conversation.respondToQuestion}
          />
        )}
      </>
    ) : undefined;

  const updateAtBottom = (value: boolean) => {
    setAtBottom(value);
    conversation.setIsAtBottom(value);
  };

  const panel = session && (
    <WorkspacePanel
      session={session}
      isRunning={isRunning}
      todos={conversation.todos}
      runs={conversation.agentRuns}
      usage={conversation.usage}
      tools={{
        sendToChat: (text) => void conversation.send(text),
        sendFiles: (text, files) => void conversation.send(text, files),
        onRestored: () => {
          void queryClient.invalidateQueries({ queryKey: ['messages', id] });
          void queryClient.invalidateQueries({ queryKey: ['session', id] });
        },
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            {session && (
              <>
                <span
                  className="hidden truncate text-muted-foreground sm:inline"
                  title={session.workingDirectory}
                >
                  {projectName(session.workingDirectory)}
                </span>
                <span className="hidden text-muted-foreground sm:inline">/</span>
                <h1 className="truncate font-medium">{session.name}</h1>
              </>
            )}
          </div>
          {session && <SessionMenu session={session} />}
          <div
            className="flex items-center gap-0.5"
            role="toolbar"
            aria-label={t('session.workspace')}
          >
            {PANEL_BUTTONS.map(({ tab, labelKey, Icon }) => {
              const label = t(labelKey);
              const active = panelOpen && panelTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => (active ? togglePanel(false) : showTab(tab))}
                  aria-pressed={active}
                  aria-label={label}
                  title={label}
                  className={cn(
                    'rounded-md p-1.5 transition-colors hover:bg-accent',
                    active
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="relative block">
                    <Icon className="h-4 w-4" />
                    {tab === 'runs' && runningCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-success px-1 text-[9px] font-semibold leading-none text-success-foreground">
                        {runningCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {conversation.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            </div>
          ) : (
            <Thread
              ref={threadRef}
              sessionId={id}
              items={conversation.timeline}
              firstItemIndex={conversation.firstItemIndex}
              hasOlder={conversation.hasOlder}
              isLoadingOlder={conversation.isLoadingOlder}
              olderError={conversation.olderError}
              onLoadOlder={conversation.loadOlder}
              onAtBottomChange={updateAtBottom}
              activity={conversation.activity}
              isRunning={isRunning}
              prompts={prompts}
              highlightId={conversation.highlightId}
            />
          )}
          {conversation.windowMode && (
            <div className="absolute inset-x-0 top-2 flex justify-center">
              <button
                type="button"
                onClick={() => void conversation.backToLatest()}
                className="rounded-full border border-border bg-field px-3 py-1 text-xs shadow-sm hover:bg-accent"
              >
                {t('session.showingEarlier')}
              </button>
            </div>
          )}
          {!atBottom && (
            <button
              type="button"
              onClick={() =>
                threadRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' })
              }
              className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-field text-muted-foreground shadow-sm hover:text-foreground"
              aria-label={t('session.scrollLatest')}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 sm:px-6">
          <OutboxBanner sessionId={id} />
          <Composer
            key={id}
            draftKey={`cooder-next:draft:${id}`}
            onSend={(text, files) => conversation.send(text, files)}
            trailing={session && <UsageLimitsPopover provider={session.cliProvider} />}
            commands={slash.commands}
            onCommand={(input) => void slash.execute(input)}
            onInterrupt={interrupt}
            isRunning={isRunning}
            activeFollowupMode={session?.cliProvider === 'opencode' ? 'steer' : 'queue'}
            queueDepth={conversation.queueDepth}
            autoFocus
            controls={
              session && (
                <>
                  <AgentPicker
                    provider={session.cliProvider}
                    model={session.cliModel}
                    onChange={(provider, model) =>
                      void conversation
                        .setAgent(provider, model)
                        .catch((error) => agentError(error, t('errors.couldNotSave')))
                    }
                    disabled={isRunning}
                  />
                  <ModePicker mode={conversation.mode} onChange={conversation.setMode} />
                </>
              )
            }
          />
        </div>
      </div>
      {panelOpen &&
        (wide ? (
          <aside
            className={cn(
              'shrink-0 border-l border-border bg-sidebar transition-[width]',
              expanded ? 'w-[min(720px,52vw)]' : 'w-[360px]'
            )}
          >
            {panel}
          </aside>
        ) : (
          <Sheet open onOpenChange={togglePanel}>
            <SheetContent
              side="right"
              title={t('session.workspace')}
              className="w-[92vw] max-w-sm bg-sidebar p-0"
            >
              {panel}
            </SheetContent>
          </Sheet>
        ))}
    </div>
  );
}
