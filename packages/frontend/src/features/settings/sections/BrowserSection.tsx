import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { FolderPicker } from '@/features/home/FolderPicker';
import { SettingGroup, SettingRow, SwitchRow } from '../primitives';

interface Binary {
  path: string;
  source: 'cooder' | 'system' | 'env';
  version: string | null;
}

interface BrowserStatus {
  use: 'chrome';
  chrome: Binary | null;
  firefox: Binary | null;
  browsersDir: string;
  downloadsDir: string;
  settings: { downloadsDir: string | null; allowDownloads: boolean };
}

const SOURCE: Record<Binary['source'], string> = {
  cooder: 'installed by Cooder',
  system: 'found on this computer',
  env: 'set by environment variable',
};

export function BrowserSection() {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [installing, setInstalling] = useState<'chrome' | 'firefox' | null>(null);

  const status = useQuery({
    queryKey: ['browser-status'],
    queryFn: async () =>
      (await api.get<ApiResponse<BrowserStatus>>('/api/browser/status')).data.data,
  });

  const save = useMutation({
    mutationFn: async (patch: { downloadsDir?: string | null; allowDownloads?: boolean }) =>
      api.put('/api/browser/settings', patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['browser-status'] }),
    onError: (error: Error) =>
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' }),
  });

  const install = async (browser: 'chrome' | 'firefox') => {
    setInstalling(browser);
    try {
      await api.post('/api/browser/install', { browser });
      toast({ title: browser === 'chrome' ? 'Chrome installed' : 'Firefox installed' });
    } catch (error) {
      toast({
        title: 'The download failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setInstalling(null);
      await queryClient.invalidateQueries({ queryKey: ['browser-status'] });
    }
  };

  const data = status.data;
  const row = (name: 'chrome' | 'firefox', label: string, note: string) => {
    const binary = data?.[name] ?? null;
    return (
      <SettingRow
        key={name}
        title={label}
        description={
          binary ? (
            <>
              {binary.version ?? 'Installed'} · {SOURCE[binary.source]}
              <br />
              <span className="font-mono">{binary.path}</span>
            </>
          ) : (
            note
          )
        }
      >
        {binary?.source === 'cooder' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Installed
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={installing !== null}
            onClick={() => void install(name)}
          >
            {installing === name && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {installing === name ? 'Downloading…' : binary ? 'Download a copy' : 'Download'}
          </Button>
        )}
      </SettingRow>
    );
  };

  return (
    <>
      <SettingGroup
        title="Browsers"
        description="The browser panel always runs Chrome. A copy downloaded here lives in Cooder's own folder and takes priority over the one on this computer."
      >
        {row('chrome', 'Chrome', 'Not found. Download it to use the browser panel.')}
        {row('firefox', 'Firefox', 'Optional. It is not used by the browser panel.')}
      </SettingGroup>

      <SettingGroup title="Downloads" description="Files the page downloads.">
        <SwitchRow
          title="Allow downloads"
          description="When off, every download a page starts is cancelled."
          checked={data?.settings.allowDownloads ?? true}
          disabled={save.isPending || !data}
          onChange={(allowDownloads) => save.mutate({ allowDownloads })}
        />
        <SettingRow
          title="Save to"
          description={<span className="font-mono">{data?.downloadsDir}</span>}
        >
          <div className="flex gap-2">
            {data?.settings.downloadsDir && (
              <Button variant="ghost" size="sm" onClick={() => save.mutate({ downloadsDir: null })}>
                Use default
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              Choose folder
            </Button>
          </div>
        </SettingRow>
      </SettingGroup>
      <FolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(downloadsDir) => save.mutate({ downloadsDir })}
      />
    </>
  );
}
