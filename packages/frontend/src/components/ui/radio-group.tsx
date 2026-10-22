import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui-components/react/radio-group';
import { Radio } from '@base-ui-components/react/radio';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

type RadioGroupProps = Omit<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive>,
  'onValueChange' | 'className'
> & {
  className?: string;
  onValueChange?: (value: string) => void;
};

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, onValueChange, ...props }, ref) => (
    <RadioGroupPrimitive
      ref={ref}
      className={cn('grid gap-2', className)}
      onValueChange={onValueChange ? (value) => onValueChange(String(value)) : undefined}
      {...props}
    />
  )
);
RadioGroup.displayName = 'RadioGroup';

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof Radio.Root>, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <Radio.Root
    ref={ref}
    className={cn(
      'flex aspect-square h-4 w-4 items-center justify-center rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <Radio.Indicator className="flex items-center justify-center">
      <Circle className="h-2.5 w-2.5 fill-current" />
    </Radio.Indicator>
  </Radio.Root>
));
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
