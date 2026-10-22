import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Github,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type { ApiResponse, GitStatus } from '@plum-code-webui/shared';
import { api, ApiError } from '@/services/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PushToGitHubDialog } from '@/features/tools/github/PushToGitHubDialog';
import { DiffView } from './DiffView';

type Group = 'staged' | 'unstaged' | 'untracked';

const STATUS_REFRESH_MS = 8_000;

interface FileDiff {
  diff: string;
  additions: number;
  deletions: number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Working-tree changes of the project: review, stage, commit. */
export function ChangesTab({ cwd, isRunning }: { cwd: string; isRunning: boolean }) {
  const queryClient = useQueryClient();
  const key = ['git-status', cwd];
  const [open, setOpen] = useState<{ group: Group; file: string } | null>(null);
  const [message, setMessage] = useState('');

  const status = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get<ApiResponse<GitStatus>>(`/api/git/status?path=${encodeURIComponent(cwd)}`))
        .data.data,
    refetchInterval: STATUS_REFRESH_MS,
    retry: false,
  });

  const [publishOpen, setPublishOpen] = useState(false);
  const remotes = useQuery({
    queryKey: ['git-remotes', cwd],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ name: string; url: string }>>>(
          `/api/git/remotes?path=${encodeURIComponent(cwd)}`
        )
      ).data.data ?? [],
    enabled: status.isSuccess,
  });
  const sync = useQuery({
    queryKey: ['git-sync', cwd],
    queryFn: async () =>
      (
        await api.get<ApiResponse<{ tracking: string | null; ahead: number; behind: number }>>(
          `/api/git/remote-status?path=${encodeURIComponent(cwd)}`
        )
      ).data.data,
    enabled: status.isSuccess && (remotes.data?.length ?? 0) > 0,
    refetchInterval: 30_000,
  });

  // A finished turn usually changed files.
  useEffect(() => {
    if (!isRunning) void queryClient.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
    void queryClient.invalidateQueries({ queryKey: ['git-sync', cwd] });
    void queryClient.invalidateQueries({ queryKey: ['git-remotes', cwd] });
  };

  const run = useMutation({
    mutationFn: async (action: { url: string; body: Record<string, unknown> }) =>
      api.post(action.url, { path: cwd, ...action.body }),
    onSuccess: refresh,
    onError: (error) =>
      toast({ title: 'Git failed', description: errorText(error), variant: 'destructive' }),
  });

  const commit = useMutation({
    mutationFn: async () => api.post('/api/git/commit', { path: cwd, message: message.trim() }),
    onSuccess: () => {
      setMessage('');
      setOpen(null);
      refresh();
    },
    onError: (error) =>
      toast({ title: 'Commit failed', description: errorText(error), variant: 'destructive' }),
  });

  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post<ApiResponse<{ message: string }>>('/api/git/generate-commit-message', {
          path: cwd,
        })
      ).data.data?.message ?? '',
    onSuccess: (text) => text && setMessage(text),
    onError: (error) =>
      toast({
        title: 'Could not write a message',
        description: errorText(error),
        variant: 'destructive',
      }),
  });

  if (status.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  if (status.isError) {
    const notRepo = status.error instanceof ApiError && /not a git/i.test(status.error.message);
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {notRepo ? 'This folder is not a git repository.' : 'Git status could not be read.'}
      </p>
    );
  }

  const git = status.data!;
  const groups: Array<{ group: Group; title: string; files: string[] }> = [
    { group: 'staged', title: 'Staged', files: git.staged },
    { group: 'unstaged', title: 'Changes', files: git.unstaged },
    { group: 'untracked', title: 'New files', files: git.untracked },
  ];

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" aria-hidden />
          {git.branch}
          {git.isClean && <span>· clean</span>}
        </span>
        {(remotes.data?.length ?? 0) > 0 ? (
          <>
            {sync.data && sync.data.behind > 0 && (
              <button
                type="button"
                onClick={() => run.mutate({ url: '/api/git/pull', body: {} })}
                className="flex items-center gap-0.5 hover:text-foreground"
                title="Pull the commits you are behind"
              >
                <ArrowDown className="h-3 w-3" aria-hidden />
                {sync.data.behind} behind · Pull
              </button>
            )}
            {sync.data && sync.data.ahead > 0 && (
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="flex items-center gap-0.5 hover:text-foreground"
                title="Push your commits"
              >
                <ArrowUp className="h-3 w-3" aria-hidden />
                {sync.data.ahead} ahead · Push
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Github className="h-3 w-3" aria-hidden />
            Publish to GitHub
          </button>
        )}
      </div>

      {groups
        .filter((group) => group.files.length > 0)
        .map(({ group, title, files }) => (
          <section key={group} className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium">
                {title} <span className="text-muted-foreground">{files.length}</span>
              </h3>
              {group !== 'staged' && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => run.mutate({ url: '/api/git/stage', body: { files } })}
                >
                  Stage all
                </button>
              )}
            </div>
            <ul>
              {files.map((file) => {
                const active = open?.group === group && open.file === file;
                return (
                  <li key={`${group}:${file}`}>
                    <div className="group flex items-center gap-1 rounded-md hover:bg-accent">
                      <button
                        type="button"
                        onClick={() => setOpen(active ? null : { group, file })}
                        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left font-mono text-xs"
                        title={file}
                      >
                        {file}
                      </button>
                      <div className="flex shrink-0 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        {group === 'staged' ? (
                          <IconButton
                            label={`Unstage ${file}`}
                            onClick={() =>
                              run.mutate({ url: '/api/git/unstage', body: { files: [file] } })
                            }
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </IconButton>
                        ) : (
                          <>
                            {group === 'unstaged' && (
                              <IconButton
                                label={`Discard changes to ${file}`}
                                onClick={() => {
                                  if (window.confirm(`Discard your changes to ${file}?`)) {
                                    run.mutate({ url: '/api/git/discard', body: { file } });
                                  }
                                }}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </IconButton>
                            )}
                            <IconButton
                              label={`Stage ${file}`}
                              onClick={() =>
                                run.mutate({ url: '/api/git/stage', body: { files: [file] } })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </div>
                    {active && (
                      <FileChange
                        cwd={cwd}
                        file={file}
                        staged={group === 'staged'}
                        untracked={group === 'untracked'}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {git.isClean && <p className="py-6 text-center text-sm text-muted-foreground">No changes.</p>}

      {git.staged.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            placeholder="Commit message"
            aria-label="Commit message"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Write it
            </Button>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!message.trim() || commit.isPending}
              onClick={() => commit.mutate()}
            >
              Commit {git.staged.length}
            </Button>
          </div>
        </div>
      )}
      <PushToGitHubDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        workingDirectory={cwd}
        currentBranch={git.branch}
        remotes={remotes.data ?? []}
        onPushed={refresh}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn('rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground')}
    >
      {children}
    </button>
  );
}

function FileChange({
  cwd,
  file,
  staged,
  untracked,
}: {
  cwd: string;
  file: string;
  staged: boolean;
  untracked: boolean;
}) {
  const diff = useQuery({
    queryKey: ['git-diff', cwd, file, staged, untracked],
    queryFn: async (): Promise<FileDiff> => {
      if (untracked) {
        // git has no diff for a file it has never seen: show it as all added.
        const response = await api.get<ApiResponse<{ content: string }>>(
          `/api/files/content?path=${encodeURIComponent(`${cwd.replace(/\/$/, '')}/${file}`)}`
        );
        const content = response.data.data?.content ?? '';
        const lines = content.split('\n');
        return {
          diff: lines.map((line) => `+${line}`).join('\n'),
          additions: lines.length,
          deletions: 0,
        };
      }
      const response = await api.get<ApiResponse<FileDiff>>(
        `/api/git/diff-file?path=${encodeURIComponent(cwd)}&file=${encodeURIComponent(file)}&staged=${staged}`
      );
      return response.data.data!;
    },
  });

  return (
    <div className="mb-2 mt-1 space-y-1">
      {diff.isLoading && <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />}
      {diff.isError && (
        <p className="px-2 text-xs text-muted-foreground">This file cannot be shown as a diff.</p>
      )}
      {diff.data && (
        <>
          <p className="px-2 text-[11px] text-muted-foreground">
            <span className="text-success">+{diff.data.additions}</span>{' '}
            <span className="text-destructive">−{diff.data.deletions}</span>
          </p>
          <DiffView diff={diff.data.diff} />
        </>
      )}
    </div>
  );
}
