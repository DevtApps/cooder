import { memo, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  FilePen,
  FileText,
  Globe,
  ListTodo,
  Loader2,
  Search,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ToolExecution } from '@plum-code-webui/shared';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const ICONS: Array<[RegExp, LucideIcon]> = [
  [/^(bash|shell|exec|command)/i, SquareTerminal],
  [/^(read|view|cat)/i, FileText],
  [/^(write|edit|multiedit|apply_patch|patch|notebookedit)/i, FilePen],
  [/^(grep|glob|search|find|ls)/i, Search],
  [/^(web|fetch|browser)/i, Globe],
  [/^(task|agent)/i, Bot],
  [/^todo/i, ListTodo],
];

function iconFor(toolName: string): LucideIcon {
  return ICONS.find(([pattern]) => pattern.test(toolName))?.[1] ?? Wrench;
}

const ARGUMENT_KEYS = [
  'command',
  'cmd',
  'file_path',
  'filePath',
  'path',
  'pattern',
  'query',
  'url',
  'description',
  'prompt',
];

/** The one argument that says what the call does, like Claude Code shows it. */
function primaryArgument(input: unknown): string {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  for (const key of ARGUMENT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.join(' ');
  }
  return '';
}

function displayName(toolName: string): string {
  // MCP tools arrive as mcp__server__tool; the tool part is what matters.
  const parts = toolName.split('__');
  return parts.length >= 3 ? parts.slice(2).join('__') : toolName;
}

/** Tool results are usually strings, but providers also send objects. */
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface Media {
  src: string;
  alt: string;
}

/** Image blocks as MCP (`data`+`mimeType`) and Anthropic (`source`) send them. */
function imageOf(block: unknown): Media | null {
  if (!block || typeof block !== 'object') return null;
  const b = block as Record<string, unknown>;
  if (b.type !== 'image') return null;
  const source = (b.source && typeof b.source === 'object' ? b.source : b) as Record<
    string,
    unknown
  >;
  const data = source.data;
  const mime = source.mimeType ?? source.media_type ?? source.mime_type ?? 'image/png';
  if (typeof data !== 'string' || !data) return null;
  if (data.startsWith('data:')) return { src: data, alt: 'Tool result' };
  return { src: `data:${String(mime)};base64,${data}`, alt: 'Tool result' };
}

/**
 * Splits a tool result into pictures and the rest. Results arrive as strings,
 * often JSON of `{ content: [...] }` or a list of blocks.
 */
function splitResult(value: unknown): { images: Media[]; rest: string } {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { images: [], rest: value };
      }
    } else {
      return { images: [], rest: value };
    }
  }
  const blocks = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { content?: unknown }).content)
      ? ((parsed as { content: unknown[] }).content as unknown[])
      : null;
  if (!blocks) return { images: [], rest: text(value) };
  const images: Media[] = [];
  const texts: string[] = [];
  for (const block of blocks) {
    const image = imageOf(block);
    if (image) images.push(image);
    else if (
      block &&
      typeof block === 'object' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      texts.push((block as { text: string }).text);
    } else if (typeof block === 'string') texts.push(block);
    else texts.push(text(block));
  }
  return { images, rest: texts.join('\n') };
}

function formatInput(input: unknown): string {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export const ToolCall = memo(function ToolCall({ tool }: { tool: ToolExecution }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(displayName(tool.toolName));
  const argument = tool.actionSummary?.title || primaryArgument(tool.input);
  const input = formatInput(tool.input);
  const { images, rest } = useMemo(() => splitResult(tool.result), [tool.result]);
  const output = text(tool.error) || rest;
  const [zoomed, setZoomed] = useState<Media | null>(null);
  const running = tool.status === 'started';
  const failed = tool.status === 'error';

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Running" />
        ) : (
          <Icon className={cn('h-3.5 w-3.5 shrink-0', failed && 'text-destructive')} aria-hidden />
        )}
        <span className="shrink-0 font-medium text-foreground">{displayName(tool.toolName)}</span>
        {argument && <span className="min-w-0 truncate font-mono text-xs">{argument}</span>}
        {failed && <span className="shrink-0 text-xs text-destructive">failed</span>}
        <ChevronRight
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100',
            open && 'rotate-90 opacity-100'
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-2 border-l border-border pl-3">
          {input && <ToolBlock label="Input" text={input} />}
          {output && <ToolBlock label={failed ? 'Error' : 'Output'} text={output} error={failed} />}
          {!input && !output && (
            <p className="text-xs text-muted-foreground">{running ? 'Running…' : 'No details.'}</p>
          )}
        </div>
      )}
      {images.length > 0 && (
        <div className="ml-5 mt-1 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setZoomed(image)}
              className="overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
              aria-label="Enlarge image"
            >
              <img src={image.src} alt={image.alt} className="max-h-80 max-w-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!zoomed} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-w-[min(96vw,1400px)] p-2">
          <DialogTitle className="sr-only">Image</DialogTitle>
          {zoomed && (
            <img
              src={zoomed.src}
              alt={zoomed.alt}
              className="max-h-[85dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

function ToolBlock({ label, text, error }: { label: string; text: string; error?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre
        className={cn(
          'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2.5 font-mono text-xs leading-relaxed',
          error && 'text-destructive'
        )}
      >
        {text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text}
      </pre>
    </div>
  );
}
