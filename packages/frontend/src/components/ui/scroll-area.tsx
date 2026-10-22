import * as React from 'react';
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui-components/react/scroll-area';
import { cn } from '@/lib/utils';

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>, 'className'> & {
    className?: string;
  }
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.Scrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-opacity data-[scrolling]:opacity-100',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.Scrollbar>
));
ScrollBar.displayName = 'ScrollBar';

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>, 'className'> & {
    className?: string;
  }
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea, ScrollBar };
