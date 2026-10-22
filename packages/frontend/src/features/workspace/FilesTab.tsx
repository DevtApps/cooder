import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, File as FileIcon, Folder, Loader2 } from 'lucide-react';
import type { ApiResponse, DirectoryContents, FileInfo } from '@plum-code-webui/shared';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { FileViewer } from './FileViewer';

const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store']);

function useDirectory(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['files-list', path],
    queryFn: async () =>
      (await api.get<ApiResponse<DirectoryContents>>(`/api/files?path=${encodeURIComponent(path)}`))
        .data.data,
    enabled,
    retry: false,
  });
}

function Entries({
  path,
  depth,
  onOpen,
}: {
  path: string;
  depth: number;
  onOpen: (file: string) => void;
}) {
  const listing = useDirectory(path, true);
  if (listing.isLoading) {
    return <Loader2 className="my-1 ml-4 h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
  if (listing.isError) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Cannot open this folder.</p>;
  }
  const entries = (listing.data?.files ?? [])
    .filter((entry) => !HIDDEN.has(entry.name))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1
    );
  return (
    <ul>
      {entries.map((entry) => (
        <Node key={entry.path} entry={entry} depth={depth} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function Node({
  entry,
  depth,
  onOpen,
}: {
  entry: FileInfo;
  depth: number;
  onOpen: (file: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDirectory = entry.type === 'directory';
  return (
    <li>
      <button
        type="button"
        onClick={() => (isDirectory ? setExpanded((value) => !value) : onOpen(entry.path))}
        aria-expanded={isDirectory ? expanded : undefined}
        style={{ paddingLeft: 8 + depth * 14 }}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] hover:bg-accent"
      >
        {isDirectory ? (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground transition',
              expanded && 'rotate-90'
            )}
            aria-hidden
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDirectory ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDirectory && expanded && <Entries path={entry.path} depth={depth + 1} onOpen={onOpen} />}
    </li>
  );
}

/** Project folder tree, read from disk each time a folder is opened. */
export function FilesTab({ cwd }: { cwd: string }) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  return (
    <div className="p-2">
      <Entries path={cwd} depth={0} onOpen={setOpenFile} />
      <FileViewer path={openFile} onClose={() => setOpenFile(null)} />
    </div>
  );
}
