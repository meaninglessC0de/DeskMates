import { LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/VStack';
import { Maximize2 } from 'lucide-react';
import { useStore } from '../api/store';
import { useState } from 'react';
import type { SpaceState } from '../media/SpaceView';
import { Actions, LiveMarker, PlanSection, Screen, StateLine } from './parts';

export interface DesktopPanelProps {
  employeeId: string;
  /** Fill the main area instead of docking (⇧⌘↩). Omit to hide the control. */
  onExpand?: () => void;
  /** Rendered inside a Drawer (narrow windows): no docked panel chrome. */
  isInDrawer?: boolean;
}

function useEmployee(id: string) {
  return useStore((s) => s.employees.find((e) => e.id === id));
}

/** Docked 440 px panel: state line, the live screen, Take control, Lend my screen, the plan. */
export function DesktopPanel({ employeeId, onExpand, isInDrawer }: DesktopPanelProps) {
  const employee = useEmployee(employeeId);
  const [screen, setScreen] = useState<SpaceState>('connecting');
  if (!employee) return null;
  const showsScreen = !(employee.screenGrant || employee.state === 'offline' || employee.desktopSinceMs === null);
  const body = (
    <VStack gap={4}>
      <HStack vAlign="center" gap={1}>
        <StackItem size="fill">
          <StateLine employee={employee} hasDot={!showsScreen} />
        </StackItem>
        {showsScreen ? <LiveMarker state={screen} /> : null}
        {onExpand ? (
          <IconButton label="Expand" tooltip="Expand (⇧⌘↩)" variant="ghost" size="sm" icon={<Icon icon={Maximize2} size="sm" />} onClick={onExpand} />
        ) : null}
        <IconButton
          label="Close desktop"
          tooltip="Close (⇧⌘D)"
          variant="ghost"
          size="sm"
          icon={<Icon icon="close" size="sm" />}
          onClick={() => useStore.getState().toggleDesktop(employeeId, false)}
        />
      </HStack>
      <Screen employee={employee} onState={setScreen} />
      <Actions employee={employee} />
      <PlanSection employee={employee} />
    </VStack>
  );
  if (isInDrawer) return <VStack padding={4}>{body}</VStack>;
  return (
    <LayoutPanel width={440} hasDivider padding={4} label="Desktop" data-am-panel="">
      {body}
    </LayoutPanel>
  );
}

/** Expanded: the screen fills the main area (the side column holds the plan and Take control). */
export function DesktopExpanded({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const employee = useEmployee(employeeId);
  if (!employee) return null;
  return (
    <LayoutContent padding={6}>
      <VStack gap={4} maxWidth={1100}>
        <HStack vAlign="center" gap={3}>
          <Button label="Back to chat" variant="ghost" icon={<Icon icon="chevronLeft" size="sm" color="inherit" />} onClick={onBack} />
          <StateLine employee={employee} />
        </HStack>
        <Screen employee={employee} />
      </VStack>
    </LayoutContent>
  );
}

export function DesktopSide({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return null;
  return (
    <LayoutPanel width={320} hasDivider padding={4} label="Plan">
      <VStack gap={4}>
        <Actions employee={employee} />
        <PlanSection employee={employee} />
      </VStack>
    </LayoutPanel>
  );
}
