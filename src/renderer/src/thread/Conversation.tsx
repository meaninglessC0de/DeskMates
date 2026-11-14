import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Center } from '@astryxdesign/core/Center';
import { useStore } from '../api/store';
import { TopBar } from '../shell/TopBar';
import { DesktopPanel } from '../desktop/DesktopPanel';

export interface ConversationProps {
  employeeId: string;
}

/** Placeholder: top bar, a labelled empty state with live thread data, and the docked desktop panel. */
export function Conversation({ employeeId }: ConversationProps) {
  const employee = useStore((s) => s.employees.find((e) => e.id === employeeId));
  const thread = useStore((s) => s.threads[employeeId]);
  const desktopOpen = useStore((s) => s.ui.desktopOpen[employeeId] ?? false);
  if (!employee) return null;

  const pending = thread?.approvals.filter((a) => a.status === 'pending').length ?? 0;
  const last = thread?.messages[thread.messages.length - 1];

  return (
    <Layout
      height="fill"
      header={<TopBar employee={employee} />}
      content={
        <LayoutContent>
          {thread?.loading && !thread.loaded ? (
            <Center height="100%">
              <Spinner label="Loading" />
            </Center>
          ) : thread?.error ? (
            <EmptyState title={thread.error} actions={undefined} />
          ) : (
            <EmptyState
              title={`Conversation with ${employee.persona.firstName}`}
              description={`${thread?.messages.length ?? 0} messages, ${thread?.steps.length ?? 0} steps, ${pending} to approve`}
              actions={
                <VStack gap={1} hAlign="center">
                  <Text type="supporting">{thread?.task ? `Task: ${thread.task.title}` : 'No task yet'}</Text>
                  {last ? <Text type="supporting" maxLines={1}>{last.text}</Text> : null}
                </VStack>
              }
            />
          )}
        </LayoutContent>
      }
      end={desktopOpen ? <DesktopPanel employeeId={employeeId} /> : undefined}
    />
  );
}
