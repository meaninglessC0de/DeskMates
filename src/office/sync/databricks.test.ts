import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee, Message, Task } from '../../shared/index.ts';
import { readEnv } from '../../shared/index.ts';
import { Store } from '../store/store.ts';
import { createDatabricksSync, type Timing } from './databricks.ts';
import { startFakeDatabricks, type FakeDatabricks } from './fakeDatabricks.ts';
import { createSync } from './index.ts';
import { computeTeamReport } from './team.ts';
import type { Sync } from './types.ts';

const DAY = 86_400_000;
const NOW = Date.now();

function emp(id: string, name: string, lastActivityMs = 42): Employee {
  return {
    id,
    persona: { name, firstName: name.split(' ')[0], role: 'Role', roleKey: 'x', personality: '', workingStyle: '', starters: [], portraitUrl: '/media/portraits/x.jpg', voice: { provider: 'livekit', voiceId: '', label: '', sampleUrl: null }, avatarId: null },
    permissions: { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true },
    state: 'idle', stateDetail: '', stateSinceMs: 0, spaceId: null, sessionId: null, model: 'm', unread: 0, lastActivityMs, screenGrant: null,
    desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: 1_700_000_000_000,
  };
}
let n = 0;
function task(employeeId: string, finishedMs: number, over: Partial<Task> = {}): Task {
  return { id: `t${++n}`, employeeId, title: 't', assignedBy: 'user', status: 'done', plan: [], outcome: null, assignedMs: finishedMs - 600_000, finishedMs, activeMs: 600_000, costUsd: 0.25, inputTokens: 5, outputTokens: 6, numTurns: 1, traceId: null, ...over };
}
function msg(id: string, employeeId: string, text = 'hello'): Message {
  return { id, employeeId, from: 'user', kind: 'text', text, taskId: null, createdMs: NOW, seenMs: null };
}

const FAST: Partial<Timing> = { flushIntervalMs: 25, pollMs: 5, requestTimeoutMs: 1000, reportBudgetMs: 1500, stopFlushMs: 1000 };

let fake: FakeDatabricks;
let stores: Store[] = [];
let syncs: Sync[] = [];
let clock = { t: NOW };

beforeEach(async () => {
  fake = await startFakeDatabricks();
  clock = { t: NOW };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  for (const s of syncs) await s.stop();
  for (const s of stores) s.close();
  stores = [];
  syncs = [];
  await fake.close();
  vi.restoreAllMocks();
});

function setup(opts: { timing?: Partial<Timing>; env?: Record<string, string>; clockOn?: boolean; wire?: boolean } = {}) {
  const store = new Store(':memory:');
  stores.push(store);
  const env = readEnv({
    MOCK_LLM: '1', DATABRICKS_SYNC: 'on', DATABRICKS_HOST: fake.url, DATABRICKS_TOKEN: fake.token, DATABRICKS_WAREHOUSE_ID: 'wh1',
    DATABRICKS_GENIE_SPACE_ID: 'space1', ...opts.env,
  });
  const sync = createDatabricksSync({ env, data: store }, { timing: { ...FAST, ...opts.timing }, now: opts.clockOn ? () => clock.t : undefined });
  syncs.push(sync);
  if (opts.wire !== false) store.onWrite = (t, r) => sync.record(t, r);
  return { store, sync, env };
}

const until = async (what: string, fn: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const merges = () => fake.statements.filter((s) => s.startsWith('MERGE INTO'));
const rowsIn = (m: string) => (m.match(/\n {2}\(/g) ?? []).length;

describe('flushing', () => {
  it('syncs every table with one MERGE per table and removes the sent rows', async () => {
    const { store, sync } = setup();
    store.insertEmployee(emp('e1', 'Maya Okafor'));
    store.upsertTask(task('e1', NOW));
    store.insertMessage(msg('m1', 'e1'));
    store.upsertStep({ id: 's1', employeeId: 'e1', taskId: null, sentence: 'Opened the site', status: 'ok', startedMs: NOW, endedMs: NOW + 1500 });
    store.addUsage({ employeeId: 'e1', taskId: null, tsMs: NOW, costUsd: 0.1, inputTokens: 1, outputTokens: 2 });
    await sync.boot();
    await until('all five tables', () => ['employees', 'tasks', 'events', 'messages', 'usage'].every((t) => fake.tables.has(t)));
    expect(merges()).toHaveLength(5);
    expect([...fake.tables.get('events')!.values()][0]).toMatchObject({ summary: 'Opened the site', status: 'ok', duration_ms: 1500, ts: NOW });
    expect([...fake.tables.get('employees')!.values()][0]).toMatchObject({ employee_id: 'e1', name: 'Maya Okafor', permission_level: 'asks_big_steps' });
    await until('outbox empty', () => (store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n === 0);
    expect(sync.status().syncedMs).not.toBeNull();
  });

  it('a later write supersedes an unsent one and only the newest is sent', async () => {
    const { store, sync } = setup();
    store.upsertTask(task('e1', NOW, { id: 'tx', status: 'running', finishedMs: null }));
    store.upsertTask(task('e1', NOW, { id: 'tx', status: 'done' }));
    await sync.boot();
    await until('task synced', () => fake.tables.has('tasks'));
    expect(rowsIn(merges()[0])).toBe(1);
    expect(fake.tables.get('tasks')!.get('tx')!.status).toBe('done');
  });

  it('flushes at 200 rows without waiting for the timer, and drains a big backlog in batches of at most 500', async () => {
    const { store } = setup({ timing: { flushIntervalMs: 60_000, maxRowsPerStatement: 120 } });
    for (let i = 0; i < 450; i++) store.insertMessage(msg(`m${i}`, 'e1'));
    await until('all rows delivered', () => (fake.tables.get('messages')?.size ?? 0) === 450);
    const sizes = merges().map(rowsIn);
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(120);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(450);
  });

  it('waits for the timer below 200 rows', async () => {
    const { store, sync } = setup({ timing: { flushIntervalMs: 80 } });
    store.insertMessage(msg('m1', 'e1'));
    expect(fake.statements).toHaveLength(0);
    await sync.boot();
    await until('flushed', () => fake.tables.has('messages'));
  });

  it('truncates long text as the DDL comments say', async () => {
    const { store, sync } = setup();
    store.insertMessage(msg('m1', 'e1', 'x'.repeat(5000)));
    store.upsertStep({ id: 's1', employeeId: 'e1', taskId: null, sentence: 's', status: 'ok', startedMs: NOW, endedMs: NOW, peer: { employeeId: 'e2', direction: 'to', text: 'y'.repeat(9000) } });
    await sync.boot();
    await until('synced', () => fake.tables.has('messages') && fake.tables.has('events'));
    expect(String([...fake.tables.get('messages')!.values()][0].body).length).toBe(2048);
    expect(String([...fake.tables.get('events')!.values()][0].detail).length).toBe(4096);
  });

  it('records an awkward message body exactly', async () => {
    const { store, sync } = setup();
    const awful = "O'Brien \\ \"q\"\nline\t🙂 ';DROP TABLE messages;--";
    store.insertMessage(msg('m1', 'e1', awful));
    await sync.boot();
    await until('synced', () => fake.tables.has('messages'));
    expect([...fake.tables.get('messages')!.values()][0].body).toBe(awful);
  });

  it('gives the same usage row the same id every time, so a re-send never duplicates it', async () => {
    const { store, sync } = setup({ wire: false });
    const u = { employeeId: 'e1', taskId: 't1', tsMs: NOW, costUsd: 0.1, inputTokens: 1, outputTokens: 2 };
    sync.record('usage', u);
    sync.record('usage', { ...u });
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 1 });
    await sync.stop();
    expect(fake.tables.get('usage')?.size).toBe(1);
  });

  it('never throws into the caller', () => {
    const { sync } = setup({ wire: false });
    expect(() => sync.record('tasks', null)).not.toThrow();
    expect(() => sync.record('tasks', 42)).not.toThrow();
    expect(() => sync.record('messages', { id: 1n })).not.toThrow();
  });

  it('reads statements that come back PENDING by polling the statement id', async () => {
    fake.options.pendingPolls = 2;
    const { store, sync } = setup();
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('synced', () => sync.status().syncedMs !== null);
    expect(fake.requests.filter((r) => r.method === 'GET' && r.path.startsWith('/api/2.0/sql/statements/')).length).toBeGreaterThanOrEqual(2);
  });

  it('sends the last flush when it stops', async () => {
    const { store, sync } = setup({ timing: { flushIntervalMs: 60_000 } });
    store.insertMessage(msg('m1', 'e1'));
    await sync.stop();
    expect(fake.tables.get('messages')?.size).toBe(1);
  });

  it('creates the schema once and retries when the tables are missing', async () => {
    fake.requireTables(true);
    const { store, sync } = setup();
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('synced', () => fake.tables.has('messages'));
    expect(fake.statements.filter((s) => s.startsWith('CREATE TABLE IF NOT EXISTS'))).toHaveLength(6);
    expect(fake.statements[0]).toMatch(/^MERGE/);
  });

  it('sends the history that existed before sync was turned on, once per workspace', async () => {
    const store = new Store(':memory:');
    stores.push(store);
    store.insertEmployee(emp('e1', 'Maya Okafor'));
    store.upsertTask(task('e1', NOW));
    store.insertMessage(msg('m1', 'e1'));
    store.addUsage({ employeeId: 'e1', taskId: null, tsMs: NOW, costUsd: 0.1, inputTokens: 1, outputTokens: 2 });
    const env = readEnv({ DATABRICKS_SYNC: 'on', DATABRICKS_HOST: fake.url, DATABRICKS_TOKEN: fake.token, DATABRICKS_WAREHOUSE_ID: 'wh1' });
    const a = createDatabricksSync({ env, data: store }, { timing: FAST });
    syncs.push(a);
    await a.boot();
    await until('history synced', () => ['employees', 'tasks', 'messages', 'usage'].every((t) => fake.tables.has(t)));
    await a.stop();
    const before = fake.statements.length;
    const b = createDatabricksSync({ env, data: store }, { timing: FAST });
    syncs.push(b);
    await b.boot();
    await new Promise((r) => setTimeout(r, 120));
    expect(fake.statements.slice(before).filter((s) => s.startsWith('MERGE'))).toHaveLength(0);
  });

  it('does nothing network-wise before boot and pings once at boot when idle', async () => {
    const { sync } = setup();
    expect(fake.requests).toHaveLength(0);
    await sync.boot();
    await until('ping', () => sync.status().syncedMs !== null);
    expect(fake.statements).toEqual(['SELECT 1']);
  });
});

describe('circuit breaker in the sink', () => {
  it('opens after three failed flushes, stops calling, probes after five minutes and recovers', async () => {
    fake.failAll(500);
    const { store, sync } = setup({ clockOn: true });
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('three attempts', () => fake.requests.length >= 3);
    await new Promise((r) => setTimeout(r, 150));
    expect(fake.requests).toHaveLength(3);
    clock.t += 299_000;
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.requests).toHaveLength(3);
    fake.failAll(null);
    clock.t += 2000;
    await until('probe succeeds', () => fake.tables.has('messages'));
    expect(sync.status().syncedMs).not.toBeNull();
  });

  it('a bad token opens it at once', async () => {
    const { store, sync } = setup({ clockOn: true, env: { DATABRICKS_TOKEN: 'not-the-token' } });
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('first call', () => fake.requests.length >= 1);
    await new Promise((r) => setTimeout(r, 120));
    expect(fake.requests).toHaveLength(1);
  });

  it('keeps the rows queued while it is down', async () => {
    fake.failAll(503);
    const { store, sync } = setup({ clockOn: true });
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('three attempts', () => fake.requests.length >= 3);
    expect((store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n).toBe(1);
  });
});

describe('team report from the warehouse', () => {
  function seed(store: Store) {
    store.insertEmployee(emp('e1', 'Maya Okafor', 111));
    store.insertEmployee(emp('e2', 'Priya Raman', 222));
    store.upsertTask(task('e1', NOW - 1000, { activeMs: 3_600_000, costUsd: 0.5 }));
    store.upsertTask(task('e1', NOW - 2 * DAY, { activeMs: 1_800_000, costUsd: 0.25, status: 'failed' }));
    store.upsertTask(task('e2', NOW - 3 * DAY, { activeMs: 900_000, costUsd: 0.125 }));
    store.upsertTask(task('e1', NOW - 9 * DAY, { activeMs: 600_000, costUsd: 0.0625 })); // the week before
    store.upsertTask(task('e2', NOW - 100 * DAY)); // outside both periods
    store.upsertTask(task('gone', NOW - 1000)); // an employee who was removed
  }

  it('flushes first, then maps the aggregate to a TeamReport with the same numbers as local', async () => {
    const { store, sync } = setup();
    seed(store);
    const report = await sync.teamReport('week');
    const local = computeTeamReport(store, 'week');
    expect(report.source).toBe('databricks');
    expect(report.syncedMs).toBeGreaterThan(0);
    expect(report.range).toBe('week');
    expect(report.rows).toEqual(local.rows);
    expect(report.totals).toEqual(local.totals);
    expect(report.previous).toEqual(local.previous);
    expect(report.previous).not.toBeNull();
    expect(report.rows[0]).toMatchObject({ employeeId: 'e1', tasksDone: 1, tasksFailed: 1, lastActivityMs: 111 });
    expect(fake.statements.some((s) => /GROUP BY 1, 2/.test(s))).toBe(true);
    const q = fake.requests.find((r) => String(r.body?.statement).includes('GROUP BY'))!;
    expect(q.body!.parameters).toEqual([
      expect.objectContaining({ name: 'start_ms', type: 'BIGINT' }),
      expect.objectContaining({ name: 'prev_start_ms', type: 'BIGINT' }),
      expect.objectContaining({ name: 'end_ms', type: 'BIGINT' }),
    ]);
  });

  it('only brings the tasks up to date before reading (the other tables wait for their own flush)', async () => {
    const { store, sync } = setup({ timing: { flushIntervalMs: 60_000 } });
    seed(store);
    store.insertMessage(msg('m1', 'e1'));
    expect((await sync.teamReport('week')).source).toBe('databricks');
    expect(fake.tables.has('tasks')).toBe(true);
    expect(fake.tables.has('messages')).toBe(false);
    expect(fake.tables.has('employees')).toBe(false);
  });

  it('has no previous period when there was no work then', async () => {
    const { store, sync } = setup();
    store.insertEmployee(emp('e1', 'Maya Okafor'));
    store.upsertTask(task('e1', NOW - 1000));
    const r = await sync.teamReport('today');
    expect(r.source).toBe('databricks');
    expect(r.previous).toBeNull();
    expect(r.totals.tasksDone).toBe(1);
  });

  it('caches the last good answer for 60 seconds', async () => {
    const { store, sync } = setup({ clockOn: true });
    seed(store);
    const a = await sync.teamReport('week');
    const calls = fake.requests.length;
    const b = await sync.teamReport('week');
    expect(b).toBe(a);
    expect(fake.requests).toHaveLength(calls);
    await sync.teamReport('today'); // another range is not cached
    expect(fake.requests.length).toBeGreaterThan(calls);
    const calls2 = fake.requests.length;
    clock.t += 61_000;
    await sync.teamReport('week');
    expect(fake.requests.length).toBeGreaterThan(calls2);
  });

  it('falls back to local when the aggregate query fails', async () => {
    const { store, sync } = setup();
    seed(store);
    fake.failStatements('boom', /GROUP BY/);
    const r = await sync.teamReport('week');
    expect(r.source).toBe('local');
    expect(r.syncedMs).toBeNull();
    expect(r).toEqual(computeTeamReport(store, 'week'));
  });

  it('falls back to local when the warehouse is down', async () => {
    const { store, sync } = setup();
    seed(store);
    fake.failAll(500);
    expect((await sync.teamReport('week')).source).toBe('local');
  });

  it('falls back to local when the warehouse is slower than the budget', async () => {
    fake.options.latencyMs = 600;
    const { store, sync } = setup({ timing: { reportBudgetMs: 150 } });
    seed(store);
    const t0 = Date.now();
    const r = await sync.teamReport('week');
    expect(r.source).toBe('local');
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r).toEqual(computeTeamReport(store, 'week'));
  });

  it('falls back to local without calling Databricks while the breaker is open', async () => {
    fake.failAll(500);
    const { store, sync } = setup({ clockOn: true });
    store.insertMessage(msg('m1', 'e1'));
    await sync.boot();
    await until('breaker open', () => fake.requests.length >= 3);
    await new Promise((r) => setTimeout(r, 60));
    seed(store);
    fake.failAll(null);
    const calls = fake.requests.length;
    const r = await sync.teamReport('week');
    expect(r.source).toBe('local');
    expect(fake.requests).toHaveLength(calls);
  });

  it('shows local numbers when it cannot bring the warehouse up to date', async () => {
    const { store, sync } = setup();
    seed(store);
    fake.failStatements('merge failed', /^MERGE/);
    expect((await sync.teamReport('week')).source).toBe('local');
  });
});

describe('ask', () => {
  it('goes through Genie when a space id is set', async () => {
    const { sync } = setup();
    expect(sync.status()).toMatchObject({ databricks: true, genie: true });
    const r = await sync.ask('Who worked the most?');
    expect(r.sql).toContain('SELECT');
    expect(r.conversationId).toMatch(/^conv-/);
  });

  it('is genie_off without a space id', async () => {
    const { sync } = setup({ env: { DATABRICKS_GENIE_SPACE_ID: '' } });
    expect(sync.status().genie).toBe(false);
    await expect(sync.ask('q')).rejects.toMatchObject({ status: 409, code: 'genie_off' });
  });

  it('keeps the fixed mock answer with MOCK_GENIE=1 and no space id', async () => {
    const { sync } = setup({ env: { DATABRICKS_GENIE_SPACE_ID: '', MOCK_GENIE: '1' } });
    expect(sync.status().genie).toBe(true);
    expect((await sync.ask('q')).columns).toEqual(['Name', 'Hours', 'Tasks done']);
  });
});

describe('createSync', () => {
  it('is the local implementation (no Databricks, no network) without credentials', async () => {
    const store = new Store(':memory:');
    stores.push(store);
    const sync = await createSync({ env: readEnv({ DATABRICKS_SYNC: 'on' }), data: store });
    expect(sync.status()).toEqual({ databricks: false, genie: false, syncedMs: null });
    sync.record('tasks', task('e1', NOW));
    expect((await sync.teamReport('week')).source).toBe('local');
    expect((store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n).toBe(0);
  });

  it('is the Databricks implementation when configured', async () => {
    const store = new Store(':memory:');
    stores.push(store);
    const sync = await createSync({
      env: readEnv({ DATABRICKS_SYNC: 'on', DATABRICKS_HOST: fake.url, DATABRICKS_TOKEN: fake.token, DATABRICKS_WAREHOUSE_ID: 'wh1' }),
      data: store,
    });
    syncs.push(sync);
    expect(sync.status().databricks).toBe(true);
  });

  it('falls back to local with a warning when the host is not https', async () => {
    const store = new Store(':memory:');
    stores.push(store);
    const sync = await createSync({
      env: readEnv({ DATABRICKS_SYNC: 'on', DATABRICKS_HOST: 'http://example.com', DATABRICKS_TOKEN: 't', DATABRICKS_WAREHOUSE_ID: 'w' }),
      data: store,
    });
    expect(sync.status().databricks).toBe(false);
  });
});
