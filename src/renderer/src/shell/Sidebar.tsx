import { useRef } from 'react';
import { SideNav, SideNavHeading, SideNavSection } from '@astryxdesign/core/SideNav';
import { List, ListItem } from '@astryxdesign/core/List';
import { Badge } from '@astryxdesign/core/Badge';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { VStack } from '@astryxdesign/core/VStack';
import { BarChart3, Plus, Settings } from 'lucide-react';
import { useStore } from '../api/store';
import { Portrait } from '../ui/Portrait';
import { Logo } from '../ui/Logo';
import { HStack } from '@astryxdesign/core/HStack';
import { rowLine } from './presence';

export const APP_NAME = 'Deskmates';

/** Ids present when the sidebar first rendered with the team loaded: those rows are already there; any later id is an arrival. */
function useArrivals(ids: string[]): Set<string> {
  const known = useRef<Set<string> | null>(null);
  if (known.current === null && (ids.length > 0 || useStore.getState().bootState === 'ready')) known.current = new Set(ids);
  const fresh = new Set(ids.filter((id) => known.current !== null && !known.current.has(id)));
  return fresh;
}

export function Sidebar() {
  const employees = useStore((s) => s.employees);
  const arrivals = useArrivals(employees.map((e) => e.id));
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
          icon={<Logo size={24} />}
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
      footer={
        <Item
          data-am-footer=""
          density="compact"
          label={userName}
          startContent={<Portrait person={{ id: `user:${userName}`, name: userName }} size={24} />}
          endContent={
            <HStack gap={0.5}>
              <IconButton label="Team" tooltip="Team (⌘T)" variant="ghost" size="sm" icon={<Icon icon={BarChart3} size="sm" />} onClick={() => setView('team')} />
              <IconButton label="Settings" tooltip="Settings (⌘,)" variant="ghost" size="sm" icon={<Icon icon={Settings} size="sm" />} onClick={() => setUi({ settingsOpen: true })} />
            </HStack>
          }
        />
      }>
      <SideNavSection title="Team" isHeaderHidden>
        {employees.length === 0 ? (
          <VStack padding={3}>
            <Text type="supporting">No one yet</Text>
          </VStack>
        ) : (
          <List density="balanced" data-am-people="">
            {employees.map((e) => {
              const line = rowLine(e);
              return (
                <ListItem
                  key={e.id}
                  data-am-row={e.state}
                  data-am-arrive={arrivals.has(e.id) ? '' : undefined}
                  label={<Text type="label" maxLines={1}>{e.persona.name}</Text>}
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
                  startContent={<Portrait person={{ id: e.id, name: e.persona.name, portraitUrl: e.persona.portraitUrl }} size={40} presence={e.state} />}
                  endContent={
                    <VStack gap={1} hAlign="end" data-am-num="">
                      <Timestamp key={e.lastActivityMs} value={e.lastActivityMs} format="relative_short" hasTooltip={false} isLive />
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
