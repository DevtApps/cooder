import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Bookmark,
  Brain,
  Github,
  Globe,
  ListChecks,
  NotebookPen,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import type { ToolTab } from './workspaceStore';

export interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  /** Put text in the chat as the user's next message. */
  sendToChat: (text: string) => void;
  /** Send a message with attachments (marked-up pages…). */
  sendFiles: (text: string, files: File[]) => void;
  /** Called after a checkpoint changes the conversation or the files. */
  onRestored: () => void;
}

interface ToolDef {
  value: ToolTab;
  label: string;
  description: string;
  icon: LucideIcon;
  Panel: LazyExoticComponent<ComponentType<ToolContext>>;
}

// Each tool loads when first opened; the heavier ones (preview, Android) are
// not part of the session screen's bundle.
export const TOOLS: ToolDef[] = [
  {
    value: 'preview',
    label: 'Browser',
    description: 'A real Chrome the agent and you share',
    icon: Globe,
    Panel: lazy(() =>
      import('@/features/browser/BrowserPane').then((m) => ({
        default: ({ sessionId, sendFiles }: ToolContext) => (
          <m.BrowserPane key={sessionId} sessionId={sessionId} sendFiles={sendFiles} />
        ),
      }))
    ),
  },
  {
    value: 'notes',
    label: 'Notes',
    description: 'Scratchpad for this session',
    icon: NotebookPen,
    Panel: lazy(() =>
      import('@/features/tools/Notepad').then((m) => ({
        default: ({ sessionId, sendToChat }: ToolContext) => (
          <m.Notepad sessionId={sessionId} onSendToChat={sendToChat} className="h-full" />
        ),
      }))
    ),
  },
  {
    value: 'memory',
    label: 'Memory',
    description: 'Facts every session of the project shares',
    icon: Brain,
    Panel: lazy(() =>
      import('@/features/tools/ProjectMemory').then((m) => ({
        default: ({ workingDirectory }: ToolContext) => (
          <m.ProjectMemory workingDirectory={workingDirectory} />
        ),
      }))
    ),
  },
  {
    value: 'checkpoints',
    label: 'Checkpoints',
    description: 'Save and restore points',
    icon: Bookmark,
    Panel: lazy(() =>
      import('@/features/tools/CheckpointsPanel').then((m) => ({
        default: ({ sessionId, onRestored }: ToolContext) => (
          <m.CheckpointsPanel sessionId={sessionId} onRestore={onRestored} className="h-full" />
        ),
      }))
    ),
  },
  {
    value: 'github',
    label: 'GitHub',
    description: 'Pull requests, runs, issues and releases',
    icon: Github,
    Panel: lazy(() =>
      import('@/features/tools/github/GitHubPanel').then((m) => ({
        default: ({ workingDirectory }: ToolContext) => (
          <m.GitHubPanel workingDirectory={workingDirectory} className="h-full" />
        ),
      }))
    ),
  },
  {
    value: 'android',
    label: 'Android',
    description: 'Pair and use a phone or emulator',
    icon: Smartphone,
    Panel: lazy(() =>
      import('@/features/tools/AndroidDevicePanel').then((m) => ({
        default: ({ sessionId }: ToolContext) => (
          <m.AndroidDevicePanel sessionId={sessionId} className="h-full" />
        ),
      }))
    ),
  },
  {
    value: 'log',
    label: 'Tool log',
    description: 'Every tool the agent ran',
    icon: ListChecks,
    Panel: lazy(() =>
      import('@/features/tools/ToolLogPanelContainer').then((m) => ({
        default: m.ToolLogContainer,
      }))
    ),
  },
];

export const TOOLS_BY_TAB = new Map(TOOLS.map((tool) => [tool.value, tool]));
