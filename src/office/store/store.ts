import { DatabaseSync } from 'node:sqlite';
import type { ActivityStep, Approval, Employee, Message, PlanStep, Settings, Task } from '../../shared/index.ts';
import type { SyncTable, TeamData } from '../sync/types.ts';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    persona TEXT NOT NULL,
    permissions TEXT NOT NULL,
    state TEXT NOT NULL,
    state_detail TEXT NOT NULL,
    state_since_ms INTEGER NOT NULL,
    space_id TEXT,
    session_id TEXT,
    model TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    last_activity_ms INTEGER NOT NULL,
    screen_grant TEXT,
    desktop_since_ms INTEGER,
    pending_restart INTEGER NOT NULL DEFAULT 0,
    controlled_by_user INTEGER NOT NULL DEFAULT 0,
    created_ms INTEGER NOT NULL,
    cast_id TEXT,
    paused INTEGER NOT NULL DEFAULT 0,
    stuck_reason TEXT
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    from_who TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    task_id TEXT,
    created_ms INTEGER NOT NULL,
    seen_ms INTEGER
  );
  CREATE INDEX messages_thread ON messages(employee_id, created_ms);
  CREATE TABLE steps (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    task_id TEXT,
    sentence TEXT NOT NULL,
    status TEXT NOT NULL,
    started_ms INTEGER NOT NULL,
    ended_ms INTEGER,
    peer TEXT
  );
  CREATE INDEX steps_thread ON steps(employee_id, started_ms);
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    title TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    status TEXT NOT NULL,
    plan TEXT NOT NULL,
    outcome TEXT,
    assigned_ms INTEGER NOT NULL,
    finished_ms INTEGER,
    active_ms INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    num_turns INTEGER NOT NULL DEFAULT 0,
    trace_id TEXT
  );
  CREATE INDEX tasks_employee ON tasks(employee_id, assigned_ms);
  CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    task_id TEXT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    kind TEXT NOT NULL,
    screen_minutes REAL,
    status TEXT NOT NULL,
    created_ms INTEGER NOT NULL,
    resolved_ms INTEGER
  );
  CREATE INDEX approvals_employee ON approvals(employee_id, created_ms);
  CREATE TABLE usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    task_id TEXT,
    ts_ms INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL
  );
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_ms INTEGER NOT NULL
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_ms INTEGER NOT NULL,
    sent_ms INTEGER
  );
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

type Row = Record<string, unknown>;

/** Columns kept on the employee row beyond the Employee type. */
export interface EmployeeExtra {
  castId: string | null;
  paused: boolean;
  stuckReason: string | null;
}

function employeeFrom(r: Row): Employee {
  return {
    id: r.id as string,
    persona: JSON.parse(r.persona as string),
    permissions: JSON.parse(r.permissions as string),
    state: r.state as Employee['state'],
    stateDetail: r.state_detail as string,
    stateSinceMs: r.state_since_ms as number,
    spaceId: (r.space_id as string | null) ?? null,
    sessionId: (r.session_id as string | null) ?? null,
    model: r.model as string,
    unread: r.unread as number,
    lastActivityMs: r.last_activity_ms as number,
    screenGrant: r.screen_grant ? JSON.parse(r.screen_grant as string) : null,
    desktopSinceMs: (r.desktop_since_ms as number | null) ?? null,
    pendingRestart: !!r.pending_restart,
    controlledByUser: !!r.controlled_by_user,
    createdMs: r.created_ms as number,
  };
}

function messageFrom(r: Row): Message {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    from: r.from_who as Message['from'],
    kind: r.kind as Message['kind'],
    text: r.text as string,
    taskId: (r.task_id as string | null) ?? null,
    createdMs: r.created_ms as number,
    seenMs: (r.seen_ms as number | null) ?? null,
  };
}

function stepFrom(r: Row): ActivityStep {
  const s: ActivityStep = {
    id: r.id as string,
    employeeId: r.employee_id as string,
    taskId: (r.task_id as string | null) ?? null,
    sentence: r.sentence as string,
    status: r.status as ActivityStep['status'],
    startedMs: r.started_ms as number,
    endedMs: (r.ended_ms as number | null) ?? null,
  };
  if (r.peer) s.peer = JSON.parse(r.peer as string);
  return s;
}

function taskFrom(r: Row): Task {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    title: r.title as string,
    assignedBy: r.assigned_by as string,
    status: r.status as Task['status'],
    plan: JSON.parse(r.plan as string) as PlanStep[],
    outcome: (r.outcome as string | null) ?? null,
    assignedMs: r.assigned_ms as number,
    finishedMs: (r.finished_ms as number | null) ?? null,
    activeMs: r.active_ms as number,
    costUsd: r.cost_usd as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    numTurns: r.num_turns as number,
    traceId: (r.trace_id as string | null) ?? null,
  };
}

function approvalFrom(r: Row): Approval {
  const a: Approval = {
    id: r.id as string,
    employeeId: r.employee_id as string,
    taskId: (r.task_id as string | null) ?? null,
    title: r.title as string,
    detail: r.detail as string,
    kind: r.kind as Approval['kind'],
    status: r.status as Approval['status'],
    createdMs: r.created_ms as number,
    resolvedMs: (r.resolved_ms as number | null) ?? null,
  };
  if (r.screen_minutes !== null && r.screen_minutes !== undefined) a.screenMinutes = r.screen_minutes as number;
  return a;
}

const EMPLOYEE_COLUMNS: Record<keyof Employee, [string, (v: never) => unknown]> = {
  id: ['id', (v) => v],
  persona: ['persona', (v) => JSON.stringify(v)],
  permissions: ['permissions', (v) => JSON.stringify(v)],
  state: ['state', (v) => v],
  stateDetail: ['state_detail', (v) => v],
  stateSinceMs: ['state_since_ms', (v) => v],
  spaceId: ['space_id', (v) => v],
  sessionId: ['session_id', (v) => v],
  model: ['model', (v) => v],
  unread: ['unread', (v) => v],
  lastActivityMs: ['last_activity_ms', (v) => v],
  screenGrant: ['screen_grant', (v) => (v ? JSON.stringify(v) : null)],
  desktopSinceMs: ['desktop_since_ms', (v) => v],
  pendingRestart: ['pending_restart', (v) => (v ? 1 : 0)],
  controlledByUser: ['controlled_by_user', (v) => (v ? 1 : 0)],
  createdMs: ['created_ms', (v) => v],
};

export class Store implements TeamData {
  readonly db: DatabaseSync;
  /** Set by the Office to feed the Databricks outbox (sync seam). Never throws into the store. */
  onWrite: ((table: SyncTable, row: unknown) => void) | null = null;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    // The wait comes first: right after a restart the previous office may still be closing this file, and without a
    // wait the very next statement fails with "database is locked" and the office never starts.
    this.db.exec('PRAGMA busy_timeout = 15000;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const v = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[i]);
        this.db.exec(`PRAGMA user_version = ${i + 1}`);
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  private notify(table: SyncTable, row: unknown): void {
    try {
      this.onWrite?.(table, row);
    } catch {
      /* the sync seam must never break a write */
    }
  }

  private all(sql: string, ...args: (string | number | null)[]): Row[] {
    return this.db.prepare(sql).all(...args) as Row[];
  }
  private one(sql: string, ...args: (string | number | null)[]): Row | undefined {
    return this.db.prepare(sql).get(...args) as Row | undefined;
  }
  private run(sql: string, ...args: (string | number | null)[]): void {
    this.db.prepare(sql).run(...args);
  }

  // ---- employees

  insertEmployee(e: Employee, extra: Partial<EmployeeExtra> = {}): void {
    this.run(
      `INSERT INTO employees (id, persona, permissions, state, state_detail, state_since_ms, space_id, session_id, model, unread,
        last_activity_ms, screen_grant, desktop_since_ms, pending_restart, controlled_by_user, created_ms, cast_id, paused, stuck_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      e.id, JSON.stringify(e.persona), JSON.stringify(e.permissions), e.state, e.stateDetail, e.stateSinceMs, e.spaceId, e.sessionId,
      e.model, e.unread, e.lastActivityMs, e.screenGrant ? JSON.stringify(e.screenGrant) : null, e.desktopSinceMs,
      e.pendingRestart ? 1 : 0, e.controlledByUser ? 1 : 0, e.createdMs, extra.castId ?? null, extra.paused ? 1 : 0, extra.stuckReason ?? null,
    );
    this.notify('employees', e);
  }

  getEmployee(id: string): Employee | undefined {
    const r = this.one('SELECT * FROM employees WHERE id = ?', id);
    return r ? employeeFrom(r) : undefined;
  }

  listEmployees(): Employee[] {
    return this.all('SELECT * FROM employees ORDER BY created_ms').map(employeeFrom);
  }

  countEmployees(): number {
    return (this.one('SELECT COUNT(*) AS n FROM employees') as { n: number }).n;
  }

  updateEmployee(id: string, patch: Partial<Employee>): Employee {
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const col = EMPLOYEE_COLUMNS[k as keyof Employee];
      if (!col || k === 'id') continue;
      sets.push(`${col[0]} = ?`);
      args.push((col[1] as (v: unknown) => unknown)(v) as string | number | null);
    }
    if (sets.length) this.run(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, ...args, id);
    const e = this.getEmployee(id);
    if (!e) throw new Error(`No employee ${id}`);
    if (sets.length) this.notify('employees', e);
    return e;
  }

  getExtra(id: string): EmployeeExtra {
    const r = this.one('SELECT cast_id, paused, stuck_reason FROM employees WHERE id = ?', id);
    return {
      castId: (r?.cast_id as string | null) ?? null,
      paused: !!r?.paused,
      stuckReason: (r?.stuck_reason as string | null) ?? null,
    };
  }

  setExtra(id: string, patch: Partial<EmployeeExtra>): void {
    if (patch.paused !== undefined) this.run('UPDATE employees SET paused = ? WHERE id = ?', patch.paused ? 1 : 0, id);
    if (patch.stuckReason !== undefined) this.run('UPDATE employees SET stuck_reason = ? WHERE id = ?', patch.stuckReason, id);
    if (patch.castId !== undefined) this.run('UPDATE employees SET cast_id = ? WHERE id = ?', patch.castId, id);
  }

  castIdsInUse(): string[] {
    return this.all('SELECT cast_id FROM employees WHERE cast_id IS NOT NULL').map((r) => r.cast_id as string);
  }

  /** Removes the employee and everything in its thread (tasks included; usage rows are kept for the mirror). */
  deleteEmployee(id: string): void {
    for (const t of ['messages', 'steps', 'tasks', 'approvals', 'notes']) this.run(`DELETE FROM ${t} WHERE employee_id = ?`, id);
    this.run('DELETE FROM employees WHERE id = ?', id);
    this.run('DELETE FROM kv WHERE key LIKE ?', `%:${id}`);
  }

  // ---- messages

  insertMessage(m: Message): void {
    this.run(
      'INSERT INTO messages (id, employee_id, from_who, kind, text, task_id, created_ms, seen_ms) VALUES (?,?,?,?,?,?,?,?)',
      m.id, m.employeeId, m.from, m.kind, m.text, m.taskId, m.createdMs, m.seenMs,
    );
    this.notify('messages', m);
  }

  getMessage(id: string): Message | undefined {
    const r = this.one('SELECT * FROM messages WHERE id = ?', id);
    return r ? messageFrom(r) : undefined;
  }

  /** Newest page first: the `limit` newest messages older than `before`, returned oldest first. */
  listMessages(employeeId: string, opts: { before?: number; limit?: number } = {}): Message[] {
    const limit = opts.limit ?? 50;
    const rows = this.all(
      'SELECT * FROM messages WHERE employee_id = ? AND created_ms < ? ORDER BY created_ms DESC, rowid DESC LIMIT ?',
      employeeId, opts.before ?? Number.MAX_SAFE_INTEGER, limit,
    );
    return rows.map(messageFrom).reverse();
  }

  lastMessage(employeeId: string, from?: Message['from']): Message | undefined {
    const r = from
      ? this.one('SELECT * FROM messages WHERE employee_id = ? AND from_who = ? ORDER BY created_ms DESC, rowid DESC LIMIT 1', employeeId, from)
      : this.one('SELECT * FROM messages WHERE employee_id = ? ORDER BY created_ms DESC, rowid DESC LIMIT 1', employeeId);
    return r ? messageFrom(r) : undefined;
  }

  /** Marks the user's unseen messages seen and returns them. */
  markSeen(employeeId: string, seenMs: number): Message[] {
    const rows = this.all("SELECT * FROM messages WHERE employee_id = ? AND from_who = 'user' AND seen_ms IS NULL", employeeId);
    if (rows.length) this.run("UPDATE messages SET seen_ms = ? WHERE employee_id = ? AND from_who = 'user' AND seen_ms IS NULL", seenMs, employeeId);
    return rows.map((r) => ({ ...messageFrom(r), seenMs }));
  }

  recentMessages(employeeId: string, n: number): Message[] {
    return this.all("SELECT * FROM messages WHERE employee_id = ? AND from_who != 'system' ORDER BY created_ms DESC, rowid DESC LIMIT ?", employeeId, n)
      .map(messageFrom)
      .reverse();
  }

  // ---- steps

  upsertStep(s: ActivityStep): void {
    this.run(
      `INSERT INTO steps (id, employee_id, task_id, sentence, status, started_ms, ended_ms, peer) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id, sentence=excluded.sentence, status=excluded.status, ended_ms=excluded.ended_ms, peer=excluded.peer`,
      s.id, s.employeeId, s.taskId, s.sentence, s.status, s.startedMs, s.endedMs, s.peer ? JSON.stringify(s.peer) : null,
    );
    this.notify('steps', s);
  }

  getStep(id: string): ActivityStep | undefined {
    const r = this.one('SELECT * FROM steps WHERE id = ?', id);
    return r ? stepFrom(r) : undefined;
  }

  /** Steps with startedMs in [fromMs, toMs), oldest first. */
  listSteps(employeeId: string, fromMs: number, toMs: number): ActivityStep[] {
    return this.all('SELECT * FROM steps WHERE employee_id = ? AND started_ms >= ? AND started_ms < ? ORDER BY started_ms, rowid', employeeId, fromMs, toMs).map(stepFrom);
  }

  recentSteps(employeeId: string, n: number): ActivityStep[] {
    return this.all('SELECT * FROM steps WHERE employee_id = ? ORDER BY started_ms DESC, rowid DESC LIMIT ?', employeeId, n).map(stepFrom).reverse();
  }

  runningSteps(): ActivityStep[] {
    return this.all("SELECT * FROM steps WHERE status = 'running'").map(stepFrom);
  }

  // ---- tasks

  upsertTask(t: Task): void {
    this.run(
      `INSERT INTO tasks (id, employee_id, title, assigned_by, status, plan, outcome, assigned_ms, finished_ms, active_ms, cost_usd, input_tokens, output_tokens, num_turns, trace_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, plan=excluded.plan, outcome=excluded.outcome, finished_ms=excluded.finished_ms,
         active_ms=excluded.active_ms, cost_usd=excluded.cost_usd, input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens, num_turns=excluded.num_turns, trace_id=excluded.trace_id`,
      t.id, t.employeeId, t.title, t.assignedBy, t.status, JSON.stringify(t.plan), t.outcome, t.assignedMs, t.finishedMs, t.activeMs,
      t.costUsd, t.inputTokens, t.outputTokens, t.numTurns, t.traceId,
    );
    this.notify('tasks', t);
  }

  getTask(id: string): Task | undefined {
    const r = this.one('SELECT * FROM tasks WHERE id = ?', id);
    return r ? taskFrom(r) : undefined;
  }

  openTask(employeeId: string): Task | undefined {
    const r = this.one("SELECT * FROM tasks WHERE employee_id = ? AND status IN ('running','blocked') ORDER BY assigned_ms DESC LIMIT 1", employeeId);
    return r ? taskFrom(r) : undefined;
  }

  latestTask(employeeId: string): Task | undefined {
    const r = this.one('SELECT * FROM tasks WHERE employee_id = ? ORDER BY assigned_ms DESC, rowid DESC LIMIT 1', employeeId);
    return r ? taskFrom(r) : undefined;
  }

  listTasksInRange(startMs: number, endMs: number): Task[] {
    return this.all('SELECT * FROM tasks WHERE COALESCE(finished_ms, assigned_ms) >= ? AND COALESCE(finished_ms, assigned_ms) < ?', startMs, endMs).map(taskFrom);
  }

  usageWithoutTask(startMs: number, endMs: number): { employeeId: string; costUsd: number }[] {
    return this.all(
      'SELECT employee_id, SUM(cost_usd) AS cost FROM usage WHERE task_id IS NULL AND ts_ms >= ? AND ts_ms < ? GROUP BY employee_id', startMs, endMs,
    ).map((r) => ({ employeeId: r.employee_id as string, costUsd: r.cost as number }));
  }

  // ---- approvals

  insertApproval(a: Approval): void {
    this.run(
      'INSERT INTO approvals (id, employee_id, task_id, title, detail, kind, screen_minutes, status, created_ms, resolved_ms) VALUES (?,?,?,?,?,?,?,?,?,?)',
      a.id, a.employeeId, a.taskId, a.title, a.detail, a.kind, a.screenMinutes ?? null, a.status, a.createdMs, a.resolvedMs,
    );
  }

  updateApproval(id: string, status: Approval['status'], resolvedMs: number): Approval {
    this.run('UPDATE approvals SET status = ?, resolved_ms = ? WHERE id = ?', status, resolvedMs, id);
    return this.getApproval(id)!;
  }

  getApproval(id: string): Approval | undefined {
    const r = this.one('SELECT * FROM approvals WHERE id = ?', id);
    return r ? approvalFrom(r) : undefined;
  }

  pendingApprovals(employeeId?: string): Approval[] {
    const rows = employeeId
      ? this.all("SELECT * FROM approvals WHERE status = 'pending' AND employee_id = ? ORDER BY created_ms", employeeId)
      : this.all("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_ms");
    return rows.map(approvalFrom);
  }

  listApprovals(employeeId: string, fromMs: number, toMs: number): Approval[] {
    return this.all('SELECT * FROM approvals WHERE employee_id = ? AND created_ms >= ? AND created_ms < ? ORDER BY created_ms, rowid', employeeId, fromMs, toMs).map(approvalFrom);
  }

  // ---- usage and notes

  addUsage(u: { employeeId: string; taskId: string | null; tsMs: number; costUsd: number; inputTokens: number; outputTokens: number }): void {
    this.run('INSERT INTO usage (employee_id, task_id, ts_ms, cost_usd, input_tokens, output_tokens) VALUES (?,?,?,?,?,?)',
      u.employeeId, u.taskId, u.tsMs, u.costUsd, u.inputTokens, u.outputTokens);
    this.notify('usage', u);
  }

  addNote(employeeId: string, text: string, createdMs: number): void {
    this.run('INSERT INTO notes (employee_id, text, created_ms) VALUES (?,?,?)', employeeId, text, createdMs);
  }

  /** Newest last, at most `limit`. */
  listNotes(employeeId: string, limit: number): string[] {
    return this.all('SELECT text FROM notes WHERE employee_id = ? ORDER BY id DESC LIMIT ?', employeeId, limit)
      .map((r) => r.text as string)
      .reverse();
  }

  // ---- settings and kv

  getSettings(defaults: Settings): Settings {
    const out: Record<string, unknown> = { ...defaults };
    for (const r of this.all('SELECT key, value FROM settings')) out[r.key as string] = JSON.parse(r.value as string);
    return out as unknown as Settings;
  }

  patchSettings(patch: Partial<Settings>): void {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
    }
  }

  kvGet(key: string): string | undefined {
    return this.one('SELECT value FROM kv WHERE key = ?', key)?.value as string | undefined;
  }

  kvSet(key: string, value: string): void {
    this.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  // ---- crash repair (contracts section 6)

  /** Every pending approval becomes expired and every running step is closed. Returns what changed. */
  repairAfterCrash(nowMs: number): { expired: Approval[]; closedSteps: ActivityStep[] } {
    const expired = this.pendingApprovals().map((a) => this.updateApproval(a.id, 'expired', nowMs));
    const closedSteps = this.runningSteps().map((s) => {
      const closed: ActivityStep = { ...s, status: 'ok', endedMs: nowMs };
      this.upsertStep(closed);
      return closed;
    });
    return { expired, closedSteps };
  }
}
