import { useEffect, useRef } from 'react';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { Employee } from '../../../shared';
import { Portrait } from '../ui/Portrait';
import type { FeedRow } from './feed';
import type { DesksScale } from './layout';

const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Every message between desks, oldest at the top and the newest kept in view at the bottom. Rows (Astryx List and
 * ListItem), not cards: the sender's portrait, "Priya to Jonas", the text in up to four lines, and the time.
 */
export function MessagesRail({ messages, employees, managerName, width, height, scale }: { messages: FeedRow[]; employees: Employee[]; managerName: string | null; width: number; height: number; scale: DesksScale }) {
  const end = useRef<HTMLElement | null>(null);
  const last = messages[messages.length - 1]?.id;
  useEffect(() => {
    // The scroll area only becomes scrollable after it has measured its content, so look again a moment later.
    const go = (): void => end.current?.scrollIntoView({ block: 'end' });
    go();
    const raf = requestAnimationFrame(go);
    const t = setTimeout(go, 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [last, scale]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const manager = managerName?.trim() || null;
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
                const from = m.fromId ? byId.get(m.fromId) : undefined;
                const to = m.toId ? byId.get(m.toId) : undefined;
                const fromName = m.fromId ? from?.persona.firstName ?? 'Someone' : manager ?? 'You';
                const toName = m.team ? 'the team' : m.toId ? to?.persona.firstName ?? 'a teammate' : manager ?? 'you';
                const face = m.fromId ? from && { id: from.id, name: from.persona.name, portraitUrl: from.persona.portraitUrl } : { id: 'manager', name: manager ?? 'You' };
                return (
                  <ListItem
                    key={m.id}
                    itemKey={m.id}
                    align="start"
                    startContent={face ? <Portrait person={face} size={32} /> : undefined}
                    label={
                      <HStack data-am="rail-head" gap={2} vAlign="center">
                        <Text type="label" maxLines={1} data-am="rail-title">{`${fromName} to ${toName}`}</Text>
                        {m.tag ? (
                          <Text type="supporting" data-am="rail-tag">
                            {m.tag}
                          </Text>
                        ) : null}
                        <Text type="supporting" data-am="rail-time">{clock(m.ms)}</Text>
                      </HStack>
                    }
                    description={<Text type="supporting" maxLines={4} data-am="rail-text">{m.text}</Text>}
                  />
                );
              })}
            </List>
            <VStack ref={end} data-am="desks-rail-end" height={16}>
              {null}
            </VStack>
          </ScrollableArea>
        )}
      </VStack>
    </VStack>
  );
}
