import { LayoutPanel } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { useStore } from '../api/store';
import { SpaceView } from '../media/SpaceView';

export interface DesktopPanelProps {
  employeeId: string;
}

/** Placeholder: docked 440 px panel showing the live desktop in view mode. */
export function DesktopPanel({ employeeId }: DesktopPanelProps) {
  const employee = useStore((s) => s.employees.find((e) => e.id === employeeId));
  return (
    <LayoutPanel width={440} hasDivider padding={3} label="Desktop">
      <VStack gap={3}>
        <Text type="label">{`${employee?.persona.firstName ?? ''}'s desktop`}</Text>
        <SpaceView employeeId={employeeId} mode="view" />
      </VStack>
    </LayoutPanel>
  );
}
