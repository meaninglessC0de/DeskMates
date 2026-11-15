import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { Portrait } from '../ui/Portrait';
import { AvatarGroup } from '@astryxdesign/core/AvatarGroup';
import { routes } from '../../../shared';
import { useStore } from '../api/store';

const FACES = [
  { name: 'Maya Chen', file: 'maya.jpg' },
  { name: 'Priya Raman', file: 'priya.jpg' },
  { name: 'Jonas Weber', file: 'jonas.jpg' },
];

export function FirstRun() {
  return (
    <Center height="100%">
      <EmptyState
        icon={
          <AvatarGroup size={72}>
            {FACES.map((f) => (
              <Portrait key={f.file} person={{ id: f.file, name: f.name, portraitUrl: routes.portrait(f.file) }} size={72} />
            ))}
          </AvatarGroup>
        }
        title="Hire your first employee"
        description="Give them a role. They get their own desktop."
        actions={<Button label="Hire" variant="primary" onClick={() => useStore.getState().setUi({ hireOpen: true })} />}
      />
    </Center>
  );
}
