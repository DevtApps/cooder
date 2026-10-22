import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { CLIProvider } from '@plum-code-webui/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CLI_PROVIDER_LABEL } from '@/lib/providers';
import { modelLabel, useCliProviders } from '@/features/agents/useCliProviders';
import { cn } from '@/lib/utils';
import { effortOptions } from '@/features/agents/reasoning';
import { InstallAgentsDialog } from '@/features/agents/InstallAgentsDialog';
import { useI18n } from '@/lib/i18n';

interface AgentPickerProps {
  provider: CLIProvider;
  /** Pinned model; null means the agent's default. */
  model: string | null;
  onChange: (provider: CLIProvider, model: string | null) => void;
  disabled?: boolean;
  /** Reasoning effort (sessions only); null is the agent's default. */
  effort?: string | null;
  onEffortChange?: (effort: string | null) => void;
  /** Codex fast service tier. */
  fast?: boolean;
  onFastChange?: (fast: boolean) => void;
}

/**
 * Agent and model chip for the composer. Switching the agent resets the model
 * to that agent's default, since model ids do not carry across CLIs.
 */
export function AgentPicker({
  provider,
  model,
  onChange,
  disabled,
  effort,
  onEffortChange,
  fast,
  onFastChange,
}: AgentPickerProps) {
  const { t } = useI18n();
  const { usable, find } = useCliProviders();
  const current = find(provider);
  const models = current?.models ?? [];
  const defaultModel = current?.defaultModel;
  const providerName = current?.name || CLI_PROVIDER_LABEL[provider];
  const shownModel = model ?? defaultModel;
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 data-[popup-open]:bg-accent"
          aria-label={t('picker.agentAndModel')}
        >
          <span className="truncate">
            {providerName}
            {shownModel ? ` · ${modelLabel(current, shownModel)}` : ''}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="max-h-[60vh] w-64 overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('picker.agent')}
          </DropdownMenuLabel>
          {usable.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => item.id !== provider && onChange(item.id, null)}
              className="gap-2"
            >
              <Check
                className={cn('h-3.5 w-3.5', item.id !== provider && 'invisible')}
                aria-hidden
              />
              {item.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => setInstallOpen(true)}
            className="gap-2 text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('picker.installAgents')}
          </DropdownMenuItem>
          {models.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('picker.model')}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onChange(provider, null)} className="gap-2">
                <Check className={cn('h-3.5 w-3.5', model !== null && 'invisible')} aria-hidden />
                <span className="truncate">
                  {t('picker.default')}
                  {defaultModel ? ` (${modelLabel(current, defaultModel)})` : ''}
                </span>
              </DropdownMenuItem>
              {models.map((id) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => onChange(provider, id)}
                  className="gap-2"
                >
                  <Check className={cn('h-3.5 w-3.5', model !== id && 'invisible')} aria-hidden />
                  <span className="truncate">{modelLabel(current, id)}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {onEffortChange && effortOptions(provider, model).length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('picker.effort')}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onEffortChange(null)} className="gap-2">
                <Check className={cn('h-3.5 w-3.5', effort && 'invisible')} aria-hidden />
                {t('picker.default')}
              </DropdownMenuItem>
              {effortOptions(provider, model).map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => onEffortChange(option.value)}
                  className="gap-2"
                >
                  <Check
                    className={cn('h-3.5 w-3.5', effort !== option.value && 'invisible')}
                    aria-hidden
                  />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {onFastChange && provider === 'codex' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onFastChange(!fast)} className="gap-2">
                <Check className={cn('h-3.5 w-3.5', !fast && 'invisible')} aria-hidden />
                {t('picker.fastMode')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <InstallAgentsDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  );
}
