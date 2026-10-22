import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MousePointer2,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Square,
  Type,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { paths } from '@/features/shell/paths';
import { useBrowserPane, type Frame } from './useBrowserPane';

type Tool = 'interact' | 'pen' | 'box' | 'text';

interface Shape {
  tool: 'pen' | 'box' | 'text';
  points: Array<[number, number]>;
  text?: string;
}

const INK = '#ef4444';

function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
  for (const shape of shapes) {
    const [first, ...rest] = shape.points;
    if (!first) continue;
    if (shape.tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (const point of rest) ctx.lineTo(point[0], point[1]);
      ctx.stroke();
    } else if (shape.tool === 'box' && rest.length > 0) {
      const last = rest[rest.length - 1]!;
      ctx.strokeRect(first[0], first[1], last[0] - first[0], last[1] - first[1]);
    } else if (shape.tool === 'text' && shape.text) {
      ctx.fillText(shape.text, first[0], first[1]);
    }
  }
}

const iconButton =
  'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * The browser panel: a real Chrome on the backend, shown live. Tabs, address
 * bar and history work like any browser; the pen, box and text tools mark up
 * what is on screen and send it to the chat.
 */
export function BrowserPane({
  sessionId,
  sendFiles,
}: {
  sessionId: string;
  sendFiles: (text: string, files: File[]) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  // First measurement starts the connection; `live` follows the panel afterwards.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [live, setLive] = useState<{ width: number; height: number } | null>(null);
  const [address, setAddress] = useState('');
  const [addressFocused, setAddressFocused] = useState(false);
  const [tool, setTool] = useState<Tool>('interact');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textAt, setTextAt] = useState<[number, number] | null>(null);
  const [note, setNote] = useState('');

  const drawFrame = useCallback((frame: Frame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      if (canvas.width !== frame.width) canvas.width = frame.width;
      if (canvas.height !== frame.height) canvas.height = frame.height;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
    };
    image.src = `data:image/jpeg;base64,${frame.data}`;
  }, []);

  const { state, status, error, send, screenshot } = useBrowserPane(sessionId, size, drawFrame);
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);

  // Keep the page the size of the stage; the backend resizes Chrome to match.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let timer: number | undefined;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (next.width < 50 || next.height < 50) return;
      setLive(next);
      setSize((current) => {
        if (!current) return next;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => send('browser:resize', next), 150);
        return current;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [send]);

  useEffect(() => {
    if (!addressFocused) setAddress(active?.url === 'about:blank' ? '' : (active?.url ?? ''));
  }, [active?.url, addressFocused]);

  // --- Input to the page ----------------------------------------------------
  const point = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const buttonName = (button: number) =>
    button === 2 ? 'right' : button === 1 ? 'middle' : 'left';

  useEffect(() => {
    // Wheel must be non-passive to keep the app itself from scrolling.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (tool !== 'interact') return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      send('browser:mouse', {
        type: 'wheel',
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [send, tool]);

  // --- Ink ------------------------------------------------------------------
  useEffect(() => {
    const ink = inkRef.current;
    if (!ink || !live) return;
    ink.width = live.width;
    ink.height = live.height;
    const ctx = ink.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, ink.width, ink.height);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes);
  }, [shapes, draft, live]);

  const clearInk = () => {
    setShapes([]);
    setDraft(null);
    setTextAt(null);
  };

  const sendMarkup = async () => {
    const shot = await screenshot();
    if (!shot) {
      toast({ title: 'Nothing to send yet', variant: 'destructive' });
      return;
    }
    const image = new Image();
    image.src = `data:image/png;base64,${shot.data}`;
    await image.decode();
    const out = document.createElement('canvas');
    out.width = image.naturalWidth;
    out.height = image.naturalHeight;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    if (inkRef.current && shapes.length > 0) {
      ctx.drawImage(inkRef.current, 0, 0, out.width, out.height);
    }
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const message = [
      note.trim() || 'Here is the page I am looking at.',
      shot.url && `Page: ${shot.url}`,
    ]
      .filter(Boolean)
      .join('\n');
    sendFiles(message, [new File([blob], 'browser.png', { type: 'image/png' })]);
    clearInk();
    setNote('');
    setTool('interact');
  };

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">The browser could not start</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Link
          to={paths.settings('browser')}
          className="text-xs underline underline-offset-2 hover:text-foreground"
        >
          Open browser settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Browser tabs"
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto px-2 pt-2"
      >
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === state.activeTabId}
            className={cn(
              'group flex min-w-0 max-w-[10rem] items-center gap-1 rounded-t-md px-2.5 py-1.5 text-xs',
              tab.id === state.activeTabId
                ? 'bg-field text-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <button
              type="button"
              onClick={() => send('browser:select-tab', { tabId: tab.id })}
              className="min-w-0 flex-1 truncate text-left"
              title={tab.url}
            >
              {tab.loading && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />}
              {tab.title || (tab.url === 'about:blank' ? 'New tab' : tab.url)}
            </button>
            <button
              type="button"
              aria-label="Close tab"
              onClick={() => send('browser:close-tab', { tabId: tab.id })}
              className="rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label="New tab"
          onClick={() => send('browser:new-tab')}
          className={iconButton}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <form
        className="flex shrink-0 items-center gap-0.5 bg-field px-2 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (active && address.trim())
            send('browser:navigate', { tabId: active.id, url: address });
        }}
      >
        <button
          type="button"
          aria-label="Back"
          disabled={!active?.canGoBack}
          onClick={() => send('browser:nav', { action: 'back' })}
          className={iconButton}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!active?.canGoForward}
          onClick={() => send('browser:nav', { action: 'forward' })}
          className={iconButton}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={active?.loading ? 'Stop' : 'Reload'}
          onClick={() => send('browser:nav', { action: active?.loading ? 'stop' : 'reload' })}
          className={iconButton}
        >
          {active?.loading ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
        </button>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => {
            setAddressFocused(true);
            event.currentTarget.select();
          }}
          onBlur={() => setAddressFocused(false)}
          placeholder="Search or enter an address"
          aria-label="Address"
          spellCheck={false}
          className="mx-1 h-8 min-w-0 flex-1 rounded-full bg-background px-3 text-center text-xs outline-none focus:text-left focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
        {status === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-label="Starting the browser"
            />
          </div>
        )}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Web page"
          className="absolute left-0 top-0 h-full w-full outline-none"
          style={{
            width: live?.width,
            height: live?.height,
            cursor: tool === 'interact' ? 'default' : 'crosshair',
          }}
          onContextMenu={(event) => event.preventDefault()}
          onMouseMove={(event) =>
            tool === 'interact' && send('browser:mouse', { type: 'move', ...point(event) })
          }
          onMouseDown={(event) => {
            canvasRef.current?.focus();
            if (tool === 'interact') {
              send('browser:mouse', {
                type: 'down',
                button: buttonName(event.button),
                clickCount: event.detail || 1,
                ...point(event),
              });
            }
          }}
          onMouseUp={(event) =>
            tool === 'interact' &&
            send('browser:mouse', {
              type: 'up',
              button: buttonName(event.button),
              clickCount: event.detail || 1,
              ...point(event),
            })
          }
          onKeyDown={(event) => {
            if (tool !== 'interact' || event.nativeEvent.isComposing) return;
            // Pasting is handled by the paste event so the clipboard text is available.
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
            event.preventDefault();
            send('browser:key', { type: 'down', key: event.key });
          }}
          onKeyUp={(event) => {
            if (tool !== 'interact') return;
            event.preventDefault();
            send('browser:key', { type: 'up', key: event.key });
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (text) {
              event.preventDefault();
              send('browser:paste', { text });
            }
          }}
        />
        <canvas
          ref={inkRef}
          aria-hidden
          className={cn('absolute left-0 top-0', tool === 'interact' && 'pointer-events-none')}
          style={{ width: live?.width, height: live?.height, cursor: 'crosshair' }}
          onPointerDown={(event) => {
            if (tool === 'interact') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const { x, y } = point(event);
            if (tool === 'text') setTextAt([x, y]);
            else setDraft({ tool, points: [[x, y]] });
          }}
          onPointerMove={(event) => {
            if (!draft) return;
            const { x, y } = point(event);
            setDraft({
              ...draft,
              points: draft.tool === 'pen' ? [...draft.points, [x, y]] : [draft.points[0]!, [x, y]],
            });
          }}
          onPointerUp={() => {
            if (draft) setShapes((current) => [...current, draft]);
            setDraft(null);
          }}
        />
        {textAt && (
          <input
            autoFocus
            aria-label="Annotation text"
            className="absolute z-10 rounded border border-border bg-background px-1.5 py-0.5 text-sm"
            style={{ left: textAt[0], top: textAt[1] - 14, color: INK }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setTextAt(null);
              if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                setShapes((current) => [
                  ...current,
                  { tool: 'text', points: [textAt], text: event.currentTarget.value },
                ]);
                setTextAt(null);
              }
            }}
            onBlur={() => setTextAt(null)}
          />
        )}

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {(
            [
              ['interact', MousePointer2, 'Use the page'],
              ['pen', Pencil, 'Draw'],
              ['box', Square, 'Box'],
              ['text', Type, 'Text'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={tool === value}
              title={label}
              onClick={() => setTool(value)}
              className={cn(iconButton, tool === value && 'bg-accent text-foreground')}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          {tool !== 'interact' && (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void sendMarkup()}
                placeholder="Add a note"
                aria-label="Note for the agent"
                className="h-7 w-40 rounded-md bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                aria-label="Clear marks"
                title="Clear marks"
                onClick={clearInk}
                className={iconButton}
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Send to chat"
                title="Send to chat"
                onClick={() => void sendMarkup()}
                className={cn(iconButton, 'text-brand')}
              >
                <Send className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
