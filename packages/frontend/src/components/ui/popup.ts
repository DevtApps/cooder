import { cn } from '@/lib/utils';

/**
 * Surface and motion shared by menus and select lists. Base UI exposes the
 * space left on screen as `--available-height`, so a long list scrolls
 * instead of running off the viewport.
 */
export function popupSurface() {
  return cn(
    'z-50 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none',
    'max-h-[min(30rem,var(--available-height,80dvh))]',
    'data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95',
    'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
    'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
  );
}
