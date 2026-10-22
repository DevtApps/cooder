import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder, Loader2 } from 'lucide-react';
import type { ApiResponse, DirectoryContents } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface HomeInfo {
  homeDir: string;
  allowedPaths: string[];
  commonPaths: { name: string; path: string }[];
}

function crumbs(path: string): Array<{ name: string; path: string }> {
  const parts = path.split('/').filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }));
}

/** Pick any folder the server may open as a project. */
export function FolderPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (path: string) => void;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const home = useQuery({
    queryKey: ['files-home'],
    queryFn: async () => (await api.get<ApiResponse<HomeInfo>>('/api/files/home')).data.data,
    enabled: open,
  });

  useEffect(() => {
    if (open && !current && home.data) {
      setCurrent(home.data.commonPaths[0]?.path ?? home.data.homeDir);
    }
  }, [current, home.data, open]);

  const listing = useQuery({
    queryKey: ['files-list', current],
    queryFn: async () =>
      (
        await api.get<ApiResponse<DirectoryContents>>(
          `/api/files?path=${encodeURIComponent(current!)}`
        )
      ).data.data,
    enabled: open && !!current,
    retry: false,
  });

  const folders = (listing.data?.files ?? [])
    .filter((file) => file.type === 'directory' && (showHidden || !file.name.startsWith('.')))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] max-w-xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t('folder.open')}</DialogTitle>
        </DialogHeader>

        {home.data && (
          <div className="flex flex-wrap gap-1.5">
            {home.data.commonPaths.map((shortcut) => (
              <button
                key={shortcut.path}
                type="button"
                onClick={() => setCurrent(shortcut.path)}
                className={cn(
                  'rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent',
                  current === shortcut.path && 'bg-accent'
                )}
              >
                {shortcut.name}
              </button>
            ))}
          </div>
        )}

        {current && (
          <nav
            aria-label={t('folder.path')}
            className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground"
          >
            <button
              type="button"
              onClick={() => setCurrent('/')}
              className="rounded px-1 hover:text-foreground"
            >
              /
            </button>
            {crumbs(current).map((crumb, index, all) => (
              <span key={crumb.path} className="flex items-center gap-0.5">
                {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
                <button
                  type="button"
                  onClick={() => setCurrent(crumb.path)}
                  className={cn(
                    'rounded px-1 hover:text-foreground',
                    index === all.length - 1 && 'font-medium text-foreground'
                  )}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        <div className="min-h-[14rem] flex-1 overflow-y-auto rounded-lg border border-border">
          {listing.isLoading || home.isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-label={t('folder.loading')}
              />
            </div>
          ) : listing.isError ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t('folder.cannotOpen')} {home.data?.allowedPaths.join(', ')}.
            </p>
          ) : folders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t('folder.noSubfolders')}</p>
          ) : (
            <ul className="p-1">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    onClick={() => setCurrent(folder.path)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            {t('folder.hidden')}
          </label>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('dialog.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!current || listing.isError}
            onClick={() => {
              if (!current) return;
              onPick(current);
              onOpenChange(false);
            }}
          >
            {t('folder.use')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
