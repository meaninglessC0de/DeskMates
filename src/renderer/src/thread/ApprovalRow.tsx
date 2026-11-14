import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Section } from '@astryxdesign/core/Section';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import type { Approval } from '../../../shared';
import { useStore } from '../api/store';

/** The request, the resolved action in one line, and Deny and Approve. Resolved: one quiet line. */
export function ApprovalRow({ approval }: { approval: Approval }) {
  if (approval.status !== 'pending') {
    const verb = approval.status === 'approved' ? 'You approved this' : approval.status === 'denied' ? 'You denied this' : 'Expired';
    return (
      <Text type="supporting">
        {`${verb} · `}
        <Timestamp value={approval.resolvedMs ?? approval.createdMs} format="time" type="inherit" color="inherit" />
      </Text>
    );
  }
  const decide = (decision: 'approve' | 'deny'): void => void useStore.getState().decideApproval(approval.id, { decision });
  const screen = approval.kind === 'screen';
  return (
    <Section variant="muted" padding={3}>
      <Item
        density="compact"
        startContent={<StatusDot variant="warning" label="Needs your approval" />}
        label={<Text type="label">{approval.title}</Text>}
        description={
          <Text type="supporting" maxLines={1}>
            {approval.detail}
          </Text>
        }
        endContent={
          <HStack gap={2}>
            <Button label={screen ? 'Not now' : 'Deny'} variant="secondary" size="sm" onClick={() => decide('deny')} />
            <Button label={screen ? 'Allow' : 'Approve'} variant="primary" size="sm" onClick={() => decide('approve')} />
          </HStack>
        }
      />
    </Section>
  );
}
