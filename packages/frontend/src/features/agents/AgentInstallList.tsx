import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Trash2 } from 'lucide-react';
import type {
  ApiResponse,
  CLIProvider,
  CliProviderUninstallResponse,
  CliProviderUpdateResponse,
} from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface InstallableAgent {
  id: CLIProvider;
  name: string;
  installed: boolean;
  note?: string;
}

interface InstallablePayload {
  localInstall: boolean;
  agents: InstallableAgent[];
}

/**
 * Agents with an Install button each, for local installs. Installing runs the
 * same npm/pipx command the updater uses, into Cooder's own folder.
 */
export function AgentInstallList() {
  const queryClient = useQueryClient();
  const [installing, setInstalling] = useState<CLIProvider | null>(null);
  const [removing, setRemoving] = useState<CLIProvider | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<InstallableAgent | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CLIProvider, string>>>({});

  const query = useQuery({
    queryKey: ['cli-providers', 'installable'],
    queryFn: async () =>
      (await api.get<ApiResponse<InstallablePayload>>('/api/cli-providers/installable')).data
        .data ?? {
        localInstall: false,
        agents: [],
      },
  });

  const install = async (id: CLIProvider) => {
    setInstalling(id);
    setErrors((current) => ({ ...current, [id]: undefined }));
    try {
      const response = await api.post<ApiResponse<CliProviderUpdateResponse>>(
        '/api/cli-providers/update',
        { providers: [id] }
      );
      const result = response.data.data?.results.find((r) => r.provider === id);
      if (result?.status !== 'updated') {
        const lastLines = result?.output?.trim().split('\n').slice(-3).join(' ');
        throw new Error(lastLines || 'The installation failed.');
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'The installation failed.',
      }));
    } finally {
      setInstalling(null);
      await queryClient.invalidateQueries({ queryKey: ['cli-providers'] });
    }
  };

  const uninstall = async () => {
    if (!uninstallTarget) return;
    const { id } = uninstallTarget;
    setRemoving(id);
    setErrors((current) => ({ ...current, [id]: undefined }));
    try {
      const response = await api.post<ApiResponse<CliProviderUninstallResponse>>(
        '/api/cli-providers/uninstall',
        { providers: [id] }
      );
      const result = response.data.data?.results.find((entry) => entry.provider === id);
      if (result?.status !== 'uninstalled') {
        const lastLines = result?.output?.trim().split('\n').slice(-3).join(' ');
        throw new Error(lastLines || 'The uninstallation failed.');
      }
      setUninstallTarget(null);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'The uninstallation failed.',
      }));
    } finally {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ['cli-providers'] });
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    }
  };

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  if (!query.data?.localInstall) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        This server runs in Docker, where the agents come with the image.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.agents.map((agent) => (
          <li key={agent.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{agent.name}</p>
              {agent.note && <p className="text-xs text-muted-foreground">{agent.note}</p>}
              {errors[agent.id] && (
                <p className="mt-1 break-words text-xs text-destructive">{errors[agent.id]}</p>
              )}
            </div>
            {agent.installed ? (
              <>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  Installed
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Uninstall ${agent.name}`}
                  title={`Uninstall ${agent.name}`}
                  disabled={installing !== null || removing !== null}
                  onClick={() => setUninstallTarget(agent)}
                >
                  {removing === agent.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={installing !== null || removing !== null}
                onClick={() => void install(agent.id)}
              >
                {installing === agent.id && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                )}
                {installing === agent.id ? 'Installing…' : 'Install'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => !open && !removing && setUninstallTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uninstall {uninstallTarget?.name}?</DialogTitle>
            <DialogDescription>
              This removes the CLI from Cooder, so active sessions using it may stop working. Saved
              sign-in credentials and provider settings will be kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUninstallTarget(null)}
              disabled={removing !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void uninstall()}
              disabled={removing !== null}
            >
              {removing !== null && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Uninstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
