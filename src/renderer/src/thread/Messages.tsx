import { ChatMessage, ChatMessageBubble, ChatMessageMetadata, ChatSystemMessage } from '@astryxdesign/core/Chat';
import { Spinner } from '@astryxdesign/core/Spinner';
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
            return (
              <ChatMessage key={item.key} sender="assistant" avatar={<Portrait employee={employee} />}>
                {item.parts.map((p, i) => {
                  if (p.kind === 'message') {
                    return (
                      <ChatMessageBubble
                        key={p.key}
                        group={groups[i]}
                        metadata={
                          i === lastText || (newest && p.message.id === newest.id) ? (
                            <ChatMessageMetadata timestamp={<Timestamp value={p.message.createdMs} format="time" />} />
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
                  return (
                    p.approval.status === 'pending' ? (
                      <ApprovalRow key={p.key} approval={p.approval} />
                    ) : (
                      <ChatMessageBubble key={p.key} variant="ghost">
                        <ApprovalRow approval={p.approval} />
                      </ChatMessageBubble>
                    )
                  );
                })}
              </ChatMessage>
            );
          }
        }
      })}
      {typing ? (
        <ChatMessage sender="assistant" avatar={<Portrait employee={employee} />}>
          <ChatMessageBubble variant="ghost">
            <Spinner size="sm" aria-label={`${employee.persona.firstName} is typing`} />
          </ChatMessageBubble>
        </ChatMessage>
      ) : null}
    </>
  );
}
