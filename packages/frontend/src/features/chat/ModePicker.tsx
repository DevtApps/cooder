import { Brain, Check, ChevronDown, Hand, ShieldCheck, Zap, type LucideIcon } from 'lucide-react';
import type { SessionMode } from '@plum-code-webui/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const MODE_CONFIG: Array<{
  value: SessionMode;
  label: 'mode.plan' | 'mode.auto' | 'mode.ask' | 'mode.yolo';
  description:
    | 'mode.planDescription'
    | 'mode.autoDescription'
    | 'mode.askDescription'
    | 'mode.yoloDescription';
  icon: LucideIcon;
}> = [
  {
    value: 'planning',
    label: 'mode.plan',
    description: 'mode.planDescription',
    icon: Brain,
  },
  {
    value: 'auto-accept',
    label: 'mode.auto',
    description: 'mode.autoDescription',
    icon: ShieldCheck,
  },
  { value: 'manual', label: 'mode.ask', description: 'mode.askDescription', icon: Hand },
  { value: 'danger', label: 'mode.yolo', description: 'mode.yoloDescription', icon: Zap },
];

/** Permission mode chip for the composer. */
export function ModePicker({
  mode,
  onChange,
}: {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
}) {
  const { t } = useI18n();
  const modes = MODE_CONFIG.map((item) => ({
    ...item,
    label: t(item.label),
    description: t(item.description),
  }));
  const current = modes.find((item) => item.value === mode) ?? modes[1]!;
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('mode.permissionMode')}
        className={cn(
          'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-accent data-[popup-open]:bg-accent',
          mode === 'danger' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {current.label}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {modes.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onSelect={() => onChange(item.value)}
            className="items-start gap-2"
          >
            <Check
              className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', item.value !== mode && 'invisible')}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
