import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { StackItem } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';
import { Countdown } from './Countdown';

/** Neutral band across the window while an employee holds the user's real screen. */
export function LentBanner({ employee }: { employee: Employee }) {
  const until = employee.screenGrant?.untilMs ?? null;
  return (
    <Section variant="muted" paddingBlock={2} paddingInline={4} dividers={['bottom']}>
      <HStack gap={3} vAlign="center">
        <StatusDot variant="accent" label="Screen in use" />
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text type="label">{`${employee.persona.firstName} is using your screen`}</Text>
            <Text type="supporting">{until ? <>Ends in <Countdown untilMs={until} /></> : 'Until you take it back'}</Text>
          </VStack>
        </StackItem>
        <Button label="Take it back" variant="secondary" size="sm" onClick={() => void useStore.getState().revokeScreen(employee.id)} />
      </HStack>
    </Section>
  );
}
