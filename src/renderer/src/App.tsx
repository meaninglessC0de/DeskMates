import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { VStack } from '@astryxdesign/core/VStack';
import { SideNav } from '@astryxdesign/core/SideNav';
import { useToast } from '@astryxdesign/core/Toast';
import { useStore, selectSelected } from './api/store';
import { getShot, isShot } from './fixtures/shot';
import { loadShot } from './fixtures/load';
import { startShellBridge } from './api/shellBridge';
import { AppFrame } from './shell/AppFrame';
import { applyShotState } from './shell/shotState';
import { FirstRun } from './shell/FirstRun';
import { Conversation } from './thread/Conversation';
import { TeamView } from './team/TeamView';
import { DesksView } from './desks/DesksView';
import { HireDialog } from './hire/HireDialog';
import { ProfileDrawer } from './profile/ProfileDrawer';
import { SettingsDialog } from './settings/SettingsDialog';
import { Stage } from './stage/Stage';
import { SummonPicker } from './stage/SummonPicker';
import { DeskLoader } from './ui/DeskLoader';

/** How long the stage stays mounted after a call ends, so it can cross-fade out (the stage's 240 ms entrance, mirrored). */
const STAGE_LEAVE_MS = 240;

/**
 * True while the stage should still be on screen: the call is live, or it ended less than STAGE_LEAVE_MS ago.
 * `leaving` is the second part, exposed to the stage's CSS as `data-am-leaving` on `[data-am-stage-root]`.
 */
function useStageLeave(live: boolean): { mounted: boolean; leaving: boolean } {
  const [leaving, setLeaving] = useState(false);
  const was = useRef(live);
  useEffect(() => {
    if (was.current && !live) {
      setLeaving(true);
      const t = setTimeout(() => setLeaving(false), STAGE_LEAVE_MS);
      was.current = live;
      return () => clearTimeout(t);
    }
    was.current = live;
    setLeaving(false);
    return undefined;
  }, [live]);
  return { mounted: live || leaving, leaving: leaving && !live };
}

/** Called once before the first render. In `?shot=` mode this loads the store from the fixtures. */
export function initApp(): void {
  startShellBridge(useStore);
  // The Mac shell's title-bar inset: lets app.ts place the sidebar header beside the traffic lights.
  if (typeof window !== 'undefined' && (window as { shell?: unknown }).shell && typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-am-electron', '');
  }
  const shot = getShot();
  if (shot) {
    loadShot(shot);
    applyShotState(shot);
  }
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
            data-am-banner=""
            title="Can't reach your team"
            description="Deskmates keeps trying. You can also try now."
            container="section"
            endContent={<Button label="Try again" variant="secondary" onClick={() => void useStore.getState().boot()} />}
          />
        ) : undefined
      }
      sideNav={<SideNav aria-label="Team">{null}</SideNav>}>
      <Center height="100%">{error ? null : <DeskLoader size={48} label="Opening Deskmates" />}</Center>
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
  const stage = useStageLeave(Boolean(call));
  const stageNode = stage.mounted ? (
    <VStack data-am-stage-root="" data-am-leaving={stage.leaving ? '' : undefined} height="100%">
      <Stage />
    </VStack>
  ) : null;

  let body;
  if (call) {
    body = null;
  } else if (boot === 'idle' || boot === 'loading') {
    body = <Placeholder />;
  } else if (boot === 'error') {
    body = <Placeholder error />;
  } else {
    body = (
      <>
        {ui.view === 'desks' ? (
          <DesksView />
        ) : (
          <AppFrame>
            {employees.length === 0 ? <FirstRun /> : ui.view === 'team' ? <TeamView /> : selected ? <Conversation key={selected.id} employeeId={selected.id} /> : null}
          </AppFrame>
        )}
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
      {stageNode}
      <ToastBridge />
    </>
  );
}
