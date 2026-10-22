import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronRight,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import type { ApiResponse, Session } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { getSessionRunState } from '@/lib/sessionRunState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { paths } from './paths';
import type { Project } from './useSessions';
import { useI18n } from '@/lib/i18n';

const SESSIONS_PER_PROJECT = 8;

const rowClass =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent hover:text-foreground';

/** Small marker for a session that is working or waiting for you. */
function RunDot({ session }: { session: Session }) {
  const lifecycle = useSessionStore((s) => s.lifecycle[session.id]);
  const approvals = useSessionStore((s) => s.pendingApprovalCounts[session.id] ?? 0);
  const state = getSessionRunState(session, { lifecycle, pendingApprovals: approvals });
  if (state.tone === 'needs-you') {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-warning" title={state.label} />;
  }
  if (state.tone === 'working') {
    return (
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
        title={state.label}
      />
    );
  }
  if (state.tone === 'error') {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" title={state.label} />;
  }
  return null;
}

function ProjectGroup({
  project,
  expanded,
  onToggle,
  onNavigate,
}: {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const sessions = showAll ? project.sessions : project.sessions.slice(0, SESSIONS_PER_PROJECT);

  const rename = async (session: Session) => {
    const name = draftName.trim();
    if (!name || name.length > 100 || name === session.name) {
      if (name === session.name) setEditingId(null);
      return;
    }
    setBusyId(session.id);
    setActionError(null);
    try {
      await api.put<ApiResponse<Session>>(`/api/sessions/${encodeURIComponent(session.id)}`, {
        name,
      });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setEditingId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not rename session');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (session: Session) => {
    if (!window.confirm(`Delete “${session.name}”? This cannot be undone.`)) return;
    setBusyId(session.id);
    setActionError(null);
    try {
      await api.delete(`/api/sessions/${encodeURIComponent(session.id)}`);
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (location.pathname === paths.session(session.id)) navigate(paths.home());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete session');
    } finally {
      setBusyId(null);
    }
  };
  return (
    <li>
      <div className="group/project flex w-full min-w-0 items-center rounded-md pr-1 hover:bg-accent">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          title={project.path}
          className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-90')}
            aria-hidden
          />
          <span className="truncate">{project.name}</span>
        </button>
        <button
          type="button"
          aria-label={`${t('navigation.newSession')} · ${project.name}`}
          title={`${t('navigation.newSession')} · ${project.name}`}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/project:opacity-100 focus:opacity-100"
          onClick={() => {
            navigate(paths.newSession(project.path));
            onNavigate?.();
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {expanded && (
        <ul className="mb-1">
          {actionError && (
            <li role="alert" className="px-6 py-1 text-xs text-destructive">
              {actionError}
            </li>
          )}
          {sessions.map((session) => (
            <li key={session.id} className="group flex items-center rounded-md hover:bg-accent">
              {editingId === session.id ? (
                <form
                  className="min-w-0 flex-1 pl-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(session);
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Session name"
                    className="w-full rounded bg-background px-2 py-1 text-[13px] outline-none ring-1 ring-brand"
                    value={draftName}
                    maxLength={100}
                    disabled={busyId === session.id}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => void rename(session)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                  />
                </form>
              ) : (
                <NavLink
                  to={paths.session(session.id)}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      rowClass,
                      'min-w-0 flex-1 pl-6',
                      isActive && 'bg-accent font-medium text-foreground'
                    )
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{session.name}</span>
                  {session.starred && (
                    <Star
                      className="h-3 w-3 shrink-0 fill-current text-muted-foreground"
                      aria-label="Starred"
                    />
                  )}
                  {(session.unreadCount ?? 0) > 0 && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" title="Unread" />
                  )}
                  <RunDot session={session} />
                </NavLink>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Manage ${session.name}`}
                  disabled={busyId === session.id}
                  className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 focus:opacity-100 data-[popup-open]:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraftName(session.name);
                      setEditingId(session.id);
                    }}
                    className="gap-2"
                  >
                    <Pencil className="h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void remove(session)}
                    className="gap-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          {project.sessions.length > SESSIONS_PER_PROJECT && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="px-2 py-1 pl-6 text-xs text-muted-foreground hover:text-foreground"
              >
                {showAll ? 'Show fewer' : `Show all ${project.sessions.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

interface SidebarProps {
  projects: Project[];
  activeProjectPath: string | null;
  onSelectProject: (path: string) => void;
  onNavigate?: () => void;
}

/** Only navigation: start a session, or go to one, grouped by project. */
export function Sidebar({
  projects,
  activeProjectPath,
  onSelectProject,
  onNavigate,
}: SidebarProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // The open session's project is always expanded; others are the user's choice.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    onSelectProject(path);
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav aria-label={t('navigation.sessions')} className="flex h-full flex-col bg-sidebar">
      <div className="px-4 pb-2 pt-4">
        <Link
          to={paths.home()}
          onClick={onNavigate}
          className="text-[15px] font-medium tracking-tight"
        >
          Cooder
        </Link>
      </div>

      <div className="px-2">
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            navigate(paths.newSession(activeProjectPath ?? undefined));
            onNavigate?.();
          }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
            <Plus className="h-3.5 w-3.5" />
          </span>
          {t('navigation.newSession')}
        </button>
      </div>

      <ul className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {projects.map((project) => (
          <ProjectGroup
            key={project.path}
            project={project}
            expanded={project.path === activeProjectPath || !collapsed.has(project.path)}
            onToggle={() => toggle(project.path)}
            onNavigate={onNavigate}
          />
        ))}
        {projects.length === 0 && (
          <li className="px-2 py-3 text-xs text-muted-foreground">{t('navigation.noSessions')}</li>
        )}
      </ul>

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className={cn(rowClass, 'gap-2.5 data-[popup-open]:bg-accent')}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium">
              {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{user?.name || user?.email}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onSelect={() => navigate(paths.analytics())} className="gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t('common.analytics')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(paths.settings())} className="gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t('common.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="gap-2">
              <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t('common.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
