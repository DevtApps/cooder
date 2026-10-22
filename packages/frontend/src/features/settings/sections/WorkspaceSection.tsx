import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FolderPicker } from '@/features/home/FolderPicker';
import { SettingGroup, Field } from '../primitives';
import { useUserSettings } from '../useUserSettings';

export function WorkspaceSection() {
  const { settings, update } = useUserSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const current = settings?.defaultWorkingDir ?? '';

  return (
    <SettingGroup title="Default folder">
      <Field
        label="Start sessions in"
        htmlFor="default-dir"
        hint="Where new sessions begin when no project is chosen. Leave empty to create a folder per session."
      >
        <div className="flex gap-2">
          <input
            id="default-dir"
            key={current}
            defaultValue={current}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== current) update.mutate({ defaultWorkingDir: value || null });
            }}
            placeholder="/home/you/projects"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden />
            Browse
          </Button>
        </div>
      </Field>
      <FolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(path) => update.mutate({ defaultWorkingDir: path })}
      />
    </SettingGroup>
  );
}
