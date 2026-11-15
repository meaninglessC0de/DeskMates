import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { ActivityStep } from '../../../shared';
import { Elapsed } from '../shell/Elapsed';
import { formatWorked, type ActivityGroup } from './model';

const MAX_ROWS = 8;

function StepIcon({ step }: { step: ActivityStep }) {
  if (step.status === 'running') return <Spinner size="sm" aria-label="In progress" />;
  if (step.status === 'error') return <Icon icon="error" size="xsm" color="error" label="Failed" />;
  return <Icon icon="check" size="xsm" color="secondary" label="Done" />;
}

/** One quiet line per step, collapsed by default. Never shows a tool name, path or command. */
export function ActivityGroupRow({ group }: { group: ActivityGroup }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? group.steps : group.steps.slice(0, MAX_ROWS);
  const hidden = group.steps.length - rows.length;

  const trigger = group.running ? (
    <HStack gap={2} vAlign="center">
      <Spinner size="sm" aria-label="Working" />
      <Text type="supporting" color="primary" maxLines={1}>
        {group.latest}
      </Text>
      <Text type="supporting">
        <Elapsed startMs={group.startedMs} />
      </Text>
    </HStack>
  ) : (
    <Text type="supporting">{`Worked for ${formatWorked(group.workedMs)}`}</Text>
  );

  return (
    <Collapsible data-am-activity="" chevronPosition="start" defaultIsOpen={false} trigger={trigger}>
      <VStack gap={0}>
        {rows.map((step) => (
          <Item
            key={step.id}
            density="compact"
            startContent={<StepIcon step={step} />}
            label={
              <Text type="supporting" color={step.status === 'error' ? 'primary' : 'secondary'} maxLines={1}>
                {step.sentence}
              </Text>
            }
            description={step.peer ? step.peer.text : undefined}
            endContent={step.endedMs ? <Text data-am-num="" type="supporting" color="secondary">{formatWorked(step.endedMs - step.startedMs)}</Text> : undefined}
          />
        ))}
        {hidden > 0 ? <Button label={`Show ${hidden} more`} variant="ghost" size="sm" onClick={() => setShowAll(true)} /> : null}
      </VStack>
    </Collapsible>
  );
}
