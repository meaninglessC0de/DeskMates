import type { TeamReport, TeamRow, Task } from '../../shared/index.ts';
import type { TeamData } from './types.ts';

const DAY = 86_400_000;

export interface Period {
  startMs: number;
  endMs: number;
  previousStartMs: number;
  previousEndMs: number;
}

/** today = since local midnight; week = the last 7 days including today; month = the last 30 days including today. */
export function periodFor(range: TeamReport['range'], now: number): Period {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const midnight = d.getTime();
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  const startMs = midnight - (days - 1) * DAY;
  const endMs = midnight + DAY;
  return { startMs, endMs, previousStartMs: startMs - days * DAY, previousEndMs: startMs };
}

function totalsOf(tasks: Task[]) {
  let activeMs = 0, tasksDone = 0, costUsd = 0;
  for (const t of tasks) {
    activeMs += t.activeMs;
    costUsd += t.costUsd;
    if (t.status === 'done') tasksDone++;
  }
  return { activeMs, tasksDone, costUsd };
}

/** The local team report, computed from SQLite. Final code: W8 wraps it with the warehouse path and keeps this signature. */
export function computeTeamReport(data: TeamData, range: TeamReport['range'], now: number = Date.now()): TeamReport {
  const p = periodFor(range, now);
  const tasks = data.listTasksInRange(p.startMs, p.endMs);
  const prevTasks = data.listTasksInRange(p.previousStartMs, p.previousEndMs);

  const chat = (from: number, to: number) => new Map((data.usageWithoutTask?.(from, to) ?? []).map((u) => [u.employeeId, u.costUsd]));
  const chatNow = chat(p.startMs, p.endMs);
  const chatPrev = chat(p.previousStartMs, p.previousEndMs);

  const rows: TeamRow[] = data.listEmployees().map((e) => {
    const mine = tasks.filter((t) => t.employeeId === e.id);
    const t = totalsOf(mine);
    t.costUsd += chatNow.get(e.id) ?? 0;
    return {
      employeeId: e.id,
      name: e.persona.name,
      role: e.persona.role,
      portraitUrl: e.persona.portraitUrl,
      activeMs: t.activeMs,
      tasksDone: t.tasksDone,
      tasksFailed: mine.filter((x) => x.status === 'failed').length,
      costUsd: t.costUsd,
      lastActivityMs: e.lastActivityMs,
    };
  });
  rows.sort((a, b) => b.activeMs - a.activeMs || b.tasksDone - a.tasksDone || a.name.localeCompare(b.name));

  const memberIds = new Set(rows.map((r) => r.employeeId));
  const mineTasks = tasks.filter((t) => memberIds.has(t.employeeId));
  const prevMine = prevTasks.filter((t) => memberIds.has(t.employeeId));

  const withChat = (totals: ReturnType<typeof totalsOf>, spend: Map<string, number>) => {
    for (const [id, c] of spend) if (memberIds.has(id)) totals.costUsd += c;
    return totals;
  };
  const prevChat = [...chatPrev.keys()].some((id) => memberIds.has(id));
  return {
    range,
    totals: withChat(totalsOf(mineTasks), chatNow),
    previous: prevMine.length > 0 || prevChat ? withChat(totalsOf(prevMine), chatPrev) : null,
    rows,
    source: 'local',
    syncedMs: null,
  };
}
