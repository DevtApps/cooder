import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';

export interface RunInfo {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: 'running' | 'exited' | 'failed' | 'stopped';
  pid: number | null;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  urls: string[];
}

export const processesKey = (sessionId: string) => ['processes', sessionId];

/** Background processes of a session; polled, since they change on their own. */
export function useProcesses(sessionId: string) {
  return useQuery({
    queryKey: processesKey(sessionId),
    queryFn: async () =>
      (
        await api.get<ApiResponse<RunInfo[]>>(
          `/api/processes?sessionId=${encodeURIComponent(sessionId)}`
        )
      ).data.data ?? [],
    enabled: !!sessionId,
    refetchInterval: 3000,
  });
}
