import type { Employee, EmployeeState } from '../../../shared';

export const STATE_LABEL: Record<EmployeeState, string> = {
  idle: 'Idle',
  working: 'Working',
  needs_you: 'Needs you',
  on_call: 'On a call',
  paused: 'Paused',
  stuck: 'Stuck',
  offline: 'Offline',
  starting: 'Starting',
};

export type Presence =
  | { kind: 'none' }
  | { kind: 'spinner' }
  | { kind: 'dot'; variant: 'success' | 'neutral' | 'error' | 'warning' | 'accent'; label: string };

/** Presence dot for UX spec 2.2: one dot per state, colour only for working, needs you and stuck. */
export function presenceOf(state: EmployeeState): Presence {
  switch (state) {
    case 'working':
      return { kind: 'dot', variant: 'success', label: STATE_LABEL.working };
    case 'needs_you':
      return { kind: 'dot', variant: 'warning', label: STATE_LABEL.needs_you };
    case 'stuck':
      return { kind: 'dot', variant: 'error', label: STATE_LABEL.stuck };
    case 'on_call':
      return { kind: 'dot', variant: 'accent', label: STATE_LABEL.on_call };
    case 'paused':
      return { kind: 'dot', variant: 'neutral', label: STATE_LABEL.paused };
    case 'idle':
      return { kind: 'dot', variant: 'neutral', label: STATE_LABEL.idle };
    case 'starting':
      return { kind: 'spinner' };
    case 'offline':
      return { kind: 'none' };
  }
}

/** The sidebar's second line. `emphasised` means primary text colour (only needs you and stuck). */
export function rowLine(e: Pick<Employee, 'state' | 'stateDetail' | 'persona'>): { text: string; emphasised: boolean } {
  switch (e.state) {
    case 'needs_you':
    case 'stuck':
      return { text: e.stateDetail || STATE_LABEL[e.state], emphasised: true };
    case 'offline':
      return { text: e.stateDetail || 'Desktop is off', emphasised: false };
    case 'starting':
      return { text: 'Starting desktop', emphasised: false };
    case 'on_call':
      return { text: e.stateDetail || 'On a call with you', emphasised: false };
    case 'paused':
      return { text: e.stateDetail || 'Paused by you', emphasised: false };
    case 'working':
      return { text: e.stateDetail || 'Working', emphasised: false };
    case 'idle':
      return { text: e.stateDetail || e.persona.role, emphasised: false };
  }
}

/** The top bar's second line, as parts so the caller can put a live `Elapsed` where `timer` is true. */
export function topBarLine(e: Pick<Employee, 'state' | 'persona'>): { prefix: string; timer: boolean } {
  const role = e.persona.role;
  switch (e.state) {
    case 'working':
      return { prefix: `${role} · Working · `, timer: true };
    case 'starting':
      return { prefix: `${role} · Starting desktop`, timer: false };
    default:
      return { prefix: `${role} · ${STATE_LABEL[e.state]}`, timer: false };
  }
}
