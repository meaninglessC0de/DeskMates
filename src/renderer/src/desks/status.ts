/**
 * What a desk tile says about its person, in plain words: the state, then what they are doing now. Pure, so it can be
 * tested without a window. The words come from the latest step, the pending approval, the task or the state detail.
 */
import type { ActivityStep, Approval, Employee, Task } from '../../../shared';

export interface DeskStatus {
  /** "Working", "Needs you", "Done", "Idle"... null when the detail says it all ("Waiting for Priya"). */
  word: string | null;
  /** What they are doing now; null when there is nothing to add. */
  detail: string | null;
  /** `attention` only for a real needs-you. */
  tone: 'attention' | 'normal';
  /** "3 of 5" while a plan is in progress, otherwise null. */
  progress: string | null;
}

export interface DeskSlice {
  steps: ActivityStep[];
  approvals: Approval[];
  task: Task | null;
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').split('\n')[0]?.trim() ?? '';
  return t ? t : null;
};

export function latestStep(steps: ActivityStep[]): ActivityStep | null {
  let best: ActivityStep | null = null;
  for (const s of steps) if (!best || s.startedMs >= best.startedMs) best = s;
  return best;
}

export function pendingApproval(approvals: Approval[]): Approval | null {
  let best: Approval | null = null;
  for (const a of approvals) if (a.status === 'pending' && (!best || a.createdMs >= best.createdMs)) best = a;
  return best;
}

export function planProgress(task: Task | null): string | null {
  if (!task || task.plan.length === 0) return null;
  if (task.status !== 'running' && task.status !== 'blocked') return null;
  return `${task.plan.filter((p) => p.status === 'done').length} of ${task.plan.length}`;
}

export function deskStatus(e: Employee, slice: DeskSlice | undefined): DeskStatus {
  const steps = slice?.steps ?? [];
  const task = slice?.task ?? null;
  const detail = clean(e.stateDetail);
  const progress = planProgress(task);
  const base = { tone: 'normal' as const, progress };
  switch (e.state) {
    case 'needs_you': {
      const a = pendingApproval(slice?.approvals ?? []);
      return { word: 'Needs you', detail: clean(a?.title) ?? detail, tone: 'attention', progress };
    }
    case 'working': {
      if (detail && /^waiting\b/i.test(detail)) return { ...base, word: null, detail };
      return { ...base, word: 'Working', detail: clean(latestStep(steps)?.sentence) ?? detail };
    }
    case 'stuck':
      return { ...base, word: 'Stuck', detail };
    case 'paused':
      return { ...base, word: 'Paused', detail: detail && !/^paused$/i.test(detail) ? detail : null };
    case 'on_call':
      return { ...base, word: 'On a call', detail: null };
    case 'starting':
      return { ...base, word: 'Starting', detail: null };
    case 'offline':
      return { ...base, word: 'Offline', detail: null };
    case 'idle':
      if (task?.status === 'done') return { ...base, word: 'Done', detail: null };
      return { ...base, word: 'Idle', detail: null };
  }
}
