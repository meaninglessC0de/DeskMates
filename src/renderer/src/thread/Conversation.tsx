import { useState } from 'react';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { ChatComposer, ChatLayout, ChatMessageList } from '@astryxdesign/core/Chat';
import { Drawer } from '@astryxdesign/core/Drawer';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';
import { useHotkeys, useMediaQuery } from '@astryxdesign/core/hooks';
import { useStore } from '../api/store';
import { getShot } from '../fixtures/shot';
import { TopBar } from '../shell/TopBar';
import { DesktopExpanded, DesktopPanel, DesktopSide } from '../desktop/DesktopPanel';
import { Messages } from './Messages';
import { StateBanner } from './StateBanner';
import { buildTimeline } from './model';

export interface ConversationProps {
  employeeId: string;
}

function LoadingBubbles() {
  return (
    <VStack gap={4} padding={6}>
      <HStack gap={3}>
        <Skeleton width={32} height={32} radius="rounded" />
        <Skeleton width={320} height={56} />
      </HStack>
      <HStack hAlign="end">
        <Skeleton width={240} height={40} />
      </HStack>
      <HStack gap={3}>
        <Skeleton width={32} height={32} radius="rounded" />
        <Skeleton width={380} height={72} />
      </HStack>
    </VStack>
  );
}

export function Conversation({ employeeId }: ConversationProps) {
  const employee = useStore((s) => s.employees.find((e) => e.id === employeeId));
  const thread = useStore((s) => s.threads[employeeId]);
  const desktopOpen = useStore((s) => s.ui.desktopOpen[employeeId] ?? false);
  const narrow = useMediaQuery('(max-width: 1099px)');
  const failedShot = getShot()?.params.get('sendfail') === '1';
  const [draft, setDraft] = useState(failedShot ? 'Use the blue version.' : '');
  const [sendFailed, setSendFailed] = useState(failedShot);
  const [expandedState, setExpanded] = useState(() => getShot()?.params.get('expand') === '1');
  const expanded = expandedState && desktopOpen && !narrow;

  useHotkeys([
    { keys: 'mod+shift+enter', allowInInputs: true, isDisabled: !desktopOpen || narrow, onPress: () => setExpanded((v) => !v) },
    { keys: 'escape', isDisabled: !expanded, onPress: () => setExpanded(false) },
  ]);

  if (!employee) return null;
  const s = useStore.getState();
  const first = employee.persona.firstName;

  const send = async (text: string): Promise<void> => {
    const t = text.trim();
    if (!t) return;
    setDraft('');
    setSendFailed(false);
    if (!(await s.sendMessage(employeeId, t))) {
      setDraft(t);
      setSendFailed(true);
    }
  };

  const items = thread ? buildTimeline(thread, Date.now()) : [];
  const newest = thread?.messages[thread.messages.length - 1] ?? null;
  const newestEmployee = newest && newest.from === 'employee' ? newest : null;
  const newestUser = [...(thread?.messages ?? [])].reverse().find((m) => m.from === 'user') ?? null;
  const offline = employee.state === 'offline';

  let chat;
  if (thread?.loading && !thread.loaded) {
    chat = (
      <VStack height="100%">
        <LoadingBubbles />
      </VStack>
    );
  } else if (thread?.error) {
    chat = (
      <EmptyState
        title={thread.error}
        actions={<Button label="Try again" variant="secondary" onClick={() => void s.loadThread(employeeId)} />}
      />
    );
  } else {
    chat = (
      <VStack height="100%">
        <StateBanner employee={employee} panelOpen={desktopOpen && !narrow} />
        <ChatLayout
          composer={
            <ChatComposer
              value={draft}
              onChange={(v) => {
                setDraft(v);
                if (sendFailed) setSendFailed(false);
              }}
              onSubmit={(v) => void send(v)}
              placeholder={offline ? `Message ${first}. Delivered when the desktop is on` : `Message ${first}`}
              isStopShown={false}
              status={sendFailed ? { type: 'error', message: "Couldn't send. Check your connection." } : undefined}
            />
          }
          emptyState={
            <EmptyState
              icon={<Avatar name={employee.persona.name} src={employee.persona.portraitUrl || undefined} size={128} tooltip={false} />}
              title={`Say hi to ${first}`}
              description="Give them a first task."
              actions={
                <HStack gap={2} wrap="wrap" hAlign="center">
                  {employee.persona.starters.slice(0, 3).map((label) => (
                    <Button key={label} label={label} variant="ghost" onClick={() => setDraft(label)} />
                  ))}
                </HStack>
              }
            />
          }>
          {items.length > 0 || thread?.typing ? (
            <ChatMessageList density="balanced" scrollToTopAction={thread?.hasMore ? () => s.loadOlder(employeeId) : undefined}>
              <Messages items={items} employee={employee} typing={thread?.typing ?? false} newest={newestEmployee} newestUser={newestUser} />
            </ChatMessageList>
          ) : null}
        </ChatLayout>
      </VStack>
    );
  }

  if (expanded) {
    return (
      <Layout
        height="fill"
        header={<TopBar employee={employee} />}
        content={<DesktopExpanded employeeId={employeeId} onBack={() => setExpanded(false)} />}
        end={<DesktopSide employeeId={employeeId} />}
      />
    );
  }

  return (
    <>
      <Layout
        height="fill"
        header={<TopBar employee={employee} />}
        content={<LayoutContent padding={0}>{chat}</LayoutContent>}
        end={desktopOpen && !narrow ? <DesktopPanel employeeId={employeeId} onExpand={() => setExpanded(true)} /> : undefined}
      />
      {narrow ? (
        <Drawer isOpen={desktopOpen} onOpenChange={(o) => s.toggleDesktop(employeeId, o)} label="Desktop" width={440} hasScrim={false}>
          <DesktopPanel employeeId={employeeId} isInDrawer />
        </Drawer>
      ) : null}
    </>
  );
}
