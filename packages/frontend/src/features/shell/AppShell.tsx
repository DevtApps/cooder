import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useMatch, useOutletContext, useSearchParams } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsDesktopLayout } from '@/hooks/useMediaQuery';
import { CommandPalette } from '@/features/palette/CommandPalette';
import { SessionDialogs } from '@/features/session/SessionDialogs';
import { Sidebar } from './Sidebar';
import { useSessions, type Project } from './useSessions';
import { LanguageSync, useI18n } from '@/lib/i18n';
import { useUserSettings } from '@/features/settings/useUserSettings';

const PROJECT_STORAGE_KEY = 'cooder-next:project';

function readStoredProject(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface ShellContext {
  projects: Project[];
  activeProjectPath: string | null;
  isLoadingSessions: boolean;
  openNavigation: () => void;
}

export function useShell() {
  return useOutletContext<ShellContext>();
}

/**
 * Frame of the new frontend: project sidebar on the left, the screen on the
 * right. On phones the sidebar becomes a sheet behind the menu button.
 */
export function AppShell() {
  const isDesktop = useIsDesktopLayout();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sessionMatch = useMatch('/session/:id');
  const { projects, sessions, isLoading } = useSessions();
  const { settings } = useUserSettings();
  const { t } = useI18n();
  const [selectedProject, setSelectedProject] = useState<string | null>(readStoredProject);
  const [navOpen, setNavOpen] = useState(false);

  // The project of the open session wins, then ?project=, then the last pick.
  const currentSession = sessionMatch
    ? sessions.find((session) => session.id === sessionMatch.params.id)
    : undefined;
  const activeProjectPath =
    currentSession?.workingDirectory ?? searchParams.get('project') ?? selectedProject;

  const selectProject = useCallback((path: string) => {
    setSelectedProject(path);
    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, path);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, []);

  useEffect(() => setNavOpen(false), [location.pathname]);

  const sidebar = (
    <Sidebar
      projects={projects}
      activeProjectPath={activeProjectPath}
      onSelectProject={selectProject}
      onNavigate={() => setNavOpen(false)}
    />
  );

  const context: ShellContext = {
    projects,
    activeProjectPath,
    isLoadingSessions: isLoading,
    openNavigation: () => setNavOpen(true),
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans text-foreground antialiased">
      <LanguageSync language={settings?.language} />
      {isDesktop ? (
        <aside className="w-64 shrink-0 border-r border-border">{sidebar}</aside>
      ) : (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 border-border bg-sidebar p-0">
            {sidebar}
          </SheetContent>
        </Sheet>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        {!isDesktop && (
          <div className="flex h-12 shrink-0 items-center px-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t('navigation.openNavigation')}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        )}
        <Outlet context={context} />
      </main>
      <CommandPalette />
      <SessionDialogs />
    </div>
  );
}
