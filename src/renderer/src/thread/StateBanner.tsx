import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';

/** Stuck, desktop off and paused: one banner under the top bar, each with its one or two actions. */
/** `panelOpen`: the desktop panel already offers Start desktop, so the banner only states the fact. */
export function StateBanner({ employee, panelOpen }: { employee: Employee; panelOpen: boolean }) {
  const s = useStore.getState();
  const first = employee.persona.firstName;

  if (employee.state === 'stuck') {
    return (
      <Banner
        status="error"
        container="section"
        title={`${first} is stuck`}
        description={employee.stateDetail}
        endContent={
          <HStack gap={2}>
            <Button label="Show desktop" variant="secondary" size="sm" onClick={() => s.toggleDesktop(employee.id, true)} />
            <Button label="Try again" variant="secondary" size="sm" onClick={() => void s.resumeEmployee(employee.id)} />
          </HStack>
        }
      />
    );
  }
  if (employee.state === 'offline') {
    return (
      <Banner
        status="info"
        container="section"
        title={`${first}'s desktop is off`}
        endContent={panelOpen ? undefined : <Button label="Start desktop" variant="secondary" size="sm" onClick={() => void s.desktopAction(employee.id, 'start')} />}
      />
    );
  }
  if (employee.state === 'paused' && !employee.controlledByUser) {
    return (
      <Banner
        status="info"
        container="section"
        title={`${first} is paused`}
        endContent={<Button label="Resume" variant="secondary" size="sm" onClick={() => void s.resumeEmployee(employee.id)} />}
      />
    );
  }
  return null;
}
