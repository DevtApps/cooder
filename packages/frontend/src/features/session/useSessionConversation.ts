import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import type {
  ActiveFollowupMode,
  ApiResponse,
  CLIProvider,
  Message,
  MessageHistorySnapshot,
  PermissionAction,
  Session,
  SessionMode,
  SessionReadState,
  ToolExecution,
} from '@plum-code-webui/shared';
import { api, ApiError } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { socketService } from '@/services/socket';
import { useSessionStore, type GeneratedImage } from '@/stores/sessionStore';
import { updateSessionChatQuery } from '@/lib/sessionChatSync';
import {
  isMessageSnapshotStale,
  loadThenCommit,
  messageBelongsToChat,
  mergeMessageHistorySnapshot,
  normalizeMessageChatId,
} from '@/lib/messageHistory';

// Ported from the legacy SessionPage. The epoch counter invalidates in-flight
// history reads whenever the active chat thread changes, and every REST
// snapshot is merged with live socket messages instead of replacing them.
export const MESSAGE_HISTORY_PAGE_SIZE = 500;
export const MESSAGE_HISTORY_FIRST_INDEX = 1_000_000;
const SESSION_DETAIL_FALLBACK_INTERVAL_MS = 15_000;
const READ_STATE_DELAY_MS = 650;

interface MessageHistoryPagination {
  total: number;
  limit: number;
  hasMore: boolean;
  hasMoreAfter?: boolean;
  oldestId: string | null;
  newestId?: string | null;
}

interface MessageHistoryResponse extends ApiResponse<Message[]> {
  pagination?: MessageHistoryPagination;
  snapshot?: MessageHistorySnapshot;
}

interface SessionChatListPayload {
  chats: Array<{ id: string; title: string }>;
  activeChatId: string | null;
}

export type TimelineItem =
  | { type: 'message'; key: string; data: Message; timestamp: number }
  | { type: 'image'; key: string; data: GeneratedImage; timestamp: number }
  | { type: 'tool'; key: string; data: ToolExecution; timestamp: number };

const EMPTY_PAGINATION: MessageHistoryPagination = {
  total: 0,
  limit: MESSAGE_HISTORY_PAGE_SIZE,
  hasMore: false,
  oldestId: null,
};
const EMPTY: never[] = [];

export function useSessionConversation(id: string | undefined) {
  const queryClient = useQueryClient();
  const setMessages = useSessionStore((s) => s.setMessages);
  const clearStreamingContent = useSessionStore((s) => s.clearStreamingContent);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setAgentRuns = useSessionStore((s) => s.setAgentRuns);

  const live = useSessionStore(
    useShallow((s) => {
      const sid = id ?? '';
      return {
        messages: s.messages[sid] ?? (EMPTY as Message[]),
        isStreaming: Boolean(s.streamingContent[sid]),
        activity: s.activity[sid],
        images: s.generatedImages[sid] ?? (EMPTY as GeneratedImage[]),
        tools: s.toolExecutions[sid] ?? (EMPTY as ToolExecution[]),
        todos: s.todos[sid] ?? EMPTY,
        agentRuns: s.agentRuns[sid] ?? EMPTY,
        queue: s.queueState[sid] ?? null,
        usage: s.usage[sid],
        pendingPermission: s.pendingPermissions[sid] ?? null,
        pendingQuestion: s.pendingQuestions[sid] ?? null,
      };
    })
  );

  const [historyFirstItemIndex, setHistoryFirstItemIndex] = useState(MESSAGE_HISTORY_FIRST_INDEX);
  const [pagination, setPagination] = useState<MessageHistoryPagination>(EMPTY_PAGINATION);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  // Showing a window around a search hit instead of the latest messages.
  const [windowMode, setWindowMode] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledJumpRef = useRef('');

  const messageSnapshotRef = useRef<MessageHistorySnapshot>();
  const epochRef = useRef(0);
  const activeChatIdRef = useRef<string | null | undefined>(undefined);
  const lastReadSentRef = useRef('');
  const ownerRef = useRef(id);
  if (ownerRef.current !== id) {
    ownerRef.current = id;
    activeChatIdRef.current = undefined;
    messageSnapshotRef.current = undefined;
    epochRef.current += 1;
  }

  // --- Session detail -----------------------------------------------------
  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Session>>(`/api/sessions/${id}`);
      return response.data.success && response.data.data ? response.data.data : null;
    },
    enabled: !!id,
    // Runtime events arrive over the socket; this poll only recovers missed ones.
    refetchInterval: SESSION_DETAIL_FALLBACK_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const session = sessionQuery.data ?? null;

  useEffect(() => {
    if (id && session?.runtime?.subagents?.length) setAgentRuns(id, session.runtime.subagents);
  }, [id, session, setAgentRuns]);

  // --- Socket subscription --------------------------------------------------
  useEffect(() => {
    if (!id) return;
    socketService.connect();
    // Reconnect (not subscribe) replays only what is newer than the watermark.
    socketService.reconnectToSession(id, useSessionStore.getState().lastMessageTimestamp[id]);
    setActiveSession(id);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        socketService.reconnectToSession(id, useSessionStore.getState().lastMessageTimestamp[id]);
      } else {
        socketService.setSessionPresence(id, 'idle');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      socketService.unsubscribeFromSession(id);
      setActiveSession(null);
      useSessionStore.getState().pruneSession(id);
    };
  }, [id, setActiveSession]);

  // --- Chat threads ---------------------------------------------------------
  const chatsQuery = useQuery({
    queryKey: ['session-chats', id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<SessionChatListPayload>>(
        `/api/sessions/${id}/chats`
      );
      if (!response.data.success || !response.data.data) {
        throw new Error('Chat threads could not be loaded.');
      }
      return response.data.data;
    },
    enabled: !!id,
  });
  const activeChatId = normalizeMessageChatId(chatsQuery.data?.activeChatId) ?? null;

  const syncActiveChat = useCallback(
    (chatId: string | null) => {
      if (!id) return;
      const normalized = normalizeMessageChatId(chatId) ?? null;
      if (activeChatIdRef.current === normalized) return;
      // Invalidate old-thread reads; initial hydration keeps its own request.
      if (activeChatIdRef.current !== undefined) {
        epochRef.current += 1;
        void queryClient.cancelQueries({ queryKey: ['messages', id] });
      }
      messageSnapshotRef.current = undefined;
      activeChatIdRef.current = normalized;
      socketService.setSessionChat(id, normalized);
      setMessages(
        id,
        (useSessionStore.getState().messages[id] ?? []).filter((m) =>
          messageBelongsToChat(m, normalized)
        )
      );
      setHistoryFirstItemIndex(MESSAGE_HISTORY_FIRST_INDEX);
      setPagination(EMPTY_PAGINATION);
      setIsLoadingOlder(false);
      setOlderError(null);
      void queryClient.invalidateQueries({ queryKey: ['session', id] });
    },
    [id, queryClient, setMessages]
  );

  useEffect(() => {
    if (!id) return;
    return socketService.onChatSync((data) => {
      if (data.sessionId !== id) return;
      syncActiveChat(data.activeChatId);
      updateSessionChatQuery(queryClient, data);
    });
  }, [id, queryClient, syncActiveChat]);

  useEffect(() => {
    if (chatsQuery.isSuccess) syncActiveChat(activeChatId);
  }, [activeChatId, chatsQuery.isSuccess, syncActiveChat]);

  const resolveActiveChatId = useCallback(async (): Promise<string | null> => {
    if (!id) throw new Error('Session unavailable.');
    if (activeChatIdRef.current !== undefined) return activeChatIdRef.current;
    let payload = queryClient.getQueryData<SessionChatListPayload>(['session-chats', id]);
    if (!payload) {
      const epoch = epochRef.current;
      const response = await api.get<ApiResponse<SessionChatListPayload>>(
        `/api/sessions/${id}/chats`
      );
      if (epoch !== epochRef.current && activeChatIdRef.current !== undefined) {
        return activeChatIdRef.current;
      }
      if (!response.data.success || !response.data.data) {
        throw new Error('Chat threads could not be loaded.');
      }
      payload = response.data.data;
      queryClient.setQueryData(['session-chats', id], payload);
    }
    const chatId = normalizeMessageChatId(payload.activeChatId) ?? null;
    activeChatIdRef.current = chatId;
    socketService.setSessionChat(id, chatId);
    return chatId;
  }, [id, queryClient]);

  // --- Message history ------------------------------------------------------
  const applyHistory = useCallback(
    (response: MessageHistoryResponse, completeFullResync = false): Message[] => {
      if (!id) return [];
      const chatId = normalizeMessageChatId(response.snapshot?.chatId) ?? null;
      const snapshotMessages = (response.data ?? []).filter((m) => messageBelongsToChat(m, chatId));
      const liveMessages = (useSessionStore.getState().messages[id] ?? []).filter((m) =>
        messageBelongsToChat(m, chatId)
      );
      const stale = isMessageSnapshotStale(
        response.snapshot,
        messageSnapshotRef.current,
        socketService.getSessionCursor(id)
      );
      // Even a stale snapshot may add persisted rows; it never drops live ones.
      const reconciled = mergeMessageHistorySnapshot(snapshotMessages, liveMessages);
      setMessages(id, reconciled);
      if (response.snapshot) {
        socketService.recordSessionSnapshot(
          id,
          response.snapshot.highWatermark,
          chatId,
          completeFullResync
        );
        const currentChatId = normalizeMessageChatId(messageSnapshotRef.current?.chatId);
        if (!stale || currentChatId !== chatId) {
          messageSnapshotRef.current = { ...response.snapshot, chatId };
        }
        activeChatIdRef.current = chatId;
      }
      return reconciled;
    },
    [id, setMessages]
  );

  const fetchLatest = useCallback(
    async (chatId: string | null) => {
      const params = new URLSearchParams({
        limit: String(MESSAGE_HISTORY_PAGE_SIZE),
        chatId: chatId ?? '',
      });
      const response = await api.get<MessageHistoryResponse>(
        `/api/sessions/${id}/messages?${params.toString()}`
      );
      return response.data;
    },
    [id]
  );

  const commitLatest = useCallback(
    (history: MessageHistoryResponse) => {
      const reconciled = applyHistory(history, true);
      setHistoryFirstItemIndex(MESSAGE_HISTORY_FIRST_INDEX);
      setPagination(
        history.pagination ?? {
          ...EMPTY_PAGINATION,
          total: reconciled.length,
          oldestId: reconciled[0]?.id ?? null,
        }
      );
    },
    [applyHistory]
  );

  const historyQuery = useQuery({
    queryKey: ['messages', id, activeChatId ?? 'main'],
    queryFn: async () => {
      const epoch = epochRef.current;
      const history = await fetchLatest(activeChatId);
      if (!history.success || !history.data) return [];
      if (epoch !== epochRef.current || activeChatIdRef.current !== activeChatId) {
        return history.data;
      }
      if (normalizeMessageChatId(history.snapshot?.chatId) !== activeChatId) {
        throw new Error('The chat changed while its history was loading.');
      }
      commitLatest(history);
      return history.data;
    },
    enabled: !!id && chatsQuery.isSuccess && !windowMode,
  });

  const loadOlder = useCallback(async () => {
    if (!id || isLoadingOlder || !pagination.hasMore || !pagination.oldestId) return;
    const epoch = epochRef.current;
    setIsLoadingOlder(true);
    setOlderError(null);
    try {
      const chatId = normalizeMessageChatId(messageSnapshotRef.current?.chatId) ?? null;
      const params = new URLSearchParams({
        limit: String(MESSAGE_HISTORY_PAGE_SIZE),
        before: pagination.oldestId,
        chatId: chatId ?? '',
      });
      const response = await api.get<MessageHistoryResponse>(
        `/api/sessions/${id}/messages?${params.toString()}`
      );
      if (epoch !== epochRef.current) return;
      if (normalizeMessageChatId(response.data.snapshot?.chatId) !== chatId) {
        throw new Error('The chat changed while older messages were loading.');
      }
      const current = useSessionStore.getState().messages[id] ?? [];
      const known = new Set(current.map((m) => m.id));
      const older = (response.data.data ?? []).filter((m) => !known.has(m.id));
      if (older.length > 0) {
        setMessages(id, [...older, ...current]);
        setHistoryFirstItemIndex((index) => index - older.length);
      }
      setPagination(
        response.data.pagination ?? {
          ...EMPTY_PAGINATION,
          total: current.length + older.length,
          oldestId: older[0]?.id ?? pagination.oldestId,
        }
      );
      if (response.data.snapshot) {
        socketService.recordSessionSnapshot(id, response.data.snapshot.highWatermark, chatId);
        if (
          !isMessageSnapshotStale(
            response.data.snapshot,
            messageSnapshotRef.current,
            socketService.getSessionCursor(id)
          )
        ) {
          messageSnapshotRef.current = response.data.snapshot;
        }
      }
    } catch (error) {
      setOlderError(error instanceof Error ? error.message : 'Older messages could not be loaded.');
    } finally {
      setIsLoadingOlder(false);
    }
  }, [id, isLoadingOlder, pagination.hasMore, pagination.oldestId, setMessages]);

  // Open a message found by search: switch to its chat, load the part of the
  // conversation around it and highlight it.
  const jumpToMessage = useCallback(
    async (messageId: string, chatParam: string | null) => {
      if (!id) return;
      const target = normalizeMessageChatId(chatParam) ?? null;
      try {
        const resolved = await resolveActiveChatId();
        if (resolved !== target) {
          const response = await api.post<ApiResponse<SessionChatListPayload>>(
            `/api/sessions/${id}/chats/${encodeURIComponent(target ?? 'main')}/activate`
          );
          if (!response.data.success || !response.data.data) {
            throw new Error('The matching chat could not be activated.');
          }
          queryClient.setQueryData(['session-chats', id], response.data.data);
          syncActiveChat(normalizeMessageChatId(response.data.data.activeChatId) ?? null);
        }
        const epoch = epochRef.current;
        const params = new URLSearchParams({
          limit: '160',
          around: messageId,
          chatId: target ?? '',
        });
        const response = await api.get<MessageHistoryResponse>(
          `/api/sessions/${id}/messages?${params.toString()}`
        );
        const found = response.data.data ?? [];
        if (!response.data.success || found.length === 0) {
          throw new Error('The matching message is no longer available.');
        }
        if (epoch !== epochRef.current) return;
        setWindowMode(true);
        setMessages(id, found);
        setHistoryFirstItemIndex(MESSAGE_HISTORY_FIRST_INDEX);
        setPagination(
          response.data.pagination ?? {
            ...EMPTY_PAGINATION,
            total: found.length,
            oldestId: found[0]?.id ?? null,
          }
        );
        setHighlightId(messageId);
        window.setTimeout(() => setHighlightId(null), 3500);
      } catch (error) {
        toast({
          title: 'Could not open the message',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [id, queryClient, resolveActiveChatId, setMessages, syncActiveChat]
  );

  useEffect(() => {
    const messageId = searchParams.get('message');
    if (!id || !messageId || !chatsQuery.isSuccess) return;
    const key = `${id}:${messageId}`;
    if (handledJumpRef.current === key) return;
    handledJumpRef.current = key;
    void jumpToMessage(messageId, searchParams.get('chat'));
    setSearchParams({}, { replace: true });
  }, [chatsQuery.isSuccess, id, jumpToMessage, searchParams, setSearchParams]);

  const backToLatest = useCallback(async () => {
    if (!id) return;
    try {
      const chatId = await resolveActiveChatId();
      const history = await fetchLatest(chatId);
      if (!history.success || !history.data) throw new Error('The latest messages could not load.');
      commitLatest(history);
      setWindowMode(false);
    } catch (error) {
      toast({
        title: 'Could not load the latest messages',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  }, [commitLatest, fetchLatest, id, resolveActiveChatId]);

  // The socket asks for a full resync after a reconnect gap it cannot replay.
  const refetchSession = sessionQuery.refetch;
  useEffect(() => {
    const onResync = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      if (!id || detail?.sessionId !== id) return;
      const epoch = epochRef.current;
      void loadThenCommit(async () => {
        const chatId = await resolveActiveChatId();
        const history = await fetchLatest(chatId);
        if (
          epoch !== epochRef.current ||
          !history.success ||
          !history.data ||
          normalizeMessageChatId(history.snapshot?.chatId) !== chatId
        ) {
          throw new Error('The reconnect snapshot could not be verified.');
        }
        return history;
      }, commitLatest)
        .then(() => void refetchSession())
        .catch((error) => console.warn('[RESYNC] Conversation refresh failed:', error));
    };
    window.addEventListener('cooder:session-full-resync', onResync);
    return () => window.removeEventListener('cooder:session-full-resync', onResync);
  }, [commitLatest, fetchLatest, id, refetchSession, resolveActiveChatId]);

  // Read marker: REST is authoritative, presence only advertises viewing.
  const latestMessageId = live.messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (!id || !isAtBottom || pagination.hasMoreAfter || !latestMessageId) return;
    const readKey = `${id}:${latestMessageId}`;
    if (lastReadSentRef.current === readKey) return;
    const timeout = window.setTimeout(() => {
      lastReadSentRef.current = readKey;
      void api
        .put<ApiResponse<SessionReadState>>(`/api/sessions/${id}/read-state`, {
          chatId: activeChatIdRef.current ?? null,
          lastReadMessageId: latestMessageId,
        })
        .then(() => {
          socketService.setSessionPresence(id, 'active');
          void queryClient.invalidateQueries({ queryKey: ['sessions'] });
        })
        .catch((error) => {
          socketService.setSessionPresence(id, 'active');
          if (!(error instanceof ApiError) || error.status !== 404) {
            console.warn('[READ-STATE] Could not persist read position:', error);
          }
        });
    }, READ_STATE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [id, isAtBottom, latestMessageId, pagination.hasMoreAfter, queryClient]);

  // --- Timeline -------------------------------------------------------------
  // Sorting is stable, so equal timestamps keep message → image → tool order.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...live.messages.map((m) => ({
        type: 'message' as const,
        key: `m-${m.id}`,
        data: m,
        timestamp: new Date(m.createdAt).getTime(),
      })),
      ...live.images.map((img) => ({
        type: 'image' as const,
        key: `i-${img.timestamp}`,
        data: img,
        timestamp: img.timestamp,
      })),
      ...live.tools.map((tool) => ({
        type: 'tool' as const,
        key: `t-${tool.toolId}`,
        data: tool,
        timestamp: tool.timestamp,
      })),
    ];
    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }, [live.images, live.messages, live.tools]);

  // --- Run state --------------------------------------------------------------
  const runtime = session?.runtime;
  const cliProvider = session?.cliProvider;
  const isRunning =
    live.isStreaming ||
    live.activity?.type === 'tool' ||
    live.activity?.type === 'thinking' ||
    !!runtime?.busy ||
    !!runtime?.streaming ||
    !!live.queue?.busy;
  const queueDepth = Math.max(live.queue?.depth ?? 0, runtime?.queueDepth ?? 0);

  // --- Actions ----------------------------------------------------------------
  const send = useCallback(
    async (text: string, files: File[] = []) => {
      if (!id) return;
      await resolveActiveChatId();
      // OpenCode can abort the active turn and prioritize a new follow-up.
      const mode: ActiveFollowupMode | undefined = isRunning
        ? cliProvider === 'opencode'
          ? 'steer'
          : 'queue'
        : undefined;
      const ack =
        files.length > 0
          ? await socketService.sendMessageWithFiles(id, text, files, mode)
          : await socketService.sendMessage(id, text, undefined, mode);
      if (ack.status !== 'rejected') clearStreamingContent(id);
      return ack;
    },
    [clearStreamingContent, cliProvider, id, isRunning, resolveActiveChatId]
  );

  const interrupt = useCallback(() => {
    if (id) socketService.interruptSession(id);
  }, [id]);

  const respondToPermission = useCallback(
    async (action: PermissionAction, pattern?: string) => {
      if (!id || !live.pendingPermission) return;
      await socketService.respondToPermission(
        id,
        live.pendingPermission.requestId,
        action,
        pattern
      );
    },
    [id, live.pendingPermission]
  );

  const respondToQuestion = useCallback(
    async (answers: string[][] | null) => {
      const question = live.pendingQuestion;
      if (!id || !question) return;
      if (answers === null) {
        await socketService.rejectQuestion(id, question.requestId, question.providerSessionId);
      } else {
        await socketService.respondToQuestion(
          id,
          question.requestId,
          answers,
          question.providerSessionId
        );
      }
    },
    [id, live.pendingQuestion]
  );

  // The mode lives in the session row so it follows the user across devices;
  // the socket call is what changes the running CLI.
  const mode: SessionMode = (session?.mode as SessionMode | null) ?? 'auto-accept';
  const setMode = useCallback(
    (next: SessionMode) => {
      if (!id) return;
      queryClient.setQueryData<Session | null>(['session', id], (current) =>
        current ? { ...current, mode: next } : current
      );
      socketService.setSessionMode(id, next);
      api.patch(`/api/sessions/${id}/mode`, { mode: next }).catch((error) => {
        console.warn('Failed to persist session mode', error);
      });
    },
    [id, queryClient]
  );
  useEffect(() => {
    if (!id) return;
    return socketService.onModeChange((data) => {
      if (data.sessionId !== id) return;
      queryClient.setQueryData<Session | null>(['session', id], (current) =>
        current ? { ...current, mode: data.mode } : current
      );
    });
  }, [id, queryClient]);

  const patchSession = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!id) return;
      const response = await api.patch<ApiResponse<Session>>(`/api/sessions/${id}/${path}`, body);
      const updated = response.data.data;
      if (updated) {
        queryClient.setQueryData(['session', id], updated);
        useSessionStore.getState().updateSession(id, updated);
      }
    },
    [id, queryClient]
  );
  const setEffort = useCallback(
    (effort: string | null) => patchSession('reasoning', { reasoning: effort }),
    [patchSession]
  );
  const setFast = useCallback(
    (fast: boolean) => patchSession('service-tier', { serviceTier: fast ? 'fast' : null }),
    [patchSession]
  );

  // Switching the agent restarts the CLI with a fresh context (backend side);
  // the model is pinned afterwards because ids do not carry across agents.
  const setAgent = useCallback(
    async (provider: CLIProvider, model: string | null) => {
      if (!id || !session) return;
      let updated: Session | undefined;
      if (provider !== session.cliProvider) {
        const response = await api.patch<ApiResponse<Session>>(`/api/sessions/${id}/provider`, {
          cliProvider: provider,
        });
        updated = response.data.data;
      }
      if (model !== (updated ?? session).cliModel) {
        const response = await api.patch<ApiResponse<Session>>(`/api/sessions/${id}/model`, {
          model,
        });
        updated = response.data.data ?? updated;
      }
      if (updated) {
        queryClient.setQueryData(['session', id], updated);
        useSessionStore.getState().updateSession(id, updated);
      }
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    [id, queryClient, session]
  );

  return {
    session,
    chatList: chatsQuery.data,
    mode,
    setMode,
    setEffort,
    setFast,
    setAgent,
    sessionError: sessionQuery.error,
    isLoading: sessionQuery.isLoading || historyQuery.isLoading,
    historyError: historyQuery.error,
    retry: () => {
      void sessionQuery.refetch();
      void historyQuery.refetch();
    },
    timeline,
    windowMode,
    highlightId,
    backToLatest,
    firstItemIndex: historyFirstItemIndex,
    hasOlder: pagination.hasMore,
    isLoadingOlder,
    olderError,
    loadOlder,
    setIsAtBottom,
    isRunning,
    queueDepth,
    activity: live.activity,
    todos: live.todos,
    agentRuns: live.agentRuns,
    usage: live.usage,
    pendingPermission: live.pendingPermission,
    pendingQuestion: live.pendingQuestion,
    send,
    interrupt,
    respondToPermission,
    respondToQuestion,
  };
}
