import { useEffect, useRef } from 'react';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { Employee } from '../../../shared';
import { Portrait } from '../ui/Portrait';
import type { DeskMessage } from './feed';
import type { DesksScale } from './layout';

const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Every message between desks, oldest at the top and the newest kept in view at the bottom. Rows (Astryx List and
 * ListItem), not cards: the sender's portrait, "Priya to Jonas", the text in up to four lines, and the time.
 */
export function MessagesRail({ messages, employees, width, height, scale }: { messages: DeskMessage[]; employees: Employee[]; width: number; height: number; scale: DesksScale }) {
  const end = useRef<HTMLElement | null>(null);
  const last = messages[messages.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [last, scale]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  return (
    <VStack data-am="desks-rail" data-am-desks-rail="" data-am-scale={String(scale)} width={width} height={height}>
      <VStack data-am="desks-rail-body">
        {messages.length === 0 ? (
          <VStack data-am="desks-rail-empty" height="100%" vAlign="center">
            <EmptyState isCompact title="No messages between desks yet" />
          </VStack>
        ) : (
          <ScrollableArea label="Messages between desks" height="100%" paddingBlock={3} paddingInline={2}>
            <List density="balanced">
              {messages.map((m) => {
                const from = byId.get(m.from);
                const to = byId.get(m.to);
                return (
                  <ListItem
                    key={m.id}
                    itemKey={m.id}
                    align="start"
                    startContent={from ? <Portrait person={{ id: from.id, name: from.persona.name, portraitUrl: from.persona.portraitUrl }} size={32} /> : undefined}
                    label={
                      <HStack data-am="rail-head" gap={2} vAlign="center">
                        <Text type="label" maxLines={1} data-am="rail-title">{`${from?.persona.firstName ?? 'Someone'} to ${to?.persona.firstName ?? 'a teammate'}`}</Text>
                        <Text type="supporting" data-am="rail-time">{clock(m.ms)}</Text>
                      </HStack>
                    }
                    description={<Text type="supporting" maxLines={4} data-am="rail-text">{m.text}</Text>}
                  />
                );
              })}
            </List>
            <VStack ref={end} data-am="desks-rail-end" height={0}>
              {null}
            </VStack>
          </ScrollableArea>
        )}
      </VStack>
    </VStack>
  );
}
