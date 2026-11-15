import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { useStore } from '../api/store';
import { Desks } from '../ui/Desks';

/** No one hired yet: the four empty desks of the mark, and one way to fill the first. */
export function FirstRun() {
  return (
    <Center height="100%">
      <EmptyState
        icon={<Desks size={144} />}
        title="Hire your first deskmate"
        description="Pick a role. They get their own desk and computer."
        actions={<Button label="Hire" variant="primary" onClick={() => useStore.getState().setUi({ hireOpen: true })} />}
      />
    </Center>
  );
}
