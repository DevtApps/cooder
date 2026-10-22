import { Check, Circle, Loader2 } from 'lucide-react';
import type { SubagentRun } from '@plum-code-webui/shared';
import type { TodoItem } from '@/stores/sessionStore';
import { cn } from '@/lib/utils';

function TodoRow({ todo }: { todo: TodoItem }) {
  const done = todo.status === 'completed';
  const active = todo.status === 'in_progress';
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-label="Done" />
      ) : active ? (
        <Loader2
          className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-brand"
          aria-label="In progress"
        />
      ) : (
        <Circle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-label="Pending"
        />
      )}
      <span className={cn(done && 'text-muted-foreground line-through')}>
        {active && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </li>
  );
}

function statusLabel(run: SubagentRun): string {
  if (run.status === 'started') return run.activitySummary || 'working';
  return run.status === 'completed' ? 'done' : run.status;
}

/** What the agent is planning and which helpers it has running. */
export function ProgressTab({ todos, runs }: { todos: TodoItem[]; runs: SubagentRun[] }) {
  const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <h3 className="text-xs font-medium">Plan</h3>
        {todos.length === 0 ? (
          <p className="text-xs text-muted-foreground">The agent has not made a plan yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {todos.map((todo, index) => (
              <TodoRow key={`${index}-${todo.content}`} todo={todo} />
            ))}
          </ul>
        )}
      </section>

      {sorted.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium">Subagents</h3>
          <ul className="space-y-2">
            {sorted.map((run) => (
              <li key={run.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {run.status === 'started' && (
                    <Loader2 className="h-3 w-3 animate-spin text-brand" aria-hidden />
                  )}
                  <span className="font-medium">{run.agentType}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{statusLabel(run)}</span>
                </div>
                {run.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {run.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
