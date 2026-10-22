import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui-components/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { popupSurface } from './popup';

type SelectProps = Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>,
  'onValueChange'
> & { onValueChange?: (value: string) => void };

function Select({ onValueChange, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      {...props}
      onValueChange={onValueChange ? (value) => onValueChange(String(value ?? '')) : undefined}
    />
  );
}

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>, 'className'> & {
    className?: string;
  }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectScrollUpButton = () => (
  <SelectPrimitive.ScrollUpArrow className="flex cursor-default items-center justify-center py-1">
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpArrow>
);

const SelectScrollDownButton = () => (
  <SelectPrimitive.ScrollDownArrow className="flex cursor-default items-center justify-center py-1">
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownArrow>
);

const SelectContent = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup>, 'className'> & {
    className?: string;
  }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner sideOffset={4} collisionPadding={12} className="z-50 outline-none">
      <SelectPrimitive.Popup
        ref={ref}
        className={cn(
          popupSurface(),
          'relative min-w-[var(--anchor-width)] overflow-hidden',
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List className="max-h-[inherit] overflow-y-auto p-1 outline-none">
          {children}
        </SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.GroupLabel>, 'className'> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <SelectPrimitive.GroupLabel
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>, 'className'> & {
    className?: string;
  }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-foreground/10 data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

const SelectSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div role="separator" className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
);

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
