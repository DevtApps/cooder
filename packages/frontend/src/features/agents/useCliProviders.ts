import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, CLIProvider } from '@plum-code-webui/shared';
import { api } from '@/services/api';

export interface CliProviderInfo {
  id: CLIProvider;
  name: string;
  configured: boolean;
  available: boolean;
  enabled?: boolean;
  models?: string[];
  modelLabels?: Record<string, string>;
  defaultModel?: string;
}

/** Agents the backend knows, with their models; same cache as the legacy UI. */
export function useCliProviders() {
  const query = useQuery({
    queryKey: ['cli-providers'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<CliProviderInfo[]>>('/api/cli-providers');
      return response.data.data ?? [];
    },
    staleTime: 60_000,
  });
  const providers = query.data ?? [];
  return {
    providers,
    /** Installed and enabled: the ones a session can switch to. */
    usable: providers.filter((p) => p.available && p.enabled !== false),
    find: (id: CLIProvider | undefined) => providers.find((p) => p.id === id),
  };
}

export function modelLabel(provider: CliProviderInfo | undefined, model: string): string {
  return provider?.modelLabels?.[model] || model;
}
