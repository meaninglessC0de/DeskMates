import { useEffect, useRef, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Portrait } from '../ui/Portrait';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Play, Square } from 'lucide-react';
import type { Employee, PermissionLevel, Permissions } from '../../../shared';
import { useStore } from '../api/store';
import { useShot } from '../fixtures/shot';
import { withShotState } from './shotState';

export interface ProfileDrawerProps {
  employeeId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const LEVELS: { value: PermissionLevel; label: string; description: string }[] = [
  { value: 'asks_first', label: 'Asks first', description: 'Checks with you before anything that changes something.' },
  { value: 'asks_big_steps', label: 'Asks before big steps', description: 'Checks before deploying, spending, sending or deleting.' },
  { value: 'independent', label: 'Works independently', description: 'Only stops when it is stuck.' },
];

const SWITCHES: { key: 'internet' | 'commands' | 'myScreen' | 'teammates'; label: string; tip?: string }[] = [
  { key: 'internet', label: 'Can use the internet', tip: 'Browse and search' },
  { key: 'commands', label: 'Can run commands', tip: 'Use the terminal on the desktop' },
  { key: 'myScreen', label: 'Can use my screen', tip: 'Asks each time' },
  { key: 'teammates', label: 'Can message teammates' },
];

const MINUTE = 60_000;

function uptime(sinceMs: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - sinceMs) / MINUTE));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

function desktopLine(e: Employee, now: number): string {
  if (e.state === 'offline') return 'Desktop is off';
  if (e.state === 'starting' || e.desktopSinceMs === null) return 'Starting desktop';
  return `Running for ${uptime(e.desktopSinceMs, now)}`;
}

export function ProfileDrawer({ employeeId, isOpen, onOpenChange }: ProfileDrawerProps) {
  const stored = useStore((s) => s.employees.find((e) => e.id === employeeId));
  const employee = withShotState(stored);
  const hostScreen = useStore((s) => s.capabilities?.hostScreen ?? true);
  const shot = useShot()?.params;

  const [personality, setPersonality] = useState(employee?.persona.personality ?? '');
  const [saveError, setSaveError] = useState(false);
  const [screenAsk, setScreenAsk] = useState(shot?.get('confirm') === 'screen');
  const [resetAsk, setResetAsk] = useState(shot?.get('confirm') === 'reset');
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setPersonality(employee?.persona.personality ?? '');
    setSaveError(false);
  }, [employee?.id, employee?.persona.personality]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(t);
  }, [isOpen]);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  if (!employee) return null;
  const first = employee.persona.firstName;
  const patch = useStore.getState().patchEmployee;
  const setPermission = (p: Partial<Permissions>): Promise<unknown> => patch(employee.id, { permissions: p });
  const sampleUrl = employee.persona.voice.sampleUrl ?? (shot?.get('hear') === '1' ? '/media/voices/sample.mp3' : null);

  const savePersonality = async (): Promise<void> => {
    const next = personality.trim();
    if (!next || next === employee.persona.personality) return;
    const ok = await patch(employee.id, { persona: { personality: next } });
    setSaveError(!ok);
  };

  const hear = (): void => {
    if (!sampleUrl) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    const a = new Audio(sampleUrl);
    a.onended = () => setPlaying(false);
    a.onerror = () => setPlaying(false);
    audio.current = a;
    setPlaying(true);
    void a.play().catch(() => setPlaying(false));
  };

  const desktopOff = employee.state === 'offline';

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} label="Profile" width={400} hasScrim={false} data-am-drawer="">
      <Layout
        height="fill"
        header={<DrawerHeader title={employee.persona.name} subtitle={employee.persona.role} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent isScrollable>
            <VStack gap={6} data-am-sections="">
              <VStack gap={2} hAlign="center" paddingBlockStart={2}>
                <Portrait person={{ id: employee.id, name: employee.persona.name, portraitUrl: employee.persona.portraitUrl }} size={96} />
                {sampleUrl ? (
                  <Button
                    label={playing ? 'Playing' : `Hear ${first}`}
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={playing ? Square : Play} size="sm" />}
                    onClick={hear}
                  />
                ) : null}
              </VStack>

              <TextArea
                label="Personality"
                hasAutoFocus
                rows={2}
                maxLength={280}
                value={personality}
                onChange={(v) => {
                  setPersonality(v);
                  setSaveError(false);
                }}
                onBlur={() => void savePersonality()}
                status={saveError ? { type: 'error', message: "Couldn't save" } : undefined}
              />

              <VStack gap={4}>
                <RadioList
                  label="Permissions"
                  value={employee.permissions.level}
                  onChange={(v) => void setPermission({ level: v as PermissionLevel })}>
                  {LEVELS.map((l) => (
                    <RadioListItem key={l.value} value={l.value} label={l.label} description={l.description} />
                  ))}
                </RadioList>
                <VStack gap={3}>
                  {SWITCHES.map((s) => (
                    <Switch
                      key={s.key}
                      label={s.label}
                      labelTooltip={s.tip}
                      labelPosition="start" labelSpacing="spread"
                      value={employee.permissions[s.key]}
                      isDisabled={s.key === 'myScreen' && !hostScreen}
                      disabledMessage={s.key === 'myScreen' && !hostScreen ? 'Not available on this Mac' : undefined}
                      changeAction={async (on) => {
                        if (s.key === 'myScreen' && on) {
                          setScreenAsk(true);
                          return;
                        }
                        await setPermission({ [s.key]: on });
                      }}
                    />
                  ))}
                  {employee.pendingRestart ? <Text type="supporting">{`Applies after ${first}'s desktop restarts`}</Text> : null}
                </VStack>
              </VStack>

              <VStack gap={2}>
                <Text type="label">Desktop</Text>
                <Text type="supporting" data-am-num="">{desktopLine(employee, now)}</Text>
                <HStack gap={2}>
                  <Button
                    label={desktopOff ? 'Start' : 'Restart'}
                    variant="secondary"
                    onClick={() => void useStore.getState().desktopAction(employee.id, desktopOff ? 'start' : 'restart')}
                  />
                  <Button label="Reset…" variant="secondary" onClick={() => setResetAsk(true)} />
                </HStack>
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />

      <AlertDialog
        isOpen={screenAsk}
        onOpenChange={setScreenAsk}
        title={`Let ${first} ask to use your screen?`}
        description="They will ask each time, and you can take it back at any point."
        actionLabel="Allow"
        actionVariant="primary"
        onAction={async () => {
          await setPermission({ myScreen: true });
          setScreenAsk(false);
        }}
      />
      <AlertDialog
        isOpen={resetAsk}
        onOpenChange={setResetAsk}
        title={`Reset ${first}'s desktop?`}
        description="Files and open apps will be erased. The profile stays."
        actionLabel="Reset"
        isActionLoading={resetting}
        onAction={async () => {
          setResetting(true);
          await useStore.getState().desktopAction(employee.id, 'reset');
          setResetting(false);
          setResetAsk(false);
        }}
      />
    </Drawer>
  );
}
