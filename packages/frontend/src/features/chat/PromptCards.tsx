import { useMemo, useState } from 'react';
import { MessageCircleQuestion, ShieldAlert } from 'lucide-react';
import type { PendingPermission, PendingQuestion, PermissionAction } from '@plum-code-webui/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function previewInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const key of ['command', 'file_path', 'path', 'url', 'pattern']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return '';
    }
  }
  return '';
}

/** Inline approval, like Claude Code's "Do you want to proceed?" prompt. */
export function ApprovalCard({
  permission,
  onRespond,
}: {
  permission: PendingPermission;
  onRespond: (action: PermissionAction, pattern?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const preview = previewInput(permission.toolInput);
  const respond = async (action: PermissionAction) => {
    setBusy(true);
    try {
      const withPattern = action === 'allow_project' || action === 'allow_global';
      await onRespond(action, withPattern ? permission.suggestedPattern : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label={`Permission for ${permission.toolName}`}
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">
            <span className="font-medium">{permission.toolName}</span>{' '}
            <span className="text-muted-foreground">
              {permission.description || 'wants to run.'}
            </span>
          </p>
          {preview && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2.5 font-mono text-xs">
              {preview}
            </pre>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={() => void respond('allow_once')}>
              Allow once
            </Button>
            {permission.suggestedPattern && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void respond('allow_project')}
                title={permission.suggestedPattern}
              >
                Always allow in this project
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void respond('deny')}>
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Questions the agent asks, answered by choosing options or typing. */
export function QuestionCard({
  question,
  onRespond,
}: {
  question: PendingQuestion;
  onRespond: (answers: string[][] | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[][]>(() => question.questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(() => question.questions.map(() => ''));
  const [busy, setBusy] = useState(false);

  const complete = useMemo(
    () =>
      question.questions.every(
        (item, index) =>
          (selected[index]?.length ?? 0) > 0 || (item.custom && custom[index]?.trim())
      ),
    [custom, question.questions, selected]
  );

  const toggle = (index: number, label: string, multiple: boolean) =>
    setSelected((current) =>
      current.map((entry, i) => {
        if (i !== index) return entry;
        if (!multiple) return entry[0] === label ? [] : [label];
        return entry.includes(label) ? entry.filter((l) => l !== label) : [...entry, label];
      })
    );

  const submit = async (answers: string[][] | null) => {
    setBusy(true);
    try {
      await onRespond(answers);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Question from the agent"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <div className="min-w-0 flex-1 space-y-4">
          {question.questions.map((item, index) => (
            <fieldset key={index} className="space-y-2">
              <legend className="text-sm font-medium">{item.question || item.header}</legend>
              <div className="flex flex-col gap-1.5">
                {item.options.map((option) => {
                  const active = selected[index]?.includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(index, option.label, Boolean(item.multiple))}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        active
                          ? 'border-foreground/40 bg-accent'
                          : 'border-border hover:bg-accent/60'
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      {option.description && (
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </button>
                  );
                })}
                {item.custom && (
                  <input
                    value={custom[index] ?? ''}
                    onChange={(event) =>
                      setCustom((current) =>
                        current.map((v, i) => (i === index ? event.target.value : v))
                      )
                    }
                    placeholder="Other…"
                    className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
              </div>
            </fieldset>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !complete}
              onClick={() =>
                void submit(
                  selected.map((entry, index) => {
                    const text = custom[index]?.trim();
                    return text ? [...entry, text] : entry;
                  })
                )
              }
            >
              Answer
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void submit(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
