import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useStore } from '../api/store';

export interface HireDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/** Placeholder. Uses `presets`, `fetchCandidate` and `hire` from the store. */
export function HireDialog({ isOpen, onOpenChange }: HireDialogProps) {
  const presets = useStore((s) => s.presets);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title="Hire" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <EmptyState title="Hire dialog" description={`${presets.length} roles to choose from`} />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
