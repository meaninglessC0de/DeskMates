import { useEffect } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';
import { SideNav } from '@astryxdesign/core/SideNav';
import { useToast } from '@astryxdesign/core/Toast';
import { useStore, selectSelected } from './api/store';
import { getShot, isShot } from './fixtures/shot';
import { loadShot } from './fixtures/load';
import { AppFrame } from './shell/AppFrame';
import { FirstRun } from './shell/FirstRun';
import { Conversation } from './thread/Conversation';
import { TeamView } from './team/TeamView';
import { HireDialog } from './hire/HireDialog';
import { ProfileDrawer } from './profile/ProfileDrawer';
import { SettingsDialog } from './settings/SettingsDialog';
import { Stage } from './stage/Stage';
import { SummonPicker } from './stage/SummonPicker';

/** Called once before the first render. In `?shot=` mode this loads the store from the fixtures. */
export function initApp(): void {
  const shot = getShot();
  if (shot) loadShot(shot);
}

function ToastBridge() {
  const toast = useToast();
  const t = useStore((s) => s.toast);
  useEffect(() => {
    if (t) toast({ body: t.text, type: t.tone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.seq]);
  return null;
}

function Placeholder({ error }: { error?: boolean }) {
  return (
    <AppShell
      contentPadding={0}
      banner={
        error ? (
          <Banner
            status="error"
            title="Can't reach your team"
            description="Check that the app service is running"
            container="section"
            endContent={<Button label="Retry" variant="secondary" onClick={() => void useStore.getState().boot()} />}
          />
        ) : undefined
      }
      sideNav={
        <SideNav aria-label="Team">
          <VStack gap={3} padding={3}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} />
            ))}
          </VStack>
        </SideNav>
      }>
      <VStack gap={3} padding={4}>
        <Skeleton height={32} width={240} />
        <Skeleton height={16} />
        <Skeleton height={16} width="70%" />
      </VStack>
    </AppShell>
  );
}

export function App() {
  const boot = useStore((s) => s.bootState);
  const call = useStore((s) => s.call);
  const employees = useStore((s) => s.employees);
  const ui = useStore((s) => s.ui);
  const selected = useStore(selectSelected);

  useEffect(() => {
    if (isShot()) return;
    const s = useStore.getState();
    void s.boot();
    return s.startRealtime();
  }, []);

  const setUi = useStore.getState().setUi;

  let body;
  if (call) {
    body = <Stage />;
  } else if (boot === 'idle' || boot === 'loading') {
    body = <Placeholder />;
  } else if (boot === 'error') {
    body = <Placeholder error />;
  } else {
    body = (
      <>
        <AppFrame>
          {employees.length === 0 ? <FirstRun /> : ui.view === 'team' ? <TeamView /> : selected ? <Conversation employeeId={selected.id} /> : null}
        </AppFrame>
        <HireDialog isOpen={ui.hireOpen} onOpenChange={(o) => setUi({ hireOpen: o })} />
        <SettingsDialog isOpen={ui.settingsOpen} onOpenChange={(o) => setUi({ settingsOpen: o })} />
        <SummonPicker isOpen={ui.summonOpen} onOpenChange={(o) => setUi({ summonOpen: o })} />
        {selected ? <ProfileDrawer employeeId={selected.id} isOpen={ui.profileOpen} onOpenChange={(o) => setUi({ profileOpen: o })} /> : null}
      </>
    );
  }

  return (
    <>
      {body}
      <ToastBridge />
    </>
  );
}
