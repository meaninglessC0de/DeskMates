import type { ActivityStep, Approval, Message } from '../../../shared';
import type { ThreadSlice } from '../api/reducer';

/** Steps further apart than this start a new activity group. */
export const GROUP_GAP_MS = 20 * 60_000;

export interface ActivityGroup {
  key: string;
  steps: ActivityStep[];
  running: boolean;
  /** The sentence of the newest step, shown while running. */
  latest: string;
  startedMs: number;
  /** Sum of the steps' own durations (running steps count up to `now`). */
  workedMs: number;
}

export type EmployeePart =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'activity'; key: string; group: ActivityGroup }
  | { kind: 'approval'; key: string; approval: Approval };

export type TimelineItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'system'; key: string; message: Message }
  | { kind: 'user'; key: string; messages: Message[] }
  | { kind: 'employee'; key: string; parts: EmployeePart[] };

const DAY = 86_400_000;
const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "Today", "Yesterday", the weekday for the last week, then the date. */
export function dayLabel(ms: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(ms);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(ms);
}

/** "40 sec", "6 min", "1 h 5 min". */
export function formatWorked(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec} sec`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

type Raw =
  | { t: number; order: number; kind: 'message'; message: Message }
  | { t: number; order: number; kind: 'step'; step: ActivityStep }
  | { t: number; order: number; kind: 'approval'; approval: Approval };

function groupOf(steps: ActivityStep[], now: number): ActivityGroup {
  const running = steps.some((s) => s.status === 'running');
  const newest = [...steps].sort((a, b) => b.startedMs - a.startedMs)[0]!;
  return {
    key: `act-${steps[0]!.id}`,
    steps,
    running,
    latest: running ? [...steps].reverse().find((s) => s.status === 'running')!.sentence : newest.sentence,
    startedMs: steps[0]!.startedMs,
    workedMs: steps.reduce((sum, s) => sum + Math.max(0, (s.endedMs ?? now) - s.startedMs), 0),
  };
}

/**
 * Turn a thread slice into what the conversation renders.
 *
 * - Runs: consecutive messages from one side share one avatar; an employee run also holds that
 *   employee's activity groups and approval rows.
 * - Activity: the steps since the last boundary (your message, an approval, a system line, a new day,
 *   or a 20 minute gap) are one group, shown where its newest step is, so it sits just above the
 *   reply it led to and a running group is always at the bottom.
 * - Day dividers sit before the first item of each day.
 */
export function buildTimeline(slice: Pick<ThreadSlice, 'messages' | 'steps' | 'approvals'>, now: number): TimelineItem[] {
  const raw: Raw[] = [
    ...slice.messages.map((message): Raw => ({ t: message.createdMs, order: 0, kind: 'message', message })),
    ...slice.steps.map((step): Raw => ({ t: step.startedMs, order: 1, kind: 'step', step })),
    ...slice.approvals.map((approval): Raw => ({ t: approval.createdMs, order: 2, kind: 'approval', approval })),
  ].sort((a, b) => a.t - b.t || a.order - b.order);

  const items: TimelineItem[] = [];
  let lastDay = Number.NaN;
  let pendingSteps: ActivityStep[] = [];
  let pendingIndex = -1; // index in the current employee run's parts where the group sits

  const run = (): Extract<TimelineItem, { kind: 'employee' }> => {
    const last = items[items.length - 1];
    if (last && last.kind === 'employee') return last;
    const next: TimelineItem = { kind: 'employee', key: `emp-${items.length}`, parts: [] };
    items.push(next);
    pendingIndex = -1;
    return next;
  };
  const boundary = (): void => {
    pendingSteps = [];
    pendingIndex = -1;
  };
  const day = (t: number): void => {
    const d = startOfDay(t);
    if (d !== lastDay) {
      lastDay = d;
      boundary();
      items.push({ kind: 'day', key: `day-${d}`, label: dayLabel(t, now) });
    }
  };

  for (const r of raw) {
    day(r.t);
    if (r.kind === 'message') {
      const m = r.message;
      if (m.from === 'system' || m.kind === 'system') {
        boundary();
        items.push({ kind: 'system', key: m.id, message: m });
      } else if (m.from === 'user') {
        boundary();
        const last = items[items.length - 1];
        if (last && last.kind === 'user') last.messages.push(m);
        else items.push({ kind: 'user', key: `usr-${m.id}`, messages: [m] });
      } else {
        run().parts.push({ kind: 'message', key: m.id, message: m });
      }
    } else if (r.kind === 'approval') {
      boundary();
      run().parts.push({ kind: 'approval', key: r.approval.id, approval: r.approval });
    } else {
      const s = r.step;
      const prev = pendingSteps[pendingSteps.length - 1];
      if (prev && s.startedMs - (prev.endedMs ?? prev.startedMs) > GROUP_GAP_MS) boundary();
      const target = run();
      pendingSteps = [...pendingSteps, s];
      const part: EmployeePart = { kind: 'activity', key: `act-${pendingSteps[0]!.id}`, group: groupOf(pendingSteps, now) };
      if (pendingIndex >= 0) target.parts.splice(pendingIndex, 1);
      target.parts.push(part);
      pendingIndex = target.parts.length - 1;
    }
  }
  return items;
}

/** First, middle and last for each stretch of consecutive text bubbles in an employee run. */
export function bubbleGroups(parts: EmployeePart[]): (undefined | 'first' | 'middle' | 'last')[] {
  return parts.map((p, i) => {
    if (p.kind !== 'message') return undefined;
    const before = parts[i - 1]?.kind === 'message';
    const after = parts[i + 1]?.kind === 'message';
    if (before && after) return 'middle';
    if (after) return 'first';
    if (before) return 'last';
    return undefined;
  });
}
