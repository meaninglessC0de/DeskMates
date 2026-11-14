import { AppShell } from '@astryxdesign/core/AppShell';
import { Theme } from '@astryxdesign/core/theme';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { themes, defaultThemeSlug } from '../theme';
import { useStore } from '../api/store';
import { useCall } from './useCall';

/** Placeholder: the dark stage, rendered as the whole app while a call is live. */
export function Stage() {
  const call = useCall();
  const employees = useStore((s) => s.employees);
  const names = call.participants.map((p) => employees.find((e) => e.id === p.employeeId)?.persona.firstName ?? '').join(', ');
  const caption = call.captions[call.captions.length - 1];
  return (
    <Theme theme={themes[defaultThemeSlug]!} mode="dark">
      <AppShell contentPadding={0}>
        <Center height="100%">
          <EmptyState
            title={call.state === 'failed' ? "Couldn't start the call" : `Call with ${names}`}
            description={`${call.state}, ${call.mode}, ${call.participants.length} on the call`}
            actions={
              <VStack gap={3} hAlign="center">
                {caption ? <Text type="supporting">{caption.text}</Text> : null}
                <Button label={call.state === 'failed' ? 'Close' : 'End'} variant="primary" onClick={call.end} />
              </VStack>
            }
          />
        </Center>
      </AppShell>
    </Theme>
  );
}
