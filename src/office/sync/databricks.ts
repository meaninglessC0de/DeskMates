import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { TeamAskResponse, TeamReport, TeamRow } from '../../shared/index.ts';
import { CircuitBreaker } from './breaker.ts';
import { createGenieClient, type GenieClient } from './genie.ts';
import { DatabricksError, normaliseHost } from './http.ts';
import { createLocalSync } from './localSync.ts';
import { mapEmployee, mapMessage, mapRow, mapStep, mapTask, mapUsage, type Mapped } from './mapping.ts';
import { Outbox } from './outbox.ts';
import { buildMerge, checkLocation, ddl, TABLES, tableRef, type Location } from './sql.ts';
import { computeTeamReport, periodFor } from './team.ts';
import type { Sync, SyncDeps, SyncStatus, SyncTable } from './types.ts';
import { Warehouse, type StatementResult } from './warehouse.ts';

export interface Timing {
  flushIntervalMs: number;
  flushRows: number;
  maxRowsPerStatement: number;
  breakerOpenMs: number;
  /** Budget for the whole warehouse read of the team report. */
  reportBudgetMs: number;
  reportCacheMs: number;
  /** Longest wait for the last flush when the office stops. */
  stopFlushMs: number;
  dailyStatementCap: number;
  pollMs: number;
  requestTimeoutMs: number;
}

export const DEFAULT_TIMING: Timing = {
  flushIntervalMs: 30_000,
  flushRows: 200,
  maxRowsPerStatement: 500,
  breakerOpenMs: 300_000,
  reportBudgetMs: 8000,
  reportCacheMs: 60_000,
  stopFlushMs: 5000,
  dailyStatementCap: 1000,
  pollMs: 1500,
  requestTimeoutMs: 8000,
};

export interface DatabricksOptions {
  timing?: Partial<Timing>;
  now?: () => number;
  fetch?: typeof fetch;
}

const REPORT_SQL = (loc: Location) => `SELECT employee_id,
  CASE WHEN COALESCE(finished_ms, assigned_ms) >= :start_ms THEN 'cur' ELSE 'prev' END AS period,
  COUNT(*) AS tasks,
  SUM(active_ms) AS active_ms,
  SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS tasks_done,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS tasks_failed,
  SUM(cost_usd) AS cost_usd
FROM ${tableRef(loc, 'tasks')}
WHERE COALESCE(finished_ms, assigned_ms) >= :prev_start_ms AND COALESCE(finished_ms, assigned_ms) < :end_ms
GROUP BY 1, 2`;

function storeDb(deps: SyncDeps): DatabaseSync | null {
  if (deps.db) return deps.db;
  const d = (deps.data as { db?: DatabaseSync }).db;
  return d && typeof d.prepare === 'function' ? d : null;
}

/** First run against a given workspace and schema: put the history that already exists into the outbox. Idempotent MERGEs make a repeat harmless. */
function backfill(deps: SyncDeps, db: DatabaseSync, outbox: Outbox, loc: Location, host: string, nowMs: number): void {
  const flag = `sync:backfill:${createHash('sha1').update(`${host}|${loc.catalog}|${loc.schema}`).digest('hex').slice(0, 12)}`;
  try {
    db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    if (db.prepare('SELECT 1 FROM kv WHERE key = ?').get(flag)) return;
    const put = (table: SyncTable, m: Mapped) => outbox.append(table, m.key, m.payload);
    for (const e of deps.data.listEmployees()) put('employees', mapEmployee(e, nowMs));
    for (const t of deps.data.listTasksInRange(0, Number.MAX_SAFE_INTEGER)) put('tasks', mapTask(t, nowMs));
    type R = Record<string, unknown>;
    const all = (sql: string) => db.prepare(sql).all() as R[];
    for (const r of all('SELECT * FROM steps')) {
      put('steps', mapStep({
        id: r.id as string, employeeId: r.employee_id as string, taskId: (r.task_id as string | null) ?? null, sentence: r.sentence as string,
        status: r.status as 'running' | 'ok' | 'error', startedMs: r.started_ms as number, endedMs: (r.ended_ms as number | null) ?? null,
        peer: r.peer ? JSON.parse(r.peer as string) : undefined,
      }));
    }
    for (const r of all('SELECT * FROM messages')) {
      put('messages', mapMessage({
        id: r.id as string, employeeId: r.employee_id as string, from: r.from_who as 'user' | 'employee' | 'system', kind: r.kind as 'text',
        text: r.text as string, taskId: (r.task_id as string | null) ?? null, createdMs: r.created_ms as number, seenMs: (r.seen_ms as number | null) ?? null,
      }));
    }
    for (const r of all('SELECT * FROM usage')) {
      put('usage', mapUsage({
        employeeId: r.employee_id as string, taskId: (r.task_id as string | null) ?? null, tsMs: r.ts_ms as number,
        costUsd: r.cost_usd as number, inputTokens: r.input_tokens as number, outputTokens: r.output_tokens as number,
      }));
    }
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(flag, String(nowMs));
  } catch (e) {
    console.warn('[sync] could not queue the existing history:', (e as Error).message);
  }
}

const toNum = (v: string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v) || 0);

/** The Databricks sync: outbox, batched MERGE sink, warehouse read path, Genie. SQLite stays the source of truth; nothing here throws into the app. */
export function createDatabricksSync(deps: SyncDeps, opts: DatabricksOptions = {}): Sync {
  const env = deps.env;
  const t: Timing = { ...DEFAULT_TIMING, ...opts.timing };
  const now = opts.now ?? Date.now;
  const loc: Location = { catalog: env.DATABRICKS_CATALOG, schema: env.DATABRICKS_SCHEMA };
  checkLocation(loc);
  const host = normaliseHost(env.DATABRICKS_HOST);
  const api = { host, token: env.DATABRICKS_TOKEN, requestTimeoutMs: t.requestTimeoutMs, fetch: opts.fetch };
  const wh = new Warehouse({ ...api, ...loc, warehouseId: env.DATABRICKS_WAREHOUSE_ID, pollMs: t.pollMs });
  const genie: GenieClient | null = env.DATABRICKS_GENIE_SPACE_ID
    ? createGenieClient({ ...api, spaceId: env.DATABRICKS_GENIE_SPACE_ID, now: opts.now })
    : null;
  const local = createLocalSync(deps);

  const breaker = new CircuitBreaker({
    openMs: t.breakerOpenMs,
    now,
    onChange: (s) => console.warn(s === 'open' ? '[sync] Databricks is not answering; pausing sync for a few minutes.' : '[sync] Databricks is back; sync resumed.'),
  });

  const db = storeDb(deps);
  if (!db) throw new Error('Databricks sync needs the store database.');
  const outbox = new Outbox(db, now);
  backfill(deps, db, outbox, loc, host, now());

  let syncedMs: number | null = null;
  let inFlight: Promise<{ sent: number; failed: boolean }> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let schemaEnsured = false;
  let stopped = false;
  let day = '';
  let statementsToday = 0;
  const cache = new Map<TeamReport['range'], { at: number; report: TeamReport }>();

  function underCap(): boolean {
    const d = new Date(now()).toDateString();
    if (d !== day) {
      day = d;
      statementsToday = 0;
    }
    return statementsToday < t.dailyStatementCap;
  }

  async function ensureSchema(): Promise<void> {
    if (schemaEnsured) return;
    schemaEnsured = true;
    for (const d of ddl(loc)) await wh.execute(d.sql);
  }

  async function mergeBatch(table: SyncTable, rows: Record<string, unknown>[]): Promise<void> {
    const sql = buildMerge(loc, TABLES[table], rows);
    statementsToday++;
    try {
      await wh.execute(sql);
    } catch (e) {
      // The tables are missing (the setup script was not run): create them once and retry.
      if (!schemaEnsured && e instanceof DatabricksError && e.kind === 'failed' && /NOT_FOUND|cannot be found|does not exist/i.test(e.message)) {
        await ensureSchema();
        statementsToday++;
        await wh.execute(sql);
        return;
      }
      throw e;
    }
  }

  async function doFlush(only?: SyncTable[]): Promise<{ sent: number; failed: boolean }> {
    let sent = 0;
    const left = () => (only ? outbox.pendingIn(only) : outbox.pending());
    // One MERGE per table per round; keep going while rows remain so a large backlog drains in one flush.
    while (left() > 0) {
      if (!underCap()) return { sent, failed: false };
      const batches = outbox.next(t.maxRowsPerStatement, only);
      if (batches.length === 0) break;
      for (const batch of batches) {
        if (!breaker.allow()) return { sent, failed: true };
        try {
          await guardedOnAllowed(() => mergeBatch(batch.table, batch.rows.map((r) => r.payload)));
        } catch (e) {
          quietFailure(e);
          return { sent, failed: true };
        }
        outbox.markSent(batch.rows.map((r) => r.id));
        sent += batch.rows.length;
        syncedMs = now();
      }
    }
    return { sent, failed: false };
  }

  /** Like guarded, for a caller that already took the breaker's permission with allow(). */
  async function guardedOnAllowed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      breaker.success();
      return r;
    } catch (e) {
      breaker.failure(e instanceof DatabricksError && e.kind === 'auth');
      throw e;
    }
  }

  let lastWarning = '';
  function quietFailure(e: unknown): void {
    const msg = (e as Error).message;
    if (msg !== lastWarning) {
      lastWarning = msg;
      console.warn('[sync] Databricks write failed:', msg);
    }
  }

  /** One flush at a time. Never rejects. */
  function flush(only?: SyncTable[]): Promise<{ sent: number; failed: boolean }> {
    if (inFlight) return inFlight;
    inFlight = doFlush(only)
      .catch((e) => {
        quietFailure(e);
        return { sent: 0, failed: true };
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  /** With nothing queued, a trivial statement still proves the link and warms the warehouse. */
  async function ping(): Promise<void> {
    if (!underCap() || !breaker.allow()) return;
    statementsToday++;
    try {
      await guardedOnAllowed(() => wh.execute('SELECT 1'));
      syncedMs = now();
    } catch (e) {
      quietFailure(e);
    }
  }

  function kick(): void {
    if (stopped) return;
    void (outbox.pending() > 0 ? flush() : ping()).catch(() => {});
  }

  function mapReport(range: TeamReport['range'], res: StatementResult, at: number): TeamReport {
    const col = (name: string) => res.columns.indexOf(name);
    const iEmp = col('employee_id'), iPeriod = col('period'), iTasks = col('tasks'), iActive = col('active_ms'),
      iDone = col('tasks_done'), iFailed = col('tasks_failed'), iCost = col('cost_usd');
    if ([iEmp, iPeriod, iTasks, iActive, iDone, iFailed, iCost].some((i) => i < 0)) throw new DatabricksError('The warehouse answered with unexpected columns.', 'failed');
    const empty = () => ({ tasks: 0, activeMs: 0, tasksDone: 0, tasksFailed: 0, costUsd: 0 });
    const cur = new Map<string, ReturnType<typeof empty>>();
    const prev = new Map<string, ReturnType<typeof empty>>();
    for (const r of res.rows) {
      const m = r[iPeriod] === 'cur' ? cur : prev;
      m.set(String(r[iEmp]), {
        tasks: toNum(r[iTasks]), activeMs: toNum(r[iActive]), tasksDone: toNum(r[iDone]), tasksFailed: toNum(r[iFailed]), costUsd: toNum(r[iCost]),
      });
    }
    const people = deps.data.listEmployees();
    const rows: TeamRow[] = people.map((e) => {
      const x = cur.get(e.id) ?? empty();
      return {
        employeeId: e.id, name: e.persona.name, role: e.persona.role, portraitUrl: e.persona.portraitUrl,
        activeMs: x.activeMs, tasksDone: x.tasksDone, tasksFailed: x.tasksFailed, costUsd: x.costUsd, lastActivityMs: e.lastActivityMs,
      };
    });
    rows.sort((a, b) => b.activeMs - a.activeMs || b.tasksDone - a.tasksDone || a.name.localeCompare(b.name));
    const sum = (m: Map<string, ReturnType<typeof empty>>) => {
      let tasks = 0, activeMs = 0, tasksDone = 0, costUsd = 0;
      for (const e of people) {
        const x = m.get(e.id);
        if (!x) continue;
        tasks += x.tasks; activeMs += x.activeMs; tasksDone += x.tasksDone; costUsd += x.costUsd;
      }
      return { tasks, totals: { activeMs, tasksDone, costUsd } };
    };
    const c = sum(cur), p = sum(prev);
    return { range, totals: c.totals, previous: p.tasks > 0 ? p.totals : null, rows, source: 'databricks', syncedMs: at };
  }

  async function warehouseReport(range: TeamReport['range'], budgetMs: number): Promise<TeamReport | null> {
    const deadline = now() + budgetMs;
    const left = () => Math.max(1, deadline - now());
    // The report only reads tasks, so only tasks have to be current (a full flush takes about two seconds per table).
    // A flush that is already running may be sending other tables; stop waiting for it as soon as the tasks are through.
    while (outbox.pendingIn(['tasks']) > 0) {
      if (left() <= 1) return null;
      const f = await Promise.race([flush(['tasks']), new Promise<undefined>((r) => setTimeout(() => r(undefined), 250))]);
      if (f?.failed) return null;
    }
    const p = periodFor(range, now());
    if (!underCap() || !breaker.allow()) return null;
    statementsToday++;
    const res = await guardedOnAllowed(() => wh.execute(REPORT_SQL(loc), {
      budgetMs: left(),
      parameters: [
        { name: 'start_ms', value: String(p.startMs), type: 'BIGINT' },
        { name: 'prev_start_ms', value: String(p.previousStartMs), type: 'BIGINT' },
        { name: 'end_ms', value: String(p.endMs), type: 'BIGINT' },
      ],
    }));
    const at = now();
    syncedMs = at;
    return mapReport(range, res, at);
  }

  return {
    status(): SyncStatus {
      return { databricks: true, genie: genie !== null || env.MOCK_GENIE, syncedMs };
    },

    record(table, row) {
      if (stopped) return;
      try {
        const m = mapRow(table, row, now());
        if (!m) return;
        outbox.append(table, m.key, m.payload);
        if (outbox.pending() >= t.flushRows) kick();
      } catch {
        /* the mirror must never break a write */
      }
    },

    async teamReport(range) {
      const hit = cache.get(range);
      if (hit && now() - hit.at < t.reportCacheMs) return hit.report;
      if (breaker.state() === 'open') return computeTeamReport(deps.data, range, now());
      try {
        const work = warehouseReport(range, t.reportBudgetMs);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const limit = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), t.reportBudgetMs);
        });
        work.catch(() => {});
        const report = await Promise.race([work, limit]).finally(() => clearTimeout(timer));
        if (report) {
          cache.set(range, { at: now(), report });
          return report;
        }
      } catch (e) {
        quietFailure(e);
      }
      return computeTeamReport(deps.data, range, now());
    },

    async ask(question: string, conversationId?: string): Promise<TeamAskResponse> {
      if (genie) return genie.ask(question, conversationId);
      return local.ask(question, conversationId);
    },

    async boot() {
      if (timer) return;
      timer = setInterval(kick, t.flushIntervalMs);
      timer.unref();
      setTimeout(kick, 0).unref();
    },

    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (outbox.pending() === 0) return;
      let to: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([flush(), new Promise((r) => { to = setTimeout(r, t.stopFlushMs); })]).finally(() => clearTimeout(to));
    },
  };
}

