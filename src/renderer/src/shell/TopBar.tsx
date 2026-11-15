import { useState } from 'react';
import { LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Divider } from '@astryxdesign/core/Divider';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Grid2x2, Monitor, MoreHorizontal, Users, Video } from 'lucide-react';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';
import { Elapsed } from './Elapsed';
import { topBarLine } from './presence';
import { Portrait } from '../ui/Portrait';

export interface TopBarProps {
  employee: Employee;
}

export function TopBar({ employee }: TopBarProps) {
  const desktopOpen = useStore((s) => s.ui.desktopOpen[employee.id] ?? false);
  const peers = useStore((s) => s.employees.length);
  const callsOff = useStore((s) => s.capabilities?.calls === 'off');
  const [removeOpen, setRemoveOpen] = useState(false);
  const s = useStore.getState();
  const { firstName, name, portraitUrl } = employee.persona;
  const line = topBarLine(employee);
  const paused = employee.state === 'paused';

  return (
    <LayoutHeader hasDivider data-am-topbar="">
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <HStack>
            <StackItem size="static">
              <Item
                density="compact"
                onClick={() => s.setUi({ profileOpen: true })}
                startContent={<Portrait person={{ id: employee.id, name, portraitUrl }} size={32} />}
                label={<Text type="large">{name}</Text>}
                description={
                  <Text type="supporting" data-am-num="">
                    {line.prefix}
                    {line.timer ? <Elapsed startMs={employee.stateSinceMs} /> : null}
                  </Text>
                }
              />
            </StackItem>
          </HStack>
        </StackItem>
        <HStack gap={1} vAlign="center">
          <IconButton
            label="Call"
            tooltip={callsOff ? 'Calls are off' : 'Call (⇧⌘V)'}
            variant="ghost"
            isDisabled={callsOff}
            icon={<Icon icon={Video} size="sm" />}
            onClick={() => void s.startCall([employee.id])}
          />
          <IconButton
            data-am="desks-open"
            label="Desks"
            tooltip="Desks (⌘D)"
            variant="ghost"
            icon={<Icon icon={Grid2x2} size="sm" />}
            onClick={() => s.openDesks()}
          />
          <ToggleButton
            label="Desktop"
            tooltip="Desktop (⇧⌘D)"
            isIconOnly
            icon={<Icon icon={Monitor} size="sm" />}
            isPressed={desktopOpen}
            onPressedChange={(on) => s.toggleDesktop(employee.id, on)}
          />
          <DropdownMenu
            hasChevron={false}
            menuWidth={220}
            alignment="end"
            renderTrigger={(props) => <IconButton {...props} label="More" tooltip="More" variant="ghost" icon={<Icon icon={MoreHorizontal} size="sm" />} />}
            items={[
              { label: 'Profile', endContent: <Kbd keys="mod+i" />, onClick: () => s.setUi({ profileOpen: true }) },
              {
                label: paused ? 'Resume' : 'Pause',
                endContent: <Kbd keys="mod+shift+p" />,
                onClick: () => void (paused ? s.resumeEmployee(employee.id) : s.pauseEmployee(employee.id)),
              },
              { label: 'Restart desktop', onClick: () => void s.desktopAction(employee.id, 'restart') },
              { type: 'divider' },
              { label: 'Remove employee', variant: 'destructive', onClick: () => setRemoveOpen(true) },
            ]}
          />
        </HStack>
        <Divider orientation="vertical" />
        <Button
          label="Summon meeting"
          variant="primary"
          isDisabled={callsOff || peers < 2}
          tooltip={callsOff ? 'Calls are off' : peers < 2 ? 'Hire another deskmate to start a meeting' : undefined}
          icon={<Icon icon={Users} size="sm" color="inherit" />}
          onClick={() => s.setUi({ summonOpen: true })}
        />
      </HStack>
      <AlertDialog
        isOpen={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${firstName}?`}
        description="Their desktop and conversation will be deleted."
        actionLabel="Remove"
        onAction={async () => {
          setRemoveOpen(false);
          await s.removeEmployee(employee.id);
        }}
      />
    </LayoutHeader>
  );
}
