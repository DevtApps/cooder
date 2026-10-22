import { Suspense } from 'react';
import { ArrowLeft, Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import type { Session, SubagentRun, UsageSnapshot } from '@plum-code-webui/shared';
import type { TodoItem } from '@/stores/sessionStore';
import { ChangesTab } from './ChangesTab';
import { ContextTab } from './ContextTab';
import { FilesTab } from './FilesTab';
import { ProgressTab } from './ProgressTab';
import { RunsTab } from './RunsTab';
import { TerminalTab } from './TerminalTab';
import { TOOLS_BY_TAB, type ToolContext } from './tools';
import { useWorkspaceStore, type CoreTab } from './workspaceStore';

const CORE: Array<{ value: CoreTab; label: string }> = [
  { value: 'progress', label: 'Progress' },
  { value: 'changes', label: 'Changes' },
  { value: 'files', label: 'Files' },
  { value: 'context', label: 'Context' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'runs', label: 'Runs' },
];

interface WorkspacePanelProps {
  session: Session;
  isRunning: boolean;
  todos: TodoItem[];
  runs: SubagentRun[];
  usage?: UsageSnapshot;
  tools: Pick<ToolContext, 'sendToChat' | 'sendFiles' | 'onRestored'>;
}

/** Right-hand panel of a session: plan, changes, files, context and tools. */
export function WorkspacePanel({
  session,
  isRunning,
  todos,
  runs,
  usage,
  tools,
}: WorkspacePanelProps) {
  const { tab, setTab, setOpen, expanded, setExpanded } = useWorkspaceStore();
  const tool = TOOLS_BY_TAB.get(tab as never);
  const ToolPanel = tool?.Panel;
  const context: ToolContext = {
    sessionId: session.id,
    workingDirectory: session.workingDirectory,
    ...tools,
  };

  const label = tool?.label ?? CORE.find((i) => i.value === tab)?.label;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        {tab !== 'preview' && (
          <button
            type="button"
            onClick={() => setTab('preview')}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back to the browser"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{label}</h2>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:block"
          aria-label={expanded ? 'Narrow the panel' : 'Widen the panel'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        role="tabpanel"
        className={
          tab === 'terminal' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-y-auto'
        }
      >
        {tab === 'terminal' && <TerminalTab sessionId={session.id} />}
        {tab === 'runs' && <RunsTab sessionId={session.id} />}
        {tab === 'progress' && <ProgressTab todos={todos} runs={runs} />}
        {tab === 'changes' && <ChangesTab cwd={session.workingDirectory} isRunning={isRunning} />}
        {tab === 'files' && <FilesTab cwd={session.workingDirectory} />}
        {tab === 'context' && <ContextTab session={session} usage={usage} />}
        {ToolPanel && (
          <Suspense
            fallback={
              <div className="flex justify-center py-10">
                <Loader2
                  className="h-5 w-5 animate-spin text-muted-foreground"
                  aria-label="Loading"
                />
              </div>
            }
          >
            <ToolPanel {...context} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
