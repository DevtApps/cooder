import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTO_DISMISS_MS = 5000;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg animate-in fade-in-0 slide-in-from-bottom-4',
  {
    variants: {
      variant: {
        default: 'border border-border bg-popover text-popover-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

interface ToastProps
  extends Omit<React.HTMLAttributes<HTMLLIElement>, 'title'>, VariantProps<typeof toastVariants> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Milliseconds before it closes itself. */
  duration?: number;
}

type ToastActionElement = React.ReactElement;

function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const ToastViewport = ({ children }: { children?: React.ReactNode }) => (
  <ol
    aria-live="polite"
    className="pointer-events-none fixed top-0 z-[100] m-0 flex max-h-screen w-full list-none flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]"
  >
    {children}
  </ol>
);

const Toast = React.forwardRef<HTMLLIElement, ToastProps>(
  (
    { className, variant, open = true, onOpenChange, duration = AUTO_DISMISS_MS, ...props },
    ref
  ) => {
    React.useEffect(() => {
      if (!open || !onOpenChange) return;
      const timer = window.setTimeout(() => onOpenChange(false), duration);
      return () => window.clearTimeout(timer);
    }, [open, onOpenChange, duration]);
    if (!open) return null;
    return (
      <li
        ref={ref}
        role="status"
        className={cn(toastVariants({ variant }), 'mb-2', className)}
        {...props}
      />
    );
  }
);
Toast.displayName = 'Toast';

const ToastAction = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
);

const ToastClose = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    aria-label="Dismiss"
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100',
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
);

const ToastTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('text-sm font-semibold', className)} {...props} />
);

const ToastDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('text-sm opacity-90', className)} {...props} />
);

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
