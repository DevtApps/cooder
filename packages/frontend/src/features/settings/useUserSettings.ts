import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, UserSettings } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/lib/i18n';

/** Account settings, shared with the rest of the app under ['settings']. */
export function useUserSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<ApiResponse<UserSettings>>('/api/settings')).data.data,
    staleTime: 60_000,
  });
  const update = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) =>
      (await api.put<ApiResponse<UserSettings>>('/api/settings', patch)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['cli-providers'] });
    },
    onError: (error: Error) =>
      toast({
        title: t('errors.couldNotSave'),
        description: error.message,
        variant: 'destructive',
      }),
  });
  return { settings: query.data, isLoading: query.isLoading, update };
}
