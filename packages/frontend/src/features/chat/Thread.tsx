import { forwardRef, useCallback, useMemo, type ReactNode } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Loader2 } from 'lucide-react';
import type { TimelineItem } from '@/features/session/useSessionConversation';
import type { ActivityState } from '@/stores/sessionStore';
import {
  AssistantMessage,
  GeneratedImageItem,
  StreamingMessage,
  SystemNote,
  UserMessage,
} from './Messages';
import { ToolCall } from './ToolCall';

interface ThreadProps {
  sessionId: string;
  items: TimelineItem[];
  firstItemIndex: number;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
  activity?: ActivityState;
  isRunning: boolean;
  /** Approval and question cards, shown after the last item. */
  prompts?: ReactNode;
  /** Message to mark, e.g. the one a search result points at. */
  highlightId?: string | null;
}

// Messages read as a column of about 760 px, like the Claude apps.
const COLUMN = 'mx-auto w-full max-w-3xl px-4 sm:px-6';

function Item({ item }: { item: TimelineItem }) {
  switch (item.type) {
    case 'tool':
      return <ToolCall tool={item.data} />;
    case 'image':
      return <GeneratedImageItem image={item.data} />;
    case 'message':
      if (item.data.role === 'user') return <UserMessage message={item.data} />;
      if (item.data.role === 'assistant') return <AssistantMessage message={item.data} />;
      return <SystemNote message={item.data} />;
  }
}

/** Spacing depends on neighbours: consecutive tool calls sit close together. */
function gapBefore(previous: TimelineItem | undefined, item: TimelineItem): string {
  if (!previous) return 'pt-6';
  if (previous.type === 'tool' && item.type === 'tool') return 'pt-0.5';
  if (item.type === 'message' && item.data.role === 'user') return 'pt-8';
  return 'pt-4';
}

function ActivityLine({ activity, isRunning }: { activity?: ActivityState; isRunning: boolean }) {
  if (!isRunning) return null;
  const label =
    activity?.type === 'tool' && activity.toolName
      ? `Running ${activity.toolName}…`
      : activity?.message || 'Thinking…';
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
      </span>
      {label}
    </div>
  );
}

interface ThreadContext {
  sessionId: string;
  isLoadingOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
  activity?: ActivityState;
  isRunning: boolean;
  prompts?: ReactNode;
}

// Module-level so Virtuoso keeps the same component identity across renders;
// live values travel through `context`.
function ThreadHeader({ context }: { context?: ThreadContext }) {
  if (!context || (!context.isLoadingOlder && !context.olderError)) return null;
  return (
    <div className={`${COLUMN} flex justify-center py-3 text-xs text-muted-foreground`}>
      {context.isLoadingOlder ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading older messages" />
      ) : (
        <button type="button" onClick={context.onLoadOlder} className="underline">
          {context.olderError} Retry
        </button>
      )}
    </div>
  );
}

function ThreadFooter({ context }: { context?: ThreadContext }) {
  if (!context) return null;
  return (
    <div className={`${COLUMN} space-y-4 pb-6 pt-4`}>
      <StreamingMessage sessionId={context.sessionId} />
      <ActivityLine activity={context.activity} isRunning={context.isRunning} />
      {context.prompts}
    </div>
  );
}

const VIRTUOSO_COMPONENTS = { Header: ThreadHeader, Footer: ThreadFooter };

export const Thread = forwardRef<VirtuosoHandle, ThreadProps>(function Thread(
  {
    sessionId,
    items,
    firstItemIndex,
    hasOlder,
    isLoadingOlder,
    olderError,
    onLoadOlder,
    onAtBottomChange,
    activity,
    isRunning,
    prompts,
    highlightId,
  },
  ref
) {
  const renderItem = useCallback(
    (index: number, item: TimelineItem) => {
      const previous = items[index - firstItemIndex - 1];
      const marked = item.type === 'message' && item.data.id === highlightId;
      return (
        <div className={`${COLUMN} ${gapBefore(previous, item)}`}>
          <div
            className={
              marked ? '-mx-2 rounded-xl bg-accent/60 px-2 py-1 transition-colors' : undefined
            }
          >
            <Item item={item} />
          </div>
        </div>
      );
    },
    [firstItemIndex, highlightId, items]
  );

  const context = useMemo<ThreadContext>(
    () => ({ sessionId, isLoadingOlder, olderError, onLoadOlder, activity, isRunning, prompts }),
    [activity, isLoadingOlder, isRunning, olderError, onLoadOlder, prompts, sessionId]
  );

  return (
    <Virtuoso<TimelineItem, ThreadContext>
      ref={ref}
      className="h-full"
      data={items}
      context={context}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={Math.max(0, items.length - 1)}
      computeItemKey={(_, item) => item.key}
      itemContent={renderItem}
      followOutput={(atBottom) => (atBottom ? 'smooth' : false)}
      atBottomStateChange={onAtBottomChange}
      atBottomThreshold={80}
      startReached={() => {
        if (hasOlder && !isLoadingOlder) onLoadOlder();
      }}
      increaseViewportBy={{ top: 600, bottom: 400 }}
      components={VIRTUOSO_COMPONENTS}
    />
  );
});
