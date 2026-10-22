import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Loader2, Mic, Paperclip, Square, X } from 'lucide-react';
import type { ActiveFollowupMode, Command } from '@plum-code-webui/shared';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useI18n } from '@/lib/i18n';

interface ComposerProps {
  onSend: (text: string, files: File[]) => Promise<unknown> | void;
  onInterrupt?: () => void;
  isRunning?: boolean;
  activeFollowupMode?: ActiveFollowupMode;
  queueDepth?: number;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Extra controls on the bottom row, left of the send button (model chip…). */
  controls?: ReactNode;
  /** Shown just before the send button (usage ring…). */
  trailing?: ReactNode;
  /** Persists the unsent text per conversation. */
  draftKey?: string;
  /** Slash commands offered while the text starts with `/`. */
  commands?: Command[];
  /** Runs a typed `/command` instead of sending it as a message. */
  onCommand?: (input: string) => void;
}

const MAX_HEIGHT_PX = 240;

function readDraft(key?: string) {
  if (!key) return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(key: string | undefined, value: string) {
  if (!key) return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode); the draft just isn't kept.
  }
}

/**
 * Message box in the Claude Code layout: text on top, attach on the left,
 * send on the right. While a turn runs and the box is empty, send becomes stop.
 */
export function Composer({
  onSend,
  onInterrupt,
  isRunning = false,
  activeFollowupMode = 'queue',
  queueDepth = 0,
  placeholder = 'Reply…',
  autoFocus,
  disabled,
  controls,
  trailing,
  draftKey,
  commands = [],
  onCommand,
}: ComposerProps) {
  const { t } = useI18n();
  const [text, setText] = useState(() => readDraft(draftKey));
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const voice = useVoiceInput((spoken) =>
    setText((current) =>
      current && !current.endsWith(' ') ? `${current} ${spoken}` : current + spoken
    )
  );
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(readDraft(draftKey)), [draftKey]);
  useEffect(() => writeDraft(draftKey, text), [draftKey, text]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const typingCommand = onCommand !== undefined && text.startsWith('/') && !/\s/.test(text);
  const suggestions = typingCommand
    ? commands.filter((command) => command.name.toLowerCase().includes(text.slice(1).toLowerCase()))
    : [];
  const menuOpen = suggestions.length > 0 && !menuClosed;
  const pickSuggestion = (command: Command) => {
    setText(`/${command.name} `);
    setMenuClosed(true);
    textareaRef.current?.focus();
  };

  const hasContent = text.trim().length > 0 || files.length > 0;
  const showStop = isRunning && !hasContent && !!onInterrupt;
  const sendLabel = isRunning
    ? activeFollowupMode === 'steer'
      ? t('composer.interruptAndSend')
      : t('composer.queueMessage')
    : t('composer.sendMessage');

  const submit = async () => {
    if (!hasContent || sending || disabled) return;
    if (onCommand && text.trim().startsWith('/') && files.length === 0) {
      onCommand(text.trim());
      setText('');
      return;
    }
    const outgoing = { text: text.trim(), files };
    setSending(true);
    setText('');
    setFiles([]);
    try {
      await onSend(outgoing.text, outgoing.files);
    } catch (error) {
      // Give the message back so nothing typed is lost.
      console.error('[COMPOSER] Send failed:', error);
      setText(outgoing.text);
      setFiles(outgoing.files);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="relative rounded-[20px] border border-border bg-field shadow-sm transition-colors focus-within:border-foreground/25">
      {menuOpen && (
        <ul
          role="listbox"
          aria-label={t('composer.commands')}
          className="absolute inset-x-0 bottom-full mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {suggestions.slice(0, 40).map((command, index) => (
            <li
              key={`${command.scope}:${command.name}`}
              role="option"
              aria-selected={index === menuIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickSuggestion(command);
                }}
                onMouseEnter={() => setMenuIndex(index)}
                className={cn(
                  'flex w-full items-baseline gap-3 rounded-lg px-3 py-1.5 text-left text-sm',
                  index === menuIndex && 'bg-accent'
                )}
              >
                <span className="font-mono">/{command.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {command.description}
                </span>
                {command.scope !== 'builtin' && (
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                    {command.scope}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-muted py-1 pl-2 pr-1 text-xs"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={t('composer.removeAttachment')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setMenuClosed(false);
          setMenuIndex(0);
        }}
        onKeyDown={(event) => {
          if (menuOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setMenuIndex((index) => (index + step + suggestions.length) % suggestions.length);
              return;
            }
            if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
              event.preventDefault();
              pickSuggestion(suggestions[Math.min(menuIndex, suggestions.length - 1)]!);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setMenuClosed(true);
              return;
            }
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
        onPaste={(event) => {
          const pasted = Array.from(event.clipboardData.files);
          if (pasted.length > 0) {
            event.preventDefault();
            setFiles((current) => [...current, ...pasted]);
          }
        }}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={t('composer.message')}
        className="block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:outline-none"
      />
      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > 0) setFiles((current) => [...current, ...picked]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t('composer.attachFiles')}
          title={t('composer.attachFiles')}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1">{controls}</div>
        {trailing}
        {voice.available && (
          <button
            type="button"
            onClick={voice.toggle}
            disabled={voice.busy}
            aria-label={voice.recording ? t('composer.stopDictation') : t('composer.dictate')}
            title={
              voice.error ?? (voice.recording ? t('composer.stopDictation') : t('composer.dictate'))
            }
            className={cn(
              'rounded-lg p-2 transition-colors hover:bg-accent',
              voice.recording ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {voice.busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        )}
        {queueDepth > 0 && (
          <span className="px-1 text-xs text-muted-foreground">
            {queueDepth} {t('composer.queued')}
          </span>
        )}
        {showStop ? (
          <button
            type="button"
            onClick={onInterrupt}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90"
            aria-label={t('composer.stop')}
            title={t('composer.stopWithShortcut')}
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!hasContent || sending || disabled}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground transition-opacity',
              'disabled:cursor-not-allowed disabled:opacity-40'
            )}
            aria-label={sendLabel}
            title={isRunning ? sendLabel : t('composer.send')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
