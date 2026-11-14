import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { useStore } from '../api/store';

export function FirstRun() {
  return (
    <Center height="100%">
      <EmptyState
        title="Hire your first employee"
        description="Pick a role and they start working on their own desktop."
        actions={<Button label="Hire" variant="primary" onClick={() => useStore.getState().setUi({ hireOpen: true })} />}
      />
    </Center>
  );
}
