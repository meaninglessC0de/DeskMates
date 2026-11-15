import type { StoreApi } from 'zustand';
import type { Employee } from '../../../shared';
import { STATE_LABEL } from '../shell/presence';
import type { Store } from './store';

/** Everything here is a no-op in a plain browser, where `window.shell` is undefined. */
const shell = () => (typeof window === 'undefined' ? undefined : window.shell);

export const trayRows = (employees: Employee[]): { id: string; name: string; state: string }[] =>
  employees.map((e) => ({ id: e.id, name: e.persona.name, state: STATE_LABEL[e.state] }));

/** First name of whoever holds the user's screen, or null. */
export const lentTo = (employees: Employee[]): string | null => employees.find((e) => e.screenGrant)?.persona.firstName ?? null;

/** Dock badge: people in needs_you or stuck. */
export const badgeCount = (employees: Employee[]): number => employees.filter((e) => e.state === 'needs_you' || e.state === 'stuck').length;

export function notifyShell(n: { employeeId: string; title: string; body: string; portraitUrl: string }): void {
  shell()?.notify(n);
}

/** Ask for the microphone before a call or meeting starts. The stage shows the blocked state itself. */
export async function prepareCall(): Promise<void> {
  try {
    await shell()?.askMicrophone();
  } catch {
    // ignored: the stage reports a blocked microphone
  }
}

/**
 * Drive the Mac shell from the store: tray rows and Dock badge on every change to the employees,
 * and the notification click and tray menu actions. Call once at app start.
 */
export function startShellBridge(store: Pick<StoreApi<Store>, 'getState' | 'subscribe'>): () => void {
  const bridge = shell();
  if (!bridge) return () => undefined;
  let active = true;
  let last = '';

  const push = (): void => {
    const { employees } = store.getState();
    const rows = trayRows(employees);
    const lent = lentTo(employees);
    const badge = badgeCount(employees);
    const key = JSON.stringify([rows, lent, badge]);
    if (key === last) return;
    last = key;
    bridge.setTray(rows, lent);
    bridge.setBadge(badge);
  };

  bridge.onNotificationClick((employeeId) => {
    if (active) void store.getState().selectEmployee(employeeId);
  });

  bridge.onTrayAction((a) => {
    if (!active) return;
    const s = store.getState();
    switch (a.type) {
      case 'open':
        void s.selectEmployee(a.employeeId);
        break;
      case 'summon':
        s.setUi({ summonOpen: true });
        break;
      case 'desks':
        s.openDesks();
        break;
      case 'hire':
        s.setUi({ hireOpen: true });
        break;
      case 'take_back': {
        const holder = s.employees.find((e) => e.screenGrant);
        if (holder) void s.revokeScreen(holder.id);
        break;
      }
      case 'pause_all':
        for (const e of s.employees) if (e.state !== 'paused' && e.state !== 'offline') void s.pauseEmployee(e.id);
        break;
      case 'resume_all':
        for (const e of s.employees) if (e.state === 'paused') void s.resumeEmployee(e.id);
        break;
    }
  });

  push();
  const unsubscribe = store.subscribe((s, prev) => {
    if (s.employees !== prev.employees) push();
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
