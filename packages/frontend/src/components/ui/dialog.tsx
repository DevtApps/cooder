import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui-components/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderAsChild } from './as-child';

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>, 'render'> & {
    asChild?: boolean;
  }
>(({ asChild, children, ...props }, ref) => (
  <DialogPrimitive.Trigger ref={ref} {...props} {...renderAsChild(asChild, children)} />
));
DialogTrigger.displayName = 'DialogTrigger';

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>, 'render'> & {
    asChild?: boolean;
  }
>(({ asChild, children, ...props }, ref) => (
  <DialogPrimitive.Close ref={ref} {...props} {...renderAsChild(asChild, children)} />
));
DialogClose.displayName = 'DialogClose';

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/55 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0',
      className as string
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 sm:rounded-lg',
        className as string
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Popup>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className as string)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className as string)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
