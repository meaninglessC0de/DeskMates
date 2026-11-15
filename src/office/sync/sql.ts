import type { SyncTable } from './types.ts';

export interface Location {
  catalog: string;
  schema: string;
}

export type ColType = 'STRING' | 'BIGINT' | 'INT' | 'DOUBLE' | 'TIMESTAMP';

/** A Delta column. A TIMESTAMP column with `from` is derived from that `*_ms` column of the same row. */
export interface Col {
  name: string;
  type: ColType;
  from?: string;
}

export interface TableDef {
  /** Delta table name. */
  name: string;
  key: string;
  cols: Col[];
  /** MERGE updates matched rows (mutable rows) or only inserts new ones (append-only rows). */
  update: boolean;
}

const s = (name: string): Col => ({ name, type: 'STRING' });
const big = (name: string): Col => ({ name, type: 'BIGINT' });
const ts = (name: string, from: string): Col => ({ name, type: 'TIMESTAMP', from });

export const TABLES: Record<SyncTable, TableDef> = {
  employees: {
    name: 'employees', key: 'employee_id', update: true,
    cols: [s('employee_id'), s('name'), s('role'), s('permission_level'), big('created_ms'), ts('created_at', 'created_ms'), big('updated_ms')],
  },
  tasks: {
    name: 'tasks', key: 'task_id', update: true,
    cols: [
      s('task_id'), s('employee_id'), s('title'), s('assigned_by'), s('status'),
      big('assigned_ms'), ts('assigned_at', 'assigned_ms'), big('finished_ms'), ts('finished_at', 'finished_ms'),
      big('active_ms'), big('input_tokens'), big('output_tokens'), { name: 'cost_usd', type: 'DOUBLE' },
      { name: 'num_turns', type: 'INT' }, s('outcome'), s('trace_id'), big('updated_ms'),
    ],
  },
  steps: {
    name: 'events', key: 'event_id', update: true,
    cols: [
      s('event_id'), s('employee_id'), s('task_id'), big('ts_ms'), ts('ts', 'ts_ms'),
      s('kind'), s('tool'), s('summary'), s('detail'), s('status'), big('duration_ms'),
    ],
  },
  messages: {
    name: 'messages', key: 'message_id', update: false,
    cols: [s('message_id'), big('ts_ms'), ts('ts', 'ts_ms'), s('from_id'), s('to_id'), s('channel'), s('task_id'), s('body')],
  },
  usage: {
    name: 'usage', key: 'usage_id', update: false,
    cols: [
      s('usage_id'), big('ts_ms'), ts('ts', 'ts_ms'), s('employee_id'), s('task_id'), s('model'),
      big('input_tokens'), big('output_tokens'), big('cache_read_tokens'), big('cache_write_tokens'), { name: 'cost_usd', type: 'DOUBLE' },
    ],
  },
};

/** Flush order: parents before children. */
export const TABLE_ORDER: SyncTable[] = ['employees', 'tasks', 'steps', 'messages', 'usage'];

const IDENT = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

export function checkLocation(l: Location): void {
  if (!IDENT.test(l.catalog) || !IDENT.test(l.schema)) throw new Error('DATABRICKS_CATALOG and DATABRICKS_SCHEMA may only contain letters, digits, underscores and hyphens.');
}

export function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

export function tableRef(l: Location, table: string): string {
  return `${quoteIdent(l.catalog)}.${quoteIdent(l.schema)}.${quoteIdent(table)}`;
}

/**
 * Spark SQL string literal. Backslash is the escape character, so it is escaped first; quotes become \' ; line breaks and control
 * characters become escapes so that a value can never end the literal or the statement; lone surrogates (invalid text) become U+FFFD.
 */
export function sqlString(value: string): string {
  let out = "'";
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c === 0) out += '\\0';
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else if (c >= 0xd800 && c <= 0xdfff) out += '�';
    else out += ch;
  }
  return out + "'";
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function literal(type: ColType, v: unknown, fromMs?: unknown): string {
  if (type === 'STRING') return v === null || v === undefined ? 'CAST(NULL AS STRING)' : sqlString(String(v));
  if (type === 'TIMESTAMP') {
    const ms = num(fromMs);
    return ms === null ? 'CAST(NULL AS TIMESTAMP)' : `timestamp_millis(${Math.trunc(ms)})`;
  }
  const n = num(v);
  if (n === null) return `CAST(NULL AS ${type})`;
  return type === 'DOUBLE' ? `CAST(${n} AS DOUBLE)` : `CAST(${Math.trunc(n)} AS ${type})`;
}

export function rowValues(def: TableDef, row: Record<string, unknown>): string {
  return '(' + def.cols.map((c) => literal(c.type, row[c.name], c.from ? row[c.from] : undefined)).join(', ') + ')';
}

/** Keeps the last row for each key. */
export function dedupe(def: TableDef, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of rows) byKey.set(String(r[def.key]), r);
  return [...byKey.values()];
}

/** One idempotent MERGE for a batch of rows. The values are inlined with safe escaping; there is no user text outside string literals. */
export function buildMerge(loc: Location, def: TableDef, rows: Record<string, unknown>[]): string {
  checkLocation(loc);
  const batch = dedupe(def, rows);
  if (batch.length === 0) throw new Error('buildMerge needs at least one row');
  const names = def.cols.map((c) => quoteIdent(c.name)).join(', ');
  const key = quoteIdent(def.key);
  return [
    `MERGE INTO ${tableRef(loc, def.name)} AS t`,
    `USING (SELECT * FROM VALUES`,
    batch.map((r) => '  ' + rowValues(def, r)).join(',\n'),
    `  AS v(${names})) AS s`,
    `ON t.${key} = s.${key}`,
    def.update ? 'WHEN MATCHED THEN UPDATE SET *' : null,
    'WHEN NOT MATCHED THEN INSERT *',
  ].filter((x) => x !== null).join('\n');
}

/** The DDL from research 06, in run order. Idempotent. */
export function ddl(loc: Location): { name: string; sql: string }[] {
  checkLocation(loc);
  const t = (n: string) => tableRef(loc, n);
  return [
    { name: 'schema', sql: `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(loc.catalog)}.${quoteIdent(loc.schema)} COMMENT 'Deskmates: AI employee activity'` },
    {
      name: 'employees',
      sql: `CREATE TABLE IF NOT EXISTS ${t('employees')} (
  employee_id STRING COMMENT 'Primary key',
  name STRING COMMENT 'Human first name of the AI employee',
  role STRING COMMENT 'Job role, e.g. web developer, marketer',
  permission_level STRING COMMENT 'How much the employee must ask before acting: asks_first, asks_big_steps, independent',
  created_ms BIGINT, created_at TIMESTAMP,
  updated_ms BIGINT
) USING DELTA`,
    },
    {
      name: 'tasks',
      sql: `CREATE TABLE IF NOT EXISTS ${t('tasks')} (
  task_id STRING COMMENT 'Primary key',
  employee_id STRING COMMENT 'Employee who owns the task',
  title STRING COMMENT 'Short task description',
  assigned_by STRING COMMENT 'user or another employee_id',
  status STRING COMMENT 'running, blocked, done, failed, cancelled',
  assigned_ms BIGINT, assigned_at TIMESTAMP,
  finished_ms BIGINT, finished_at TIMESTAMP,
  active_ms BIGINT COMMENT 'Milliseconds the employee was actually working (not blocked or idle)',
  input_tokens BIGINT, output_tokens BIGINT,
  cost_usd DOUBLE COMMENT 'Estimated model cost in US dollars',
  num_turns INT,
  outcome STRING COMMENT 'One or two sentence result',
  trace_id STRING COMMENT 'MLflow trace id, if traced',
  updated_ms BIGINT
) USING DELTA`,
    },
    {
      name: 'events',
      sql: `CREATE TABLE IF NOT EXISTS ${t('events')} (
  event_id STRING COMMENT 'Primary key',
  employee_id STRING, task_id STRING,
  ts_ms BIGINT, ts TIMESTAMP,
  kind STRING COMMENT 'plan_step, tool_call, shell, file, gui_action, permission_request, permission_decision, error, status, complete',
  tool STRING COMMENT 'Tool or application name',
  summary STRING COMMENT 'One-line description',
  detail STRING COMMENT 'Truncated JSON (max 4 KB), never screenshots',
  status STRING COMMENT 'ok, error, denied, pending',
  duration_ms BIGINT
) USING DELTA`,
    },
    {
      name: 'messages',
      sql: `CREATE TABLE IF NOT EXISTS ${t('messages')} (
  message_id STRING COMMENT 'Primary key',
  ts_ms BIGINT, ts TIMESTAMP,
  from_id STRING COMMENT 'employee_id or user',
  to_id STRING COMMENT 'employee_id or user',
  channel STRING COMMENT 'user_dm, employee_dm, meeting',
  task_id STRING,
  body STRING COMMENT 'Message text (truncated to 2 KB)'
) USING DELTA`,
    },
    {
      name: 'usage',
      sql: `CREATE TABLE IF NOT EXISTS ${t('usage')} (
  usage_id STRING COMMENT 'Primary key',
  ts_ms BIGINT, ts TIMESTAMP,
  employee_id STRING, task_id STRING,
  model STRING,
  input_tokens BIGINT, output_tokens BIGINT,
  cache_read_tokens BIGINT, cache_write_tokens BIGINT,
  cost_usd DOUBLE COMMENT 'Cost of one model turn in US dollars (a per-call delta)'
) USING DELTA`,
    },
    {
      name: 'daily_reports',
      sql: `CREATE TABLE IF NOT EXISTS ${t('daily_reports')} (
  report_id STRING, day DATE, employee_id STRING, summary STRING, generated_by STRING, created_ms BIGINT
) USING DELTA`,
    },
  ];
}
