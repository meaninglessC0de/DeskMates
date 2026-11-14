import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useStore } from '../api/store';

export interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/** Placeholder. Uses `settings` and `updateSettings` from the store. */
export function SettingsDialog({ isOpen, onOpenChange }: SettingsDialogProps) {
  const settings = useStore((s) => s.settings);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={480}>
      <Layout
        header={<DialogHeader title="Settings" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <EmptyState title="Settings" description={settings ? `Appearance: ${settings.appearance}` : undefined} />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
