import { useStore } from '../api/store';
import { emptyThread } from '../api/reducer';
import type { Employee } from '../../../shared';
import type { ShotRef } from '../fixtures/shot';

const MIN = 60_000;

const DETAIL: Partial<Record<Employee['state'], string>> = {
  stuck: "Staging site won't load",
  offline: 'Desktop is off',
  paused: 'Paused by you',
  on_call: 'On a call with you',
  starting: 'Starting desktop',
  working: 'Fixing the checkout bug',
};

/**
 * Screenshot-only refinements on top of fixtures/load.ts, read from the shot's query string:
 *   as=stuck|offline|paused|on_call|starting|working|idle   state of the selected employee
 *   control=1        the user has taken control of the desktop
 *   lent=1|forever   the selected employee holds the user's screen (8:42 left, or until stopped)
 *   myscreen=1       the "Can use my screen" permission is on
 *   typing=1         the selected employee is composing a reply
 *   approval=approved|denied   resolve the pending approval
 *   plan=none        no plan on the task
 * Other params (`expand=1`, `popover=lend`, `screen=connecting|error`) are read where they apply.
 */
export function applyShotState(shot: ShotRef): void {
  const p = shot.params;
  const st = useStore.getState();
  const id = st.ui.selectedId;
  if (!id) return;

  const as = p.get('as') as Employee['state'] | null;
  const control = p.get('control') === '1';
  const lent = p.get('lent');
  const employees = st.employees.map((e) => {
    if (e.id !== id) return e;
    let next: Employee = e;
    if (as) next = { ...next, state: as, stateDetail: DETAIL[as] ?? next.persona.role, desktopSinceMs: as === 'offline' ? null : next.desktopSinceMs };
    if (control) next = { ...next, state: 'paused', stateDetail: 'Waiting for you', controlledByUser: true };
    if (lent) next = { ...next, permissions: { ...next.permissions, myScreen: true }, screenGrant: { untilMs: lent === 'forever' ? null : Date.now() + 8 * MIN + 42_000 } };
    if (p.get('myscreen') === '1') next = { ...next, permissions: { ...next.permissions, myScreen: true } };
    return next;
  });

  const slice = st.threads[id] ?? emptyThread();
  const decision = p.get('approval');
  const threads = {
    ...st.threads,
    [id]: {
      ...slice,
      typing: p.get('typing') === '1' ? true : slice.typing,
      approvals: decision
        ? slice.approvals.map((a) => (a.status === 'pending' ? { ...a, status: decision === 'denied' ? ('denied' as const) : ('approved' as const), resolvedMs: Date.now() } : a))
        : slice.approvals,
      task: p.get('plan') === 'none' && slice.task ? { ...slice.task, plan: [] } : slice.task,
    },
  };
  st.setData({ employees, threads });
}
