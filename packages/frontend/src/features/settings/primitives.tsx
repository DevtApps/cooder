import type { ReactNode } from 'react';
import { Panel, Section } from '@/features/shell/Page';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** One setting: title and help on the left, its control on the right. */
export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3',
        className
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** A titled card made of rows separated by lines. */
export function SettingGroup({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Section title={title} description={description} actions={actions}>
      <Panel className="divide-y divide-border">{children}</Panel>
    </Section>
  );
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow title={title} description={description}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
    </SettingRow>
  );
}

/** Labelled form field used inside a group. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 px-4 py-3">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
