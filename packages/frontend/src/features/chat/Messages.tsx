import { memo, useState } from 'react';
import { Check, Copy, FileText } from 'lucide-react';
import type { Message } from '@plum-code-webui/shared';
import { useSessionStore, type GeneratedImage } from '@/stores/sessionStore';
import { cn } from '@/lib/utils';
import { Markdown } from './Markdown';
import { MediaImage } from './MediaImage';

const mediaUrl = (sessionId: string, mediaId: string) =>
  `/api/sessions/${encodeURIComponent(sessionId)}/media/${encodeURIComponent(mediaId)}`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Attachments({ message }: { message: Message }) {
  const media = message.media ?? [];
  const legacy = [...(message.images ?? []), ...(message.attachments ?? [])].filter(
    (item) => !media.some((m) => m.filename === item.filename)
  );
  if (media.length === 0 && legacy.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {media.map((item) =>
        item.mimeType.startsWith('image/') ? (
          <MediaImage
            key={item.id}
            url={mediaUrl(message.sessionId, item.id)}
            alt={item.altText || item.filename}
          />
        ) : (
          <FileChip key={item.id} name={item.filename} />
        )
      )}
      {legacy.map((item) => (
        <FileChip key={item.path} name={item.filename} />
      ))}
    </div>
  );
}

function FileChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
      <FileText className="h-3.5 w-3.5" aria-hidden />
      {name}
    </span>
  );
}

export const UserMessage = memo(function UserMessage({ message }: { message: Message }) {
  return (
    <div className="group flex flex-col items-end">
      <Attachments message={message} />
      {message.content && (
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed">
          {message.content}
        </div>
      )}
      <div className="mt-1 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <CopyButton text={message.content} />
      </div>
    </div>
  );
});

export const AssistantMessage = memo(function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="group">
      <Attachments message={message} />
      <Markdown content={message.content} className="font-serif text-[17px] leading-[1.65]" />
      <div className="mt-1 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <CopyButton text={message.content} />
      </div>
    </div>
  );
});

/** Compaction markers and other system notes: a quiet divider line. */
export function SystemNote({ message }: { message: Message }) {
  const compact = message.id.startsWith('compact-');
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="max-w-[70%] truncate">
        {compact ? 'Context compacted' : message.content}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GeneratedImageItem({ image }: { image: GeneratedImage }) {
  if (!image.imageBase64) return null;
  const src = `data:${image.mimeType};base64,${image.imageBase64}`;
  return (
    <figure className="space-y-1.5">
      <img
        src={src}
        alt={image.prompt}
        className="max-h-96 max-w-full rounded-lg border border-border"
      />
      <figcaption className="text-xs text-muted-foreground">{image.prompt}</figcaption>
    </figure>
  );
}

/** The answer being written right now; subscribes to the stream by itself. */
export function StreamingMessage({ sessionId }: { sessionId: string }) {
  const content = useSessionStore((s) => s.streamingContent[sessionId] ?? '');
  if (!content) return null;
  return <Markdown content={content} className={cn('font-serif text-[17px] leading-[1.65]')} />;
}
