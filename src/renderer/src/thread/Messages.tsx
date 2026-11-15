import { Fragment } from 'react';
import { Center } from '@astryxdesign/core/Center';
import { ChatMessage, ChatMessageBubble, ChatMessageMetadata, ChatSystemMessage } from '@astryxdesign/core/Chat';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import type { Employee, Message } from '../../../shared';
import { ActivityGroupRow } from './ActivityGroupRow';
import { ApprovalRow } from './ApprovalRow';
import { Portrait as Face } from '../ui/Portrait';
import { bubbleGroups, type TimelineItem } from './model';

interface Props {
  items: TimelineItem[];
  employee: Employee;
  typing: boolean;
  /** Newest message of the thread, for the time and delivery lines. */
  newest: Message | null;
  newestUser: Message | null;
}

function Portrait({ employee }: { employee: Employee }) {
  return <Face person={{ id: employee.id, name: employee.persona.name, portraitUrl: employee.persona.portraitUrl }} size={32} />;
}

/** The children of a ChatMessageList. */
export function Messages({ items, employee, typing, newest, newestUser }: Props) {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'day':
            return (
              <ChatSystemMessage key={item.key} variant="divider">
                {item.label}
              </ChatSystemMessage>
            );
          case 'system':
            return <ChatSystemMessage key={item.key}>{item.message.text}</ChatSystemMessage>;
          case 'user':
            return (
              <ChatMessage key={item.key} sender="user">
                {item.messages.map((m, i) => {
                  const group = item.messages.length === 1 ? undefined : i === 0 ? 'first' : i === item.messages.length - 1 ? 'last' : 'middle';
                  return (
                    <ChatMessageBubble
                      key={m.id}
                      group={group}
                      metadata={
                        newestUser && m.id === newestUser.id ? (
                          <ChatMessageMetadata footer={<Text type="supporting">{m.seenMs ? 'Seen' : 'Delivered'}</Text>} />
                        ) : undefined
                      }>
                      {m.text}
                    </ChatMessageBubble>
                  );
                })}
              </ChatMessage>
            );
          case 'employee': {
            const groups = bubbleGroups(item.parts);
            let lastText = -1;
            item.parts.forEach((p, i) => {
              if (p.kind === 'message') lastText = i;
            });
            const renderPart = (p: (typeof item.parts)[number], i: number) => {
              if (p.kind === 'message') {
                return (
                  <ChatMessageBubble
                    key={p.key}
                    group={groups[i]}
                    metadata={
                      i === lastText || (newest && p.message.id === newest.id) ? (
                        <ChatMessageMetadata timestamp={<Timestamp value={p.message.createdMs} format="time" hasTooltip={false} />} />
                      ) : undefined
                    }>
                    {p.message.text}
                  </ChatMessageBubble>
                );
              }
              if (p.kind === 'activity') {
                return (
                  <ChatMessageBubble key={p.key} variant="ghost">
                    <ActivityGroupRow group={p.group} />
                  </ChatMessageBubble>
                );
              }
              return p.approval.status === 'pending' ? (
                <ApprovalRow key={p.key} approval={p.approval} />
              ) : (
                <ChatMessageBubble key={p.key} variant="ghost">
                  <ApprovalRow approval={p.approval} />
                </ChatMessageBubble>
              );
            };
            // The face sits beside the run's last bubble: the run is split after it, and whatever follows
            // (activity, an approval) continues in the same column with an empty avatar slot.
            const cut = lastText >= 0 ? lastText + 1 : item.parts.length;
            const head = item.parts.slice(0, cut);
            const tail = item.parts.slice(cut);
            return (
              <Fragment key={item.key}>
                <ChatMessage sender="assistant" avatar={<Portrait employee={employee} />} data-am-run={lastText >= 0 ? 'text' : 'other'}>
                  {head.map((p, i) => renderPart(p, i))}
                </ChatMessage>
                {tail.length > 0 ? (
                  <ChatMessage sender="assistant" avatar={<Center data-am-avatar-gap="" width={32} height={32}>{null}</Center>} data-am-run="cont">
                    {tail.map((p, i) => renderPart(p, cut + i))}
                  </ChatMessage>
                ) : null}
              </Fragment>
            );
          }
        }
      })}
      {typing ? (
        <ChatMessage sender="assistant" avatar={<Portrait employee={employee} />}>
          <ChatMessageBubble>
            <HStack gap={1} vAlign="center" data-am-typing="" role="status" aria-label={`${employee.persona.firstName} is typing`}>
              {[0, 1, 2].map((i) => (
                <Center key={i} data-am-typing-dot={String(i)} width={6} height={6}>
                  {null}
                </Center>
              ))}
            </HStack>
          </ChatMessageBubble>
        </ChatMessage>
      ) : null}
    </>
  );
}
