import { useEffect, useRef, type ReactNode } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { useStore, selectSelected } from '../api/store';
import { Countdown } from './Countdown';
import { Sidebar } from './Sidebar';

export interface AppFrameProps {
  /** The main column: Conversation, TeamView or FirstRun. */
  children: ReactNode;
}

function useShortcuts(): void {
  const selected = useStore(selectSelected);
  const peers = useStore((s) => s.employees.length);
  const callsOff = useStore((s) => s.capabilities?.calls === 'off');
  const profileOpen = useStore((s) => s.ui.profileOpen);
  const s = useStore.getState();
  useHotkeys([
    { keys: 'mod+n', allowInInputs: true, onPress: () => s.setUi({ hireOpen: true }) },
    { keys: 'mod+shift+m', allowInInputs: true, isDisabled: peers < 2, onPress: () => s.setUi({ summonOpen: true }) },
    { keys: 'mod+shift+d', allowInInputs: true, isDisabled: !selected, onPress: () => selected && s.toggleDesktop(selected.id) },
    { keys: 'mod+shift+v', allowInInputs: true, isDisabled: !selected || callsOff, onPress: () => selected && void s.startCall([selected.id]) },
    { keys: 'mod+i', allowInInputs: true, isDisabled: !selected, onPress: () => s.setUi({ profileOpen: !profileOpen }) },
    { keys: 'mod+t', allowInInputs: true, onPress: () => s.setView('team') },
    { keys: 'mod+,', allowInInputs: true, onPress: () => s.setUi({ settingsOpen: true }) },
    {
      keys: 'mod+shift+p',
      allowInInputs: true,
      isDisabled: !selected,
      onPress: () => selected && void (selected.state === 'paused' ? s.resumeEmployee(selected.id) : s.pauseEmployee(selected.id)),
    },
  ]);
}

/** The banner shown while an employee holds the user's real screen, and the toast when it ends. */
function useLentScreen() {
  const employees = useStore((s) => s.employees);
  const lent = employees.find((e) => e.screenGrant) ?? null;
  const last = useRef<{ id: string; first: string } | null>(null);
  useEffect(() => {
    if (lent) {
      last.current = { id: lent.id, first: lent.persona.firstName };
    } else if (last.current) {
      useStore.getState().showToast(`${last.current.first} is back on their own desktop`, 'info');
      last.current = null;
    }
  }, [lent]);
  return lent;
}

export function AppFrame({ children }: AppFrameProps) {
  useShortcuts();
  const lent = useLentScreen();
  const banner = lent ? (
    <Banner
      status="info"
      container="section"
      title={`${lent.persona.firstName} is using your screen`}
      description={lent.screenGrant?.untilMs ? <>Ends in <Countdown untilMs={lent.screenGrant.untilMs} /></> : 'Until you take it back'}
      endContent={<Button label="Take it back" variant="secondary" size="sm" onClick={() => void useStore.getState().revokeScreen(lent.id)} />}
    />
  ) : undefined;

  return (
    <AppShell variant="elevated" contentPadding={0} sideNav={<Sidebar />} banner={banner}>
      {children}
    </AppShell>
  );
}
