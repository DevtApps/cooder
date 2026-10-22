import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSessionActions, useSessionDialogs } from './sessionActions';
import { useI18n } from '@/lib/i18n';

/** Rename and delete confirmations, mounted once for the whole app. */
export function SessionDialogs() {
  const { t } = useI18n();
  const { rename, remove, close } = useSessionDialogs();
  const actions = useSessionActions();
  const [name, setName] = useState('');

  useEffect(() => setName(rename?.name ?? ''), [rename]);

  return (
    <>
      <Dialog open={!!rename} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (rename && name.trim()) {
                void actions.rename(rename.id, name.trim());
                close();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('dialog.renameSession')}</DialogTitle>
            </DialogHeader>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={t('dialog.sessionName')}
              maxLength={100}
              autoFocus
              className="my-4"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                {t('dialog.cancel')}
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                {t('dialog.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!remove} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dialog.deleteSession')}</DialogTitle>
            <DialogDescription>
              &ldquo;{remove?.name}&rdquo; {t('dialog.deleteSessionDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              {t('dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (remove) void actions.remove(remove.id);
                close();
              }}
            >
              {t('dialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
