import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Github } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { SettingGroup, SettingRow } from '../primitives';

interface TokenStatus {
  hasToken: boolean;
  tokenPreview: string | null;
}

function errorToast(error: Error) {
  toast({ title: 'Error', description: error.message, variant: 'destructive' });
}

/** Accounts and services the agents and the git tools can use. */
export function IntegrationsSection() {
  return (
    <>
      <GitHubAccess />
    </>
  );
}

function GitHubAccess() {
  const [token, setToken] = useState('');
  const status = useQuery({
    queryKey: ['github-token'],
    queryFn: async () =>
      (await api.get<ApiResponse<TokenStatus>>('/api/settings/github-token')).data.data,
  });

  const save = useMutation({
    mutationFn: async () => api.put('/api/settings/github-token', { token }),
    onSuccess: () => {
      setToken('');
      void status.refetch();
      toast({ title: 'GitHub token saved' });
    },
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete('/api/settings/github-token'),
    onSuccess: () => {
      void status.refetch();
      toast({ title: 'GitHub token removed' });
    },
    onError: errorToast,
  });

  const configured = status.data?.hasToken ?? false;

  return (
    <SettingGroup
      title="GitHub"
      description="Lets Cooder create repositories, clone and push on your behalf."
    >
      {configured ? (
        <SettingRow
          title="Token saved"
          description={<span className="font-mono">{status.data?.tokenPreview}</span>}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </Button>
        </SettingRow>
      ) : (
        <form
          className="space-y-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (token) save.mutate();
          }}
        >
          <label htmlFor="github-token" className="flex items-center gap-2 text-sm font-medium">
            <Github className="h-4 w-4" aria-hidden />
            Personal access token
          </label>
          <div className="flex gap-2">
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ghp_…"
              className="font-mono text-sm"
            />
            <Button type="submit" size="sm" disabled={!token || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Create one at{' '}
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              github.com/settings/tokens
            </a>{' '}
            with the repo and read:user scopes.
          </p>
        </form>
      )}
    </SettingGroup>
  );
}
