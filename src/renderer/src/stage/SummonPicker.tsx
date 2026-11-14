import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { useStore } from '../api/store';

export interface SummonPickerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/** Placeholder. Starting a call is `startCall(employeeIds)` in the store; it closes the picker. */
export function SummonPicker({ isOpen, onOpenChange }: SummonPickerProps) {
  const employees = useStore((s) => s.employees);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="Summon meeting" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <EmptyState
              title="Who should join?"
              description={`${employees.length} people on your team`}
              actions={
                <Button
                  label="Start"
                  variant="primary"
                  isDisabled={employees.length === 0}
                  onClick={() => void useStore.getState().startCall(employees.slice(0, 1).map((e) => e.id))}
                />
              }
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
