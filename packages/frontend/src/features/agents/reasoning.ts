import { CLAUDE_CODE_EFFORT_OPTIONS, type CLIProvider } from '@plum-code-webui/shared';

export interface EffortOption {
  value: string;
  label: string;
}

const LEVELS: EffortOption[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

/** The reasoning effort levels an agent accepts (the backend rejects others). */
export function effortOptions(provider: CLIProvider, model?: string | null): EffortOption[] {
  if (provider === 'claude' || provider === 'zai') {
    const opus55 = (model ?? '').replace(/\[1m\]$/i, '') === 'claude-opus-5-5';
    return CLAUDE_CODE_EFFORT_OPTIONS.map((option) =>
      opus55 && option.value === 'max' ? { ...option, label: 'Max · long thinking' } : option
    );
  }
  if (provider === 'opencode') return LEVELS;
  if (provider === 'pi') return [...LEVELS, { value: 'ultracode', label: 'Ultracode (workflows)' }];
  if (provider === 'vibe') {
    return [
      { value: 'off', label: 'Off' },
      ...LEVELS.filter((level) => level.value !== 'minimal'),
      { value: 'ultracode', label: 'Ultracode (workflows)' },
    ];
  }
  if (provider === 'kimi') return [];
  return [
    { value: 'none', label: 'None' },
    ...LEVELS,
    { value: 'xhigh', label: 'XHigh' },
    { value: 'ultra', label: 'Ultra' },
  ];
}
