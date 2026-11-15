import { useState } from 'react';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { Popover } from '@astryxdesign/core/Popover';
import { Selector } from '@astryxdesign/core/Selector';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Circle } from 'lucide-react';
import type { Employee, PlanStep } from '../../../shared';
import { useStore } from '../api/store';
import { getShot } from '../fixtures/shot';
import { SpaceView, type SpaceState } from '../media/SpaceView';
import { Elapsed } from '../shell/Elapsed';
import { STATE_LABEL } from '../shell/presence';
import { DeskLoader } from '../ui/DeskLoader';

const DOT: Partial<Record<Employee['state'], 'success' | 'warning' | 'error'>> = { working: 'success', needs_you: 'warning', stuck: 'error' };
const PLAN_ROWS = 6;
const NO_PLAN: PlanStep[] = [];

/** "Working · 42 min", or "You're in control". */
export function StateLine({ employee, hasDot = true }: { employee: Employee; hasDot?: boolean }) {
  const controlling = employee.controlledByUser;
  const label = controlling ? "You're in control" : STATE_LABEL[employee.state];
  return (
    <HStack gap={2} vAlign="center">
      {hasDot ? <StatusDot variant={controlling ? 'neutral' : (DOT[employee.state] ?? 'neutral')} label={label} /> : null}
      <Text type="supporting">
        {label}
        {employee.state === 'working' && !controlling ? ' · ' : ''}
        {employee.state === 'working' && !controlling ? <Elapsed startMs={employee.stateSinceMs} /> : null}
      </Text>
    </HStack>
  );
}

/** The shot flag `screen=connecting|error` wins over the stream's own state. */
export function shownScreenState(state: SpaceState): SpaceState {
  const forced = getShot()?.params.get('screen');
  return forced === 'connecting' || forced === 'error' ? forced : state;
}

/** The header's quiet stream marker: a green dot and "Live", or a spinner and "Connecting". */
export function LiveMarker({ state }: { state: SpaceState }) {
  const shown = shownScreenState(state);
  if (shown === 'live') {
    return (
      <HStack gap={1.5} vAlign="center" data-am-live="">
        <StatusDot variant="success" label="Live" />
        <Text type="supporting">Live</Text>
      </HStack>
    );
  }
  if (shown === 'connecting') {
    return (
      <HStack gap={1.5} vAlign="center">
        <Spinner size="sm" aria-label="Connecting" />
        <Text type="supporting">Connecting</Text>
      </HStack>
    );
  }
  return null;
}

/** The live screen and its states: connecting, off, can't show, and lent to the employee. */
export function Screen({ employee, onState }: { employee: Employee; onState?: (s: SpaceState) => void }) {
  const s = useStore.getState();
  const first = employee.persona.firstName;
  const [state, setStateLocal] = useState<SpaceState>('connecting');
  const setState = (next: SpaceState): void => {
    setStateLocal(next);
    onState?.(next);
  };
  const [attempt, setAttempt] = useState(0);
  const shown = shownScreenState(state);

  if (employee.screenGrant) {
    return (
      <VStack data-am-screen="" data-am-screen-state="lent">
        <AspectRatio ratio={16 / 10}>
          <Center height="100%">
            <EmptyState isCompact title={`${first} is on your screen`} />
          </Center>
        </AspectRatio>
      </VStack>
    );
  }
  if (employee.state === 'starting') {
    return (
      <VStack data-am-screen="" data-am-screen-state="off">
        <AspectRatio ratio={16 / 10}>
          <Center height="100%">
            <DeskLoader size={40} label={`Starting ${first}'s desktop`} />
          </Center>
        </AspectRatio>
      </VStack>
    );
  }
  if (employee.state === 'offline' || employee.desktopSinceMs === null) {
    return (
      <VStack data-am-screen="" data-am-screen-state="off">
        <AspectRatio ratio={16 / 10}>
          <Center height="100%">
            <EmptyState
              isCompact
              title="Desktop is off"
              actions={<Button label="Start desktop" variant="secondary" onClick={() => void s.desktopAction(employee.id, 'start')} />}
            />
          </Center>
        </AspectRatio>
      </VStack>
    );
  }
  return (
    <VStack gap={2}>
      <VStack data-am-screen="" data-am-screen-state={shown} data-am-control={employee.controlledByUser ? 'true' : 'false'}>
        <SpaceView key={attempt} employeeId={employee.id} mode={employee.controlledByUser ? 'control' : 'view'} onState={setState} />
      </VStack>
      {shown === 'connecting' && !onState ? (
        <HStack gap={2} vAlign="center">
          <Spinner size="sm" aria-label="Connecting" />
          <Text type="supporting">{`Connecting to ${first}'s desktop`}</Text>
        </HStack>
      ) : null}
      {shown === 'error' || shown === 'offline' ? (
        <HStack gap={2} vAlign="center">
          <Text type="supporting">{`Can't show the desktop. ${first} is still working.`}</Text>
          <Button label="Try again" variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)} />
        </HStack>
      ) : null}
    </VStack>
  );
}

const LENGTHS = [
  { value: '10', label: '10 minutes', minutes: 10 },
  { value: '30', label: '30 minutes', minutes: 30 },
  { value: '60', label: '1 hour', minutes: 60 },
  { value: 'open', label: 'Until I stop', minutes: null },
] as const;

function LendScreen({ employee }: { employee: Employee }) {
  const [isOpen, setOpen] = useState(getShot()?.params.get('popover') === 'lend');
  const [value, setValue] = useState<string>('10');
  const allowed = employee.permissions.myScreen;
  const lend = (): void => {
    const minutes = LENGTHS.find((l) => l.value === value)?.minutes ?? 10;
    setOpen(false);
    void useStore.getState().grantScreen(employee.id, minutes);
  };
  return (
    <Popover
      isOpen={isOpen && allowed}
      onOpenChange={setOpen}
      placement="below"
      alignment="center"
      width={280}
      label="Lend my screen"
      content={
        <VStack gap={3}>
          <Selector label="For how long" options={LENGTHS.map(({ value: v, label }) => ({ value: v, label }))} value={value} onChange={setValue} />
          <Button label="Lend" variant="primary" size="sm" onClick={lend} />
        </VStack>
      }>
      <Button
        label="Lend my screen"
        variant="ghost"
        width="100%"
        isDisabled={!allowed}
        tooltip={allowed ? undefined : "Turn on 'Can use my screen' in their profile"}
      />
    </Popover>
  );
}

/** Take control (secondary: Summon meeting is the window's one filled button) or Give back (filled while you drive), and Lend my screen. */
export function Actions({ employee }: { employee: Employee }) {
  const s = useStore.getState();
  if (employee.state === 'offline' || employee.desktopSinceMs === null || employee.screenGrant) return null;
  return (
    <VStack gap={1}>
      <Button
        label={employee.controlledByUser ? 'Give back' : 'Take control'}
        variant={employee.controlledByUser ? 'primary' : 'secondary'}
        width="100%"
        clickAction={async () => {
          await s.setControl(employee.id, !employee.controlledByUser);
        }}
      />
      <LendScreen employee={employee} />
    </VStack>
  );
}

function PlanIcon({ step, working }: { step: PlanStep; working: boolean }) {
  if (step.status === 'done') return <Icon icon="check" size="xsm" color="secondary" label="Done" />;
  if (step.status === 'in_progress' && working) return <Spinner size="sm" aria-label="In progress" />;
  return <Icon icon={Circle} size="xsm" color={step.status === 'in_progress' ? 'primary' : 'secondary'} label={step.status === 'in_progress' ? 'Current' : 'Next'} />;
}

export function PlanSection({ employee }: { employee: Employee }) {
  const plan = useStore((s) => s.threads[employee.id]?.task?.plan ?? NO_PLAN);
  const [all, setAll] = useState(false);
  if (employee.state === 'offline' || employee.desktopSinceMs === null) return null;
  const rows = all ? plan : plan.slice(0, PLAN_ROWS);
  return (
    <VStack gap={2}>
      <Text type="label">Plan</Text>
      {plan.length === 0 ? (
        <Text type="supporting">No plan yet</Text>
      ) : (
        <VStack gap={0} data-am-plan="">
          {rows.map((step, i) => (
            <Item
              key={`${i}-${step.title}`}
              density="compact"
              startContent={<PlanIcon step={step} working={employee.state === 'working'} />}
              label={
                <Text type="body" color={step.status === 'in_progress' ? 'primary' : 'secondary'} maxLines={1}>
                  {step.title}
                </Text>
              }
            />
          ))}
          {plan.length > PLAN_ROWS && !all ? <Button label={`Show all (${plan.length})`} variant="ghost" size="sm" onClick={() => setAll(true)} /> : null}
        </VStack>
      )}
    </VStack>
  );
}
