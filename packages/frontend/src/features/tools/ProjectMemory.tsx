import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ApiResponse } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface Fact {
  id: string;
  content: string;
  sourceSessionId: string | null;
  updatedAt: string;
}

const MAX_CHARS = 500;

/** Facts every session of this project starts from; agents add them, you curate them. */
export function ProjectMemory({ workingDirectory }: { workingDirectory: string }) {
  const queryClient = useQueryClient();
  const key = ['project-memory', workingDirectory];
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const facts = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await api.get<ApiResponse<Fact[]>>(
          `/api/project-memory?workingDirectory=${encodeURIComponent(workingDirectory)}`
        )
      ).data.data ?? [],
    refetchInterval: 10_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) =>
    toast({
      title: 'Could not save',
      description: error instanceof Error ? error.message : undefined,
      variant: 'destructive',
    });

  const add = useMutation({
    mutationFn: () => api.post('/api/project-memory', { workingDirectory, content: draft }),
    onSuccess: () => {
      setDraft('');
      void refresh();
    },
    onError,
  });
  const save = useMutation({
    mutationFn: (value: { id: string; text: string }) =>
      api.put(`/api/project-memory/${value.id}`, { workingDirectory, content: value.text }),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete(
        `/api/project-memory/${id}?workingDirectory=${encodeURIComponent(workingDirectory)}`
      ),
    onSuccess: refresh,
    onError,
  });

  const icon =
    'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="px-4 pb-2 pt-3 text-xs text-muted-foreground">
        Short facts every session of this project starts with. Agents save what is worth keeping
        beyond one conversation; edit or remove anything that is wrong.
      </p>

      <div className="px-3 pb-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_CHARS))}
          placeholder="Add a fact, e.g. “Tests run with pnpm test:backend; the DB is Postgres 16.”"
          rows={2}
          className="resize-none text-sm"
        />
        <div className="mt-1.5 flex items-center justify-end gap-2">
          <span className="text-[11px] text-muted-foreground">
            {draft.length}/{MAX_CHARS}
          </span>
          <Button size="sm" disabled={!draft.trim() || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {facts.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : (facts.data?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing saved for this project yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {facts.data!.map((fact) => (
              <li key={fact.id} className="rounded-lg border border-border p-2.5">
                {editing?.id === fact.id ? (
                  <div className="space-y-1.5">
                    <Textarea
                      autoFocus
                      value={editing.text}
                      onChange={(event) =>
                        setEditing({ id: fact.id, text: event.target.value.slice(0, MAX_CHARS) })
                      }
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className={icon}
                        onClick={() => setEditing(null)}
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={icon}
                        disabled={!editing.text.trim() || save.isPending}
                        onClick={() => save.mutate(editing)}
                        aria-label="Save"
                      >
                        {save.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm leading-snug">
                      {fact.content}
                    </p>
                    <button
                      type="button"
                      className={icon}
                      onClick={() => setEditing({ id: fact.id, text: fact.content })}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={icon}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(fact.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fact.sourceSessionId ? 'Saved by an agent' : 'Added by you'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
