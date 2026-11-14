import { LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Text } from '@astryxdesign/core/Text';
import { Monitor, Users } from 'lucide-react';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';

export interface TopBarProps {
  employee: Employee;
}

export function TopBar({ employee }: TopBarProps) {
  const desktopOpen = useStore((s) => s.ui.desktopOpen[employee.id] ?? false);
  const { toggleDesktop, setUi } = useStore.getState();
  return (
    <LayoutHeader hasDivider>
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <HStack gap={3} vAlign="center">
            <Avatar name={employee.persona.name} src={employee.persona.portraitUrl} size={32} onClick={() => setUi({ profileOpen: true })} />
            <VStack gap={0.5}>
              <Text type="large">{employee.persona.name}</Text>
              <Text type="supporting">{`${employee.persona.role} · ${employee.stateDetail}`}</Text>
            </VStack>
          </HStack>
        </StackItem>
        <ToggleButton
          label="Desktop"
          isIconOnly
          icon={<Icon icon={Monitor} size="sm" />}
          isPressed={desktopOpen}
          onPressedChange={(on) => toggleDesktop(employee.id, on)}
        />
        <Button label="Summon meeting" variant="primary" icon={<Icon icon={Users} size="sm" color="inherit" />} onClick={() => setUi({ summonOpen: true })} />
      </HStack>
    </LayoutHeader>
  );
}
