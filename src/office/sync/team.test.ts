import { describe, expect, it } from 'vitest';
import type { Employee, Task } from '../../shared/index.ts';
import { Store } from '../store/store.ts';
import { computeTeamReport, periodFor } from './team.ts';

const DAY = 86_400_000;
// 14 Nov 2026, 15:00 local
const NOW = new Date(2026, 10, 14, 15, 0, 0).getTime();
const MIDNIGHT = new Date(2026, 10, 14, 0, 0, 0).getTime();

function emp(id: string, name: string): Employee {
  return {
    id,
    persona: { name, firstName: name.split(' ')[0], role: 'Role', roleKey: 'x', personality: '', workingStyle: '', starters: [], portraitUrl: '/media/portraits/x.jpg', voice: { provider: 'livekit', voiceId: '', label: '', sampleUrl: null }, avatarId: null },
    permissions: { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true },
    state: 'idle', stateDetail: '', stateSinceMs: 0, spaceId: null, sessionId: null, model: 'm', unread: 0, lastActivityMs: 42, screenGrant: null,
    desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: 0,
  };
}

let n = 0;
function task(employeeId: string, finishedMs: number, over: Partial<Task> = {}): Task {
  return { id: `t${++n}`, employeeId, title: 't', assignedBy: 'user', status: 'done', plan: [], outcome: null, assignedMs: finishedMs - 600_000, finishedMs, activeMs: 600_000, costUsd: 0.25, inputTokens: 0, outputTokens: 0, numTurns: 1, traceId: null, ...over };
}

describe('team report', () => {
  it('computes the periods', () => {
    const t = periodFor('today', NOW);
    expect(t).toEqual({ startMs: MIDNIGHT, endMs: MIDNIGHT + DAY, previousStartMs: MIDNIGHT - DAY, previousEndMs: MIDNIGHT });
    const w = periodFor('week', NOW);
    expect(w.startMs).toBe(MIDNIGHT - 6 * DAY);
    expect(w.previousEndMs).toBe(w.startMs);
    expect(w.previousEndMs - w.previousStartMs).toBe(7 * DAY);
    expect(periodFor('month', NOW).startMs).toBe(MIDNIGHT - 29 * DAY);
  });

  it('sums per person, counts done and failed, and fills previous', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('a', 'Maya Okafor'));
    s.insertEmployee(emp('b', 'Priya Raman'));
    s.upsertTask(task('a', NOW - 3_600_000));                                              // today
    s.upsertTask(task('a', NOW - 2 * 3_600_000, { costUsd: 0.75, activeMs: 1_200_000 }));  // today
    s.upsertTask(task('b', NOW - 3_600_000, { status: 'failed', costUsd: 0.5 }));          // today, failed
    s.upsertTask(task('a', MIDNIGHT - 3_600_000));                                         // yesterday
    s.upsertTask(task('b', MIDNIGHT - 3 * DAY));                                           // 3 days ago: week yes, today no
    s.upsertTask(task('b', MIDNIGHT - 10 * DAY));                                          // 10 days ago: previous week
    s.upsertTask(task('b', MIDNIGHT - 40 * DAY));                                          // 40 days ago: previous month

    const today = computeTeamReport(s, 'today', NOW);
    expect(today.source).toBe('local');
    expect(today.syncedMs).toBeNull();
    expect(today.rows.map((r) => r.name)).toEqual(['Maya Okafor', 'Priya Raman']);
    expect(today.rows[0]).toMatchObject({ employeeId: 'a', tasksDone: 2, tasksFailed: 0, activeMs: 1_800_000, costUsd: 1, lastActivityMs: 42, portraitUrl: '/media/portraits/x.jpg' });
    expect(today.rows[1]).toMatchObject({ tasksDone: 0, tasksFailed: 1, costUsd: 0.5 });
    expect(today.totals).toEqual({ activeMs: 2_400_000, tasksDone: 2, costUsd: 1.5 });
    expect(today.previous).toEqual({ activeMs: 600_000, tasksDone: 1, costUsd: 0.25 });

    const week = computeTeamReport(s, 'week', NOW);
    expect(week.totals.tasksDone).toBe(4);
    expect(week.previous).toMatchObject({ tasksDone: 1 });

    const month = computeTeamReport(s, 'month', NOW);
    expect(month.totals.tasksDone).toBe(5);
    expect(month.previous).toMatchObject({ tasksDone: 1 });
  });

  it('gives previous as null when the period before has no work, and lists people with no work', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('a', 'Maya Okafor'));
    s.insertEmployee(emp('b', 'Priya Raman'));
    s.upsertTask(task('a', NOW - 3_600_000));
    const r = computeTeamReport(s, 'today', NOW);
    expect(r.previous).toBeNull();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ employeeId: 'b', activeMs: 0, tasksDone: 0, costUsd: 0 });
  });

  it('ignores work of people who are no longer on the team', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('a', 'Maya Okafor'));
    s.upsertTask(task('gone', NOW - 3_600_000));
    expect(computeTeamReport(s, 'today', NOW).totals.tasksDone).toBe(0);
  });
});
