import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { paths } from '@/features/shell/paths';
import { AgentInstallList } from './AgentInstallList';

/** Quick access to the agent list from the composer's agent menu. */
export function InstallAgentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agents</DialogTitle>
          <DialogDescription>
            Each agent is installed in Cooder&apos;s own folder, apart from CLIs already on this
            computer. Sign it in afterwards.
          </DialogDescription>
        </DialogHeader>
        {open && <AgentInstallList />}
        <Link
          to={paths.settings('agents')}
          onClick={() => onOpenChange(false)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Sign in and configure agents
        </Link>
      </DialogContent>
    </Dialog>
  );
}
