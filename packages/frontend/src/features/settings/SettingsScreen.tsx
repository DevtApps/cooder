import { Suspense, lazy, type ComponentType } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Page } from '@/features/shell/Page';
import { paths } from '@/features/shell/paths';
import { cn } from '@/lib/utils';
import { useI18n, type TranslationKey } from '@/lib/i18n';

interface SectionDef {
  id: string;
  labelKey: TranslationKey;
  groupKey: TranslationKey;
  descriptionKey: TranslationKey;
  adminOnly?: boolean;
  /** Wider column for card grids. */
  wide?: boolean;
  /** Not rebuilt yet: opens the same area in the old interface. */
  legacyHref?: string;
  Component?: ComponentType;
}

const lazySection = (load: () => Promise<Record<string, ComponentType>>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name]! })));

const SECTIONS: SectionDef[] = [
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    groupKey: 'settings.general',
    descriptionKey: 'settings.appearanceDescription',
    Component: lazySection(() => import('./sections/AppearanceSection'), 'AppearanceSection'),
  },
  {
    id: 'workspace',
    labelKey: 'settings.workspace',
    groupKey: 'settings.general',
    descriptionKey: 'settings.workspaceDescription',
    Component: lazySection(() => import('./sections/WorkspaceSection'), 'WorkspaceSection'),
  },
  {
    id: 'agents',
    labelKey: 'settings.agents',
    groupKey: 'settings.agents',
    descriptionKey: 'settings.agentsDescription',
    Component: lazySection(() => import('./sections/AgentsSection'), 'AgentsSection'),
  },
  {
    id: 'browser',
    labelKey: 'settings.browser',
    groupKey: 'settings.agents',
    descriptionKey: 'settings.browserDescription',
    Component: lazySection(() => import('./sections/BrowserSection'), 'BrowserSection'),
  },
  {
    id: 'extensions',
    labelKey: 'settings.extensions',
    groupKey: 'settings.agents',
    wide: true,
    descriptionKey: 'settings.extensionsDescription',
    Component: lazySection(
      () => import('@/features/extensions/ExtensionsSection'),
      'ExtensionsSection'
    ),
  },
  {
    id: 'integrations',
    labelKey: 'settings.integrations',
    groupKey: 'settings.services',
    descriptionKey: 'settings.integrationsDescription',
    Component: lazySection(() => import('./sections/IntegrationsSection'), 'IntegrationsSection'),
  },
  {
    id: 'usage',
    labelKey: 'settings.usage',
    groupKey: 'settings.services',
    descriptionKey: 'settings.usageDescription',
    Component: lazySection(() => import('./sections/UsageAlertsSection'), 'UsageAlertsSection'),
  },
  {
    id: 'security',
    labelKey: 'settings.security',
    groupKey: 'settings.access',
    descriptionKey: 'settings.securityDescription',
    Component: lazySection(() => import('./sections/SecuritySection'), 'SecuritySection'),
  },
  {
    id: 'system',
    labelKey: 'settings.system',
    groupKey: 'settings.access',
    descriptionKey: 'settings.systemDescription',
    Component: lazySection(() => import('./sections/SystemSection'), 'SystemSection'),
  },
  {
    id: 'admin',
    labelKey: 'settings.administration',
    groupKey: 'settings.access',
    descriptionKey: 'settings.administrationDescription',
    adminOnly: true,
    wide: true,
    Component: lazySection(() => import('@/features/admin/AdminSection'), 'AdminSection'),
  },
];

export function SettingsScreen() {
  const { section = SECTIONS[0]!.id } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { t } = useI18n();
  const visible = SECTIONS.filter((item) => !item.adminOnly || isAdmin);
  const current = visible.find((item) => item.id === section);

  if (!current) return <Navigate to={paths.settings(visible[0]!.id)} replace />;

  const groups = [...new Set(visible.map((item) => item.groupKey))];
  const Section = current.Component;

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label={t('common.settings')}
        className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-3 md:block"
      >
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t(group)}</h2>
            <ul>
              {visible
                .filter((item) => item.groupKey === group)
                .map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.legacyHref ?? paths.settings(item.id)}
                      aria-current={item.id === current.id ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent',
                        item.id === current.id && 'bg-accent font-medium'
                      )}
                    >
                      {t(item.labelKey)}
                      {item.legacyHref && (
                        <ExternalLink
                          className="h-3 w-3 text-muted-foreground"
                          aria-label={t('settings.title')}
                        />
                      )}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>

      <Page title={t(current.labelKey)} description={t(current.descriptionKey)} wide={current.wide}>
        <label className="block md:hidden">
          <span className="sr-only">{t('settings.section')}</span>
          <select
            value={current.id}
            onChange={(event) => {
              const next = visible.find((item) => item.id === event.target.value);
              if (next?.legacyHref) window.location.assign(next.legacyHref);
              else navigate(paths.settings(event.target.value));
            }}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {visible.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>
        {Section && (
          <Suspense
            fallback={
              <div className="flex justify-center py-10">
                <Loader2
                  className="h-5 w-5 animate-spin text-muted-foreground"
                  aria-label="Loading"
                />
              </div>
            }
          >
            <Section />
          </Suspense>
        )}
      </Page>
    </div>
  );
}
