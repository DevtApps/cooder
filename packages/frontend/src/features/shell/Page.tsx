import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageProps {
  title: string;
  description?: string;
  /** Controls on the right of the title (period tabs, buttons…). */
  actions?: ReactNode;
  /** Widen the column for dense pages such as tables and charts. */
  wide?: boolean;
  children: ReactNode;
}

/** Frame of every full-page screen: one scroll area, one centered column. */
export function Page({ title, description, actions, wide, children }: PageProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          'mx-auto w-full space-y-8 px-4 pb-16 pt-6 sm:px-6',
          wide ? 'max-w-6xl' : 'max-w-3xl'
        )}
      >
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}

/** A titled group inside a page. */
export function Section({
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
    <section className="space-y-3">
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-medium">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>;
}

/** Segmented control for a small fixed set of choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs transition-colors',
            option.value === value
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
