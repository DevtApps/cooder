import { useSessionStore } from '@/stores/sessionStore';
import type { ToolContext } from '@/features/workspace/tools';
import { ToolLogPanel } from './ToolLogPanel';

const NONE: never[] = [];

/** Reads the session's tool runs from the store for the log panel. */
export function ToolLogContainer({ sessionId }: ToolContext) {
  const executions = useSessionStore((s) => s.toolExecutions[sessionId] ?? NONE);
  return <ToolLogPanel executions={executions} className="h-full" />;
}
