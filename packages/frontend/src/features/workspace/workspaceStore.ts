import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CoreTab = 'progress' | 'changes' | 'files' | 'context' | 'terminal' | 'runs';
export type ToolTab = 'preview' | 'notes' | 'memory' | 'checkpoints' | 'github' | 'android' | 'log';
export type WorkspaceTab = CoreTab | ToolTab;

interface WorkspaceState {
  open: boolean;
  tab: WorkspaceTab;
  /** Wider panel, for previews and long diffs. */
  expanded: boolean;
  setOpen: (open: boolean) => void;
  setTab: (tab: WorkspaceTab) => void;
  setExpanded: (expanded: boolean) => void;
  /** Open the panel on a given tab, from a menu or the command palette. */
  show: (tab: WorkspaceTab) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      open: false,
      tab: 'preview',
      expanded: false,
      setOpen: (open) => set({ open }),
      setTab: (tab) => set({ tab }),
      setExpanded: (expanded) => set({ expanded }),
      show: (tab) => set({ open: true, tab }),
    }),
    { name: 'plum:workspace', version: 3 }
  )
);
