import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type Kind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx';

const MAX_LINES = 1500;

function classify(line: string): Kind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) return 'meta';
  if (line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file'))
    return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

const LINE_CLASS: Record<Kind, string> = {
  add: 'bg-success/10 text-foreground',
  del: 'bg-destructive/10 text-foreground',
  hunk: 'bg-info/10 text-info',
  meta: 'text-muted-foreground',
  ctx: 'text-muted-foreground',
};

/** Unified diff, colored by line; long diffs are cut and can be expanded. */
export function DiffView({ diff }: { diff: string }) {
  const [all, setAll] = useState(false);
  const lines = useMemo(() => diff.replace(/\n$/, '').split('\n'), [diff]);
  const shown = all ? lines : lines.slice(0, MAX_LINES);

  if (!diff.trim()) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No textual changes.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md bg-muted font-mono text-xs leading-5">
      {shown.map((line, index) => (
        <div key={index} className={cn('whitespace-pre px-3', LINE_CLASS[classify(line)])}>
          {line || ' '}
        </div>
      ))}
      {!all && lines.length > MAX_LINES && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full px-3 py-2 text-left text-muted-foreground underline"
        >
          Show {lines.length - MAX_LINES} more lines
        </button>
      )}
    </div>
  );
}
