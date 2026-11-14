import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useStore } from '../api/store';

export interface ProfileDrawerProps {
  employeeId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/** Placeholder: right-hand drawer, 400 px. */
export function ProfileDrawer({ employeeId, isOpen, onOpenChange }: ProfileDrawerProps) {
  const employee = useStore((s) => s.employees.find((e) => e.id === employeeId));
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} label="Profile" width={400}>
      <Layout
        header={<DrawerHeader title={employee?.persona.name ?? 'Profile'} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <EmptyState title="Profile" description={employee ? `${employee.persona.role}, ${employee.permissions.level.replaceAll('_', ' ')}` : undefined} />
          </LayoutContent>
        }
      />
    </Drawer>
  );
}
