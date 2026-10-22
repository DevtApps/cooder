import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, Session } from '@plum-code-webui/shared';
import { api } from '@/services/api';

// Same query key as the legacy shell, so both share one cache. Socket events
// and mutations keep it fresh; the poll only recovers missed changes.
const SESSION_LIST_FALLBACK_INTERVAL_MS = 30_000;

export interface Project {
  /** Working directory; the identity of a project. */
  path: string;
  name: string;
  sessions: Session[];
  lastActivity: number;
}

export function projectName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed || 'Workspace';
}

export function sessionActivity(session: Session): number {
  const value = Date.parse(session.lastActivity ?? session.updatedAt ?? session.createdAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

export function useSessions() {
  const query = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Session[]>>('/api/sessions');
      return response.data.success && response.data.data ? response.data.data : [];
    },
    staleTime: SESSION_LIST_FALLBACK_INTERVAL_MS,
    refetchInterval: SESSION_LIST_FALLBACK_INTERVAL_MS,
  });

  const projects = useMemo<Project[]>(() => {
    const byPath = new Map<string, Project>();
    for (const session of query.data ?? []) {
      const path = session.workingDirectory || '';
      let project = byPath.get(path);
      if (!project) {
        project = { path, name: projectName(path), sessions: [], lastActivity: 0 };
        byPath.set(path, project);
      }
      project.sessions.push(session);
      project.lastActivity = Math.max(project.lastActivity, sessionActivity(session));
    }
    for (const project of byPath.values()) {
      // Starred first, then the most recently active.
      project.sessions.sort(
        (a, b) => Number(b.starred) - Number(a.starred) || sessionActivity(b) - sessionActivity(a)
      );
    }
    return [...byPath.values()].sort((a, b) => b.lastActivity - a.lastActivity);
  }, [query.data]);

  return { sessions: query.data ?? [], projects, isLoading: query.isLoading };
}
