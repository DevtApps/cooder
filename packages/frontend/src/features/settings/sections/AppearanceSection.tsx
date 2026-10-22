import { useState } from 'react';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { Theme } from '@plum-code-webui/shared';
import type { Language } from '@plum-code-webui/shared';
import {
  applyTheme,
  getStoredTheme,
  normalizeTheme,
  setStoredTheme,
} from '@/stores/appearanceStore';
import { cn } from '@/lib/utils';
import { Field, SettingGroup, SwitchRow } from '../primitives';
import { useUserSettings } from '../useUserSettings';
import { useI18n } from '@/lib/i18n';

export function AppearanceSection() {
  const { settings, update } = useUserSettings();
  const { language, setLanguage, t } = useI18n();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const themes: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
    { value: 'light', label: t('appearance.light'), icon: Sun },
    { value: 'dark', label: t('appearance.dark'), icon: Moon },
    { value: 'system', label: t('appearance.system'), icon: Monitor },
  ];

  const choose = (next: Theme) => {
    const value = normalizeTheme(next);
    setStoredTheme(value);
    setTheme(value);
    applyTheme(value);
    // Appearance is per device unless the account opted into syncing it.
    if (settings?.appearanceSync) update.mutate({ theme: value });
  };

  return (
    <>
      <SettingGroup title={t('appearance.theme')}>
        <div className="grid grid-cols-3 gap-2 p-3">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => choose(value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors',
                theme === value
                  ? 'border-foreground/40 bg-accent'
                  : 'border-border hover:bg-accent/60'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {theme === value && <Check className="h-3.5 w-3.5" aria-hidden />}
            </button>
          ))}
        </div>
        <SwitchRow
          title={t('appearance.sync')}
          description={t('appearance.syncDescription')}
          checked={settings?.appearanceSync ?? false}
          onChange={(checked) =>
            update.mutate({ appearanceSync: checked, ...(checked ? { theme } : {}) })
          }
        />
      </SettingGroup>
      <SettingGroup title={t('appearance.language')}>
        <Field label={t('appearance.language')} hint={t('appearance.languageDescription')}>
          <select
            value={language}
            onChange={(event) => {
              const next = event.target.value as Language;
              setLanguage(next);
              update.mutate({ language: next });
            }}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="en">{t('appearance.english')}</option>
            <option value="pt-BR">{t('appearance.portuguese')}</option>
          </select>
        </Field>
      </SettingGroup>
    </>
  );
}
