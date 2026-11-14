import { SideNav, SideNavHeading, SideNavSection } from '@astryxdesign/core/SideNav';
import { List, ListItem } from '@astryxdesign/core/List';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { VStack } from '@astryxdesign/core/VStack';
import { BarChart3, Plus, Settings } from 'lucide-react';
import { useStore } from '../api/store';
import { PresenceDot } from './PresenceDot';
import { rowLine } from './presence';

export const APP_NAME = 'Agent Manager';

export function Sidebar() {
  const employees = useStore((s) => s.employees);
  const selectedId = useStore((s) => s.ui.selectedId);
  const view = useStore((s) => s.ui.view);
  const userName = useStore((s) => s.settings?.userName ?? 'You');
  const { selectEmployee, setUi, setView } = useStore.getState();

  return (
    <SideNav
      aria-label="Team"
      resizable={{ defaultWidth: 280, minWidth: 240, maxWidth: 320, autoSaveId: 'sidebar' }}
      header={
        <SideNavHeading
          heading={APP_NAME}
          headerEndContent={
            <IconButton
              label="Hire"
              tooltip="Hire (⌘N)"
              variant="ghost"
              size="sm"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={() => setUi({ hireOpen: true })}
            />
          }
        />
      }
      footer={<Item density="compact" label={userName} startContent={<Avatar name={userName} size="sm" />} />}
      footerIcons={
        <>
          <IconButton label="Team" tooltip="Team (⌘T)" variant="ghost" icon={<Icon icon={BarChart3} size="sm" />} onClick={() => setView('team')} />
          <IconButton label="Settings" tooltip="Settings (⌘,)" variant="ghost" icon={<Icon icon={Settings} size="sm" />} onClick={() => setUi({ settingsOpen: true })} />
        </>
      }>
      <SideNavSection title="Team" isHeaderHidden>
        {employees.length === 0 ? (
          <VStack padding={3}>
            <Text type="supporting">No one yet</Text>
          </VStack>
        ) : (
          <List density="spacious">
            {employees.map((e) => {
              const line = rowLine(e);
              return (
                <ListItem
                  key={e.id}
                  label={e.persona.name}
                  description={
                    line.emphasised ? (
                      <Text type="supporting" color="primary" maxLines={1}>
                        {line.text}
                      </Text>
                    ) : (
                      line.text
                    )
                  }
                  isSelected={view === 'thread' && e.id === selectedId}
                  onClick={() => void selectEmployee(e.id)}
                  startContent={<Avatar name={e.persona.name} src={e.persona.portraitUrl || undefined} size={40} status={<PresenceDot state={e.state} />} />}
                  endContent={
                    <VStack gap={1} hAlign="end">
                      <Timestamp value={e.lastActivityMs} format="relative_short" />
                      {e.unread > 0 ? <Badge label={String(e.unread)} variant="neutral" /> : null}
                    </VStack>
                  }
                />
              );
            })}
          </List>
        )}
      </SideNavSection>
    </SideNav>
  );
}
