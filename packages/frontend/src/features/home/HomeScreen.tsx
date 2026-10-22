import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Folder, FolderOpen, GitBranch, Plus } from 'lucide-react';
import type { ApiResponse, CLIProvider, Session } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AgentPicker } from '@/features/chat/AgentPicker';
import { Composer } from '@/features/chat/Composer';
import { useShell } from '@/features/shell/AppShell';
import { paths } from '@/features/shell/paths';
import { projectName } from '@/features/shell/useSessions';
import { CloneRepoDialog } from '@/features/tools/github/CloneRepoDialog';
import { FolderPicker } from './FolderPicker';
import { useI18n } from '@/lib/i18n';

const NEW_PROJECT = '__new__';

/** A session name from the first line of the request, like the Claude apps do. */
function nameFromPrompt(text: string): string {
  const firstLine =
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? 'New session';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

/** Project chip: a styled menu of known projects plus the ways to add one. */
function ProjectMenu({
  projects,
  extra,
  selected,
  onSelect,
  onOpenFolder,
  onClone,
  onNew,
}: {
  projects: { path: string; name: string }[];
  extra: string | null;
  selected: string;
  onSelect: (path: string) => void;
  onOpenFolder: () => void;
  onClone: () => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const list = [...projects];
  if (extra && !list.some((p) => p.path === extra)) {
    list.push({ path: extra, name: projectName(extra) });
  }
  const current = list.find((p) => p.path === selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Project"
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
      >
        <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="max-w-[12rem] truncate">{current?.name ?? 'New project'}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-64">
        {list.length > 0 && (
          <>
            <DropdownMenuLabel className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {t('home.projects')}
            </DropdownMenuLabel>
            {list.map((project) => (
              <DropdownMenuItem
                key={project.path}
                onSelect={() => onSelect(project.path)}
                title={project.path}
                className="gap-2"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.path === selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onOpenFolder} className="gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('home.openFolder')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onClone} className="gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('home.cloneFromGitHub')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNew} className="gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('home.newProject')}
          {selected === NEW_PROJECT && <Check className="ml-auto h-4 w-4" aria-hidden />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HomeScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projects, activeProjectPath } = useShell();
  // Until the user picks one, follow the sidebar's project; the list may still
  // be loading on first render.
  const [pickedProject, setProjectPath] = useState<string | null>(null);
  const projectPath = pickedProject ?? activeProjectPath ?? projects[0]?.path ?? NEW_PROJECT;
  const [provider, setProvider] = useState<CLIProvider>('codex');
  const [model, setModel] = useState<string | null>(null);
  // A folder opened with the picker that has no session yet.
  const [openedFolder, setOpenedFolder] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const known = projects.some((p) => p.path === projectPath) || projectPath === openedFolder;
  const selectedProject = known ? projectPath : NEW_PROJECT;

  const create = useMutation({
    mutationFn: async ({ text, files }: { text: string; files: File[] }) => {
      const fields: Record<string, string> = { name: nameFromPrompt(text), cliProvider: provider };
      if (model) fields.cliModel = model;
      if (selectedProject !== NEW_PROJECT) fields.workingDirectory = selectedProject;
      if (text) fields.initialMessage = text;

      let response;
      if (files.length > 0) {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        files.forEach((file) => form.append('files', file));
        response = await api.post<ApiResponse<Session>>('/api/sessions', form);
      } else {
        response = await api.post<ApiResponse<Session>>('/api/sessions', fields);
      }
      if (!response.data.success || !response.data.data) {
        throw new Error(t('session.couldNotLoad'));
      }
      return response.data.data;
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate(paths.session(session.id));
    },
    onError: (error) => {
      toast({
        title: t('home.couldNotStart'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-center font-serif text-3xl tracking-tight text-foreground/90">
          {t('home.prompt')}
        </h1>
        <Composer
          autoFocus
          draftKey="cooder-next:draft:new"
          placeholder={t('home.placeholder')}
          disabled={create.isPending}
          onSend={(text, files) => create.mutateAsync({ text, files })}
          controls={
            <>
              <ProjectMenu
                projects={projects}
                extra={openedFolder}
                selected={selectedProject}
                onSelect={setProjectPath}
                onOpenFolder={() => setPickerOpen(true)}
                onClone={() => setCloneOpen(true)}
                onNew={() => setProjectPath(NEW_PROJECT)}
              />
              <AgentPicker
                provider={provider}
                model={model}
                onChange={(nextProvider, nextModel) => {
                  setProvider(nextProvider);
                  setModel(nextModel);
                }}
              />
            </>
          }
        />
        <CloneRepoDialog
          open={cloneOpen}
          onOpenChange={setCloneOpen}
          onCloned={(path) => {
            setOpenedFolder(path);
            setProjectPath(path);
          }}
        />
        <FolderPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(path) => {
            setOpenedFolder(path);
            setProjectPath(path);
          }}
        />
        {selectedProject !== NEW_PROJECT ? (
          <p
            className="mt-2 truncate text-center text-xs text-muted-foreground"
            title={selectedProject}
          >
            {selectedProject}
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            A new project folder is created from the session name.
          </p>
        )}
      </div>
    </div>
  );
}
