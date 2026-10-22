import { Download, MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import type { Session } from '@plum-code-webui/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSessionActions, useSessionDialogs } from './sessionActions';

/** The ⋯ menu in the session header. */
export function SessionMenu({ session }: { session: Session }) {
  const actions = useSessionActions();
  const { askRename, askRemove } = useSessionDialogs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Session actions"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => askRename(session)} className="gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void actions.toggleStar(session.id)} className="gap-2">
          <Star className="h-4 w-4 text-muted-foreground" aria-hidden />
          {session.starred ? 'Remove star' : 'Star'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.restart(session.id)} className="gap-2">
          <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden />
          Restart
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void actions.exportMarkdown(session.id, session.name)}
          className="gap-2"
        >
          <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
          Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => askRemove(session)}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
