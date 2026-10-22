import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Session } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { socketService } from '@/services/socket';
import { toast } from '@/hooks/use-toast';
import { paths } from '@/features/shell/paths';

/** Which dialog is open and for which session; rendered once by SessionDialogs. */
interface DialogState {
  rename: Session | null;
  remove: Session | null;
  askRename: (session: Session) => void;
  askRemove: (session: Session) => void;
  close: () => void;
}

export const useSessionDialogs = create<DialogState>((set) => ({
  rename: null,
  remove: null,
  askRename: (session) => set({ rename: session, remove: null }),
  askRemove: (session) => set({ remove: session, rename: null }),
  close: () => set({ rename: null, remove: null }),
}));

function failed(title: string) {
  return (error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message : undefined,
      variant: 'destructive',
    });
}

/** Rename, star, restart, export and delete, shared by the menu and the palette. */
export function useSessionActions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refresh = useCallback(
    (id: string) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['session', id] });
    },
    [queryClient]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      try {
        await api.put(`/api/sessions/${id}`, { name });
        refresh(id);
      } catch (error) {
        failed('Could not rename the session')(error);
      }
    },
    [refresh]
  );

  const toggleStar = useCallback(
    async (id: string) => {
      try {
        await api.patch(`/api/sessions/${id}/star`);
        refresh(id);
      } catch (error) {
        failed('Could not star the session')(error);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/api/sessions/${id}`);
        void queryClient.invalidateQueries({ queryKey: ['sessions'] });
        navigate(paths.home(), { replace: true });
      } catch (error) {
        failed('Could not delete the session')(error);
      }
    },
    [navigate, queryClient]
  );

  const restart = useCallback((id: string) => {
    socketService.restartSession(id);
    toast({ title: 'Session restarted' });
  }, []);

  const exportMarkdown = useCallback(async (id: string, name: string) => {
    try {
      const response = await api.download(`/api/sessions/${id}/export`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name.replace(/[^\w.-]+/g, '_') || 'session'}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      failed('Could not export the session')(error);
    }
  }, []);

  return { rename, toggleStar, remove, restart, exportMarkdown };
}
