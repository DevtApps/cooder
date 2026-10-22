import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui-components/react/menu';
import { useIsDesktopLayout } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { popupSurface } from './popup';
import { renderAsChild } from './as-child';

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuGroup = MenuPrimitive.Group;
const DropdownMenuPortal = MenuPrimitive.Portal;
const DropdownMenuSub = MenuPrimitive.SubmenuRoot;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const itemClass =
  'relative flex cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-foreground/10 data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof MenuPrimitive.Trigger>, 'render' | 'className'> & {
    asChild?: boolean;
    className?: string;
  }
>(({ asChild, children, ...props }, ref) => (
  <MenuPrimitive.Trigger ref={ref} {...props} {...renderAsChild(asChild, children)} />
));
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

interface ContentProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: React.ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  /** Opens beside the trigger on desktop and below it on phones. */
  navigation?: boolean;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ className, navigation = false, sideOffset = 8, side, align, children, ...props }, ref) => {
    const desktop = useIsDesktopLayout();
    return (
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          side={navigation ? (desktop ? 'right' : 'bottom') : side}
          align={navigation ? 'start' : align}
          sideOffset={sideOffset}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup
            ref={ref}
            className={cn(popupSurface(), 'min-w-[8rem] p-1', className)}
            {...props}
          >
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    );
  }
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ className, sideOffset = 6, children, ...props }, ref) => (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} collisionPadding={12} className="z-50">
        <MenuPrimitive.Popup
          ref={ref}
          className={cn(popupSurface(), 'min-w-[8rem] p-1', className)}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
);
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubmenuTrigger>, 'className'> & {
    className?: string;
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <MenuPrimitive.SubmenuTrigger
    ref={ref}
    className={cn(itemClass, 'data-[popup-open]:bg-foreground/10', inset && 'pl-8', className)}
    {...props}
  />
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

type ItemProps = Omit<React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>, 'className'> & {
  className?: string;
  inset?: boolean;
  /** Runs when the item is chosen, by click or keyboard. */
  onSelect?: (event: Event) => void;
};

const DropdownMenuItem = React.forwardRef<HTMLDivElement, ItemProps>(
  ({ className, inset, onSelect, onClick, ...props }, ref) => (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(itemClass, inset && 'pl-8', className)}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.(event.nativeEvent);
      }}
      {...props}
    />
  )
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof MenuPrimitive.GroupLabel>, 'className'> & {
    className?: string;
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    role="presentation"
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    {...(props as React.HTMLAttributes<HTMLDivElement>)}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
