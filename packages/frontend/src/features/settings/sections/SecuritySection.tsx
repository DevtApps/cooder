import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Field, SettingGroup, SwitchRow } from '../primitives';
import { FirefoxBrowserPanel } from '../panels/FirefoxBrowserPanel';
import { GatewayTokensPanel } from '../panels/GatewayTokensPanel';

interface Credentials {
  username: string;
  enabled: boolean;
}

function errorToast(error: Error) {
  toast({ title: 'Error', description: error.message, variant: 'destructive' });
}

export function SecuritySection() {
  const credentials = useQuery({
    queryKey: ['basic-auth-credentials'],
    queryFn: async () =>
      (await api.get<ApiResponse<Credentials>>('/api/basic-auth/credentials')).data.data,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) =>
      (await api.put<ApiResponse<{ enabled: boolean }>>('/api/basic-auth/toggle', { enabled })).data
        .data,
    onSuccess: () => void credentials.refetch(),
    onError: errorToast,
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = newPassword !== '' && confirm !== '' && newPassword !== confirm;

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.put<ApiResponse<{ message: string }>>('/api/basic-auth/credentials', {
          currentPassword,
          newUsername: newUsername || undefined,
          newPassword: newPassword || undefined,
        })
      ).data.data,
    onSuccess: (data) => {
      void credentials.refetch();
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirm('');
      toast({ title: data?.message || 'Credentials updated' });
    },
    onError: errorToast,
  });

  const canSubmit =
    currentPassword !== '' &&
    (newUsername !== '' || newPassword !== '') &&
    (newPassword === '' || newPassword === confirm) &&
    !update.isPending;

  return (
    <>
      <SettingGroup title="Password gate">
        <SwitchRow
          title="Ask for a password before sign-in"
          description={
            <>
              Recommended when Cooder is reachable beyond a private network. Username:{' '}
              <span className="font-mono">{credentials.data?.username || 'admin'}</span>
            </>
          }
          checked={credentials.data?.enabled ?? false}
          onChange={(enabled) => toggle.mutate(enabled)}
          disabled={toggle.isPending || credentials.isLoading}
        />
      </SettingGroup>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) update.mutate();
        }}
      >
        <SettingGroup
          title="Change credentials"
          description="Rotate the gate's username or password."
        >
          <Field label="Current password" htmlFor="cred-current">
            <Input
              id="cred-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field
            label="New username"
            htmlFor="cred-user"
            hint="Leave empty to keep the current one."
          >
            <Input
              id="cred-user"
              autoComplete="username"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="cred-new"
            hint="Leave empty to keep the current one."
          >
            <Input
              id="cred-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          {newPassword && (
            <Field label="Repeat the new password" htmlFor="cred-confirm">
              <Input
                id="cred-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                aria-invalid={mismatch}
                onChange={(event) => setConfirm(event.target.value)}
              />
              {mismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
            </Field>
          )}
          <div className="flex justify-end px-4 py-3">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {update.isPending ? 'Updating…' : 'Update credentials'}
            </Button>
          </div>
        </SettingGroup>
      </form>

      <GatewayTokensPanel />
      <FirefoxBrowserPanel />
    </>
  );
}
