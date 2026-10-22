import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

interface FileContent {
  path: string;
  content: string;
  size: number;
}

/** Read a file, or edit and save it in place. */
export function FileViewer({ path, onClose }: { path: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => setDraft(null), [path]);

  const file = useQuery({
    queryKey: ['file-content', path],
    queryFn: async () =>
      (
        await api.get<ApiResponse<FileContent>>(
          `/api/files/content?path=${encodeURIComponent(path!)}`
        )
      ).data.data!,
    enabled: !!path,
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (content: string) => api.put('/api/files/content', { path, content }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['file-content', path] });
      void queryClient.invalidateQueries({ queryKey: ['git-status'] });
    },
    onError: (error) =>
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      }),
  });

  const text = draft ?? file.data?.content ?? '';
  const editing = draft !== null;
  const lines = text.split('\n');

  return (
    <Dialog open={!!path} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80dvh] max-w-4xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm font-normal">{path}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted">
          {file.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-label="Loading"
              />
            </div>
          ) : file.isError ? (
            <p className="p-4 text-sm text-muted-foreground">
              This file cannot be shown here (binary or larger than 1 MB).
            </p>
          ) : editing ? (
            <textarea
              value={text}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault();
                  save.mutate(text);
                }
              }}
              spellCheck={false}
              aria-label="File contents"
              className="h-full w-full resize-none bg-transparent p-3 font-mono text-xs leading-5 outline-none"
            />
          ) : (
            <div className="flex font-mono text-xs leading-5">
              <div
                aria-hidden
                className="select-none border-r border-border px-3 py-3 text-right text-muted-foreground"
              >
                {lines.map((_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <pre className="min-w-0 flex-1 overflow-x-auto p-3">{text}</pre>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {file.data ? `${lines.length} lines` : ''}
          </span>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(text)}>
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!file.data}
              onClick={() => setDraft(file.data?.content ?? '')}
            >
              Edit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
