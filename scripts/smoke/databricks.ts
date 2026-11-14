// Proves the Databricks integration end to end: creates the tables, syncs a small synthetic team, reads the team report back from the
// warehouse, asks Genie one question and checks the MLflow experiment, with timings. Synthetic rows are deleted afterwards (--keep keeps them).
// Usage: npx tsx scripts/smoke/databricks.ts [--keep] [--fake]
//   --fake starts the in-process fake Databricks and points the run at it (a dry run that needs no credentials).
import dotenv from 'dotenv';
import path from 'node:path';
import type { ActivityStep, Employee, Message, Task } from '../../src/shared/index.ts';
import { readEnv, type Env } from '../../src/shared/index.ts';
import { createDatabricksSync } from '../../src/office/sync/databricks.ts';
import { startFakeDatabricks } from '../../src/office/sync/fakeDatabricks.ts';
import { normaliseHost } from '../../src/office/sync/http.ts';
import { tracedQuery, warmTracing } from '../../src/office/sync/tracing.ts';
import { computeTeamReport } from '../../src/office/sync/team.ts';
import { quoteIdent } from '../../src/office/sync/sql.ts';
import { Warehouse } from '../../src/office/sync/warehouse.ts';
import { Store } from '../../src/office/store/store.ts';
import { ensureExperiment, missing, runSetup } from '../databricks-setup.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DAY = 86_400_000;
const keep = process.argv.includes('--keep');
const fakeMode = process.argv.includes('--fake');
const countsIdx = process.argv.indexOf('--counts');

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const results: { step: string; ok: boolean; detail: string }[] = [];
async function step(name: string, fn: () => Promise<string>): Promise<boolean> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ step: name, ok: true, detail: `${detail} (${secs(Date.now() - t0)})` });
  } catch (e) {
    results.push({ step: name, ok: false, detail: `${(e as Error).message} (${secs(Date.now() - t0)})` });
  }
  const r = results[results.length - 1];
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.step}: ${r.detail}`);
  return r.ok;
}

function person(id: string, name: string): Employee {
  return {
    id,
    persona: { name, firstName: name.split(' ')[0], role: 'Smoke test', roleKey: 'custom', personality: '', workingStyle: '', starters: [], portraitUrl: '', voice: { provider: 'livekit', voiceId: '', label: '', sampleUrl: null }, avatarId: null },
    permissions: { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true },
    state: 'idle', stateDetail: '', stateSinceMs: 0, spaceId: null, sessionId: null, model: 'smoke', unread: 0, lastActivityMs: Date.now(), screenGrant: null,
    desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: Date.now(),
  };
}

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  let fake: Awaited<ReturnType<typeof startFakeDatabricks>> | null = null;
  let env: Env = readEnv();
  if (fakeMode) {
    fake = await startFakeDatabricks();
    env = readEnv({ ...process.env, DATABRICKS_SYNC: 'on', DATABRICKS_HOST: fake.url, DATABRICKS_TOKEN: fake.token, DATABRICKS_WAREHOUSE_ID: 'fake', DATABRICKS_GENIE_SPACE_ID: 'space1' });
    console.log('Dry run against the in-process fake Databricks.');
  } else {
    const gone = missing(env);
    if (gone.length) {
      console.error(`Databricks is not configured. Missing: ${gone.join(', ')}. Nothing was run.`);
      process.exit(2);
    }
  }
  const loc = { catalog: env.DATABRICKS_CATALOG, schema: env.DATABRICKS_SCHEMA };
  const wh = new Warehouse({ host: normaliseHost(env.DATABRICKS_HOST), token: env.DATABRICKS_TOKEN, warehouseId: env.DATABRICKS_WAREHOUSE_ID, ...loc, requestTimeoutMs: 30_000 });

  if (countsIdx >= 0) {
    // Compare the Delta tables with a local office database: node scripts/smoke/databricks.ts --counts data-w8/office.db
    const local = new Store(path.resolve(ROOT, process.argv[countsIdx + 1] ?? 'data/office.db'));
    const rowsOf = (sql: string) => local.db.prepare(sql).all() as Record<string, string>[];
    const n = (sql: string) => (local.db.prepare(sql).get() as { n: number }).n;
    const empIds = rowsOf('SELECT id FROM employees').map((r) => r.id);
    const list = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(', ');
    // The workspace may hold other offices' rows too, so only rows that belong to this database are counted.
    const checks: { table: string; keyCol: string; where: string; ids: string[]; want: number }[] = [
      { table: 'employees', keyCol: 'employee_id', where: 'employee_id', ids: empIds, want: empIds.length },
      { table: 'tasks', keyCol: 'task_id', where: 'task_id', ids: rowsOf('SELECT id FROM tasks').map((r) => r.id), want: n('SELECT COUNT(*) AS n FROM tasks') },
      { table: 'events', keyCol: 'event_id', where: 'event_id', ids: rowsOf('SELECT id FROM steps').map((r) => r.id), want: n('SELECT COUNT(*) AS n FROM steps') },
      { table: 'messages', keyCol: 'message_id', where: 'message_id', ids: rowsOf('SELECT id FROM messages').map((r) => r.id), want: n('SELECT COUNT(*) AS n FROM messages') },
      { table: 'usage', keyCol: 'usage_id', where: 'employee_id', ids: empIds, want: n('SELECT COUNT(*) AS n FROM usage') },
    ];
    const pending = n('SELECT COUNT(*) AS n FROM outbox WHERE sent_ms IS NULL');
    let bad = 0;
    for (const c of checks) {
      const t0 = Date.now();
      const r = await wh.execute(`SELECT COUNT(*), COUNT(DISTINCT ${c.keyCol}) FROM ${quoteIdent(loc.catalog)}.${quoteIdent(loc.schema)}.${quoteIdent(c.table)} WHERE ${c.where} IN (${list(c.ids)})`, { budgetMs: 300_000 });
      const [rows, distinct] = r.rows[0].map(Number);
      const ok = rows === c.want && distinct === c.want;
      if (!ok) bad++;
      console.log(`${ok ? 'MATCH   ' : 'DIFFER  '}${c.table.padEnd(10)} local ${c.want}  delta rows ${rows}  distinct keys ${distinct}  (${secs(Date.now() - t0)})`);
    }
    console.log(`outbox rows still queued locally: ${pending}`);
    local.close();
    process.exit(bad || pending ? 1 : 0);
  }

  await step('warehouse answers SELECT 1', async () => {
    const r = await wh.execute('SELECT current_catalog() AS c, current_schema() AS s', { budgetMs: 300_000 });
    return `catalog ${r.rows[0]?.[0]}, default schema ${r.rows[0]?.[1]}`;
  });

  await step('create schema and tables', async () => {
    const r = await runSetup(env, () => {});
    const bad = r.filter((x) => !x.ok);
    if (bad.length) throw new Error(bad.map((b) => `${b.name}: ${b.error}`).join('; '));
    return `${r.length} statements`;
  });

  const tag = `smoke_${Date.now().toString(36)}`;
  const store = new Store(':memory:');
  const opts = { timing: { stopFlushMs: 300_000, reportBudgetMs: 120_000, requestTimeoutMs: 30_000 } };
  const writer = createDatabricksSync({ env, data: store }, opts);
  store.onWrite = (t, r) => writer.record(t, r);
  const ids = { emps: [`${tag}_a`, `${tag}_b`], tasks: [] as string[], messages: [] as string[], steps: [] as string[] };
  const made = { tasks: [] as Task[], messages: [] as Message[], steps: [] as ActivityStep[] };
  const now = Date.now();
  store.insertEmployee(person(ids.emps[0], 'Smoke Ada'));
  store.insertEmployee(person(ids.emps[1], 'Smoke Bo'));
  for (let i = 0; i < 6; i++) {
    const t: Task = {
      id: `${tag}_t${i}`, employeeId: ids.emps[i % 2], title: `Smoke task ${i}`, assignedBy: 'user', status: i === 5 ? 'failed' : 'done', plan: [], outcome: i === 5 ? 'Synthetic failure' : 'Synthetic result',
      assignedMs: now - i * DAY - 3_600_000, finishedMs: now - i * DAY, activeMs: 900_000 * (i + 1), costUsd: 0.05 * (i + 1), inputTokens: 100, outputTokens: 50, numTurns: 2, traceId: null,
    };
    ids.tasks.push(t.id);
    made.tasks.push(t);
    store.upsertTask(t);
    const mid = `${tag}_m${i}`;
    ids.messages.push(mid);
    const m: Message = { id: mid, employeeId: t.employeeId, from: 'user', kind: 'text', text: `Smoke message ${i}`, taskId: t.id, createdMs: now - i * DAY, seenMs: null };
    made.messages.push(m);
    store.insertMessage(m);
    const sid = `${tag}_s${i}`;
    ids.steps.push(sid);
    const st: ActivityStep = { id: sid, employeeId: t.employeeId, taskId: t.id, sentence: `Smoke step ${i}`, status: 'ok', startedMs: now - i * DAY, endedMs: now - i * DAY + 2000 };
    made.steps.push(st);
    store.upsertStep(st);
    store.addUsage({ employeeId: t.employeeId, taskId: t.id, tsMs: now - i * DAY, costUsd: 0.05 * (i + 1), inputTokens: 100, outputTokens: 50 });
  }

  await step('sync 2 employees, 6 tasks, 6 messages, 6 steps, 6 usage rows', async () => {
    await writer.stop();
    const left = (store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n;
    if (left > 0) throw new Error(`${left} rows are still queued`);
    return 'outbox empty';
  });

  const reader = createDatabricksSync({ env, data: store }, opts);
  await step('team report read back from the warehouse matches the local numbers', async () => {
    const r = await reader.teamReport('month');
    if (r.source !== 'databricks') throw new Error('the report came from the local fallback');
    const local = computeTeamReport(store, 'month');
    const same = JSON.stringify(r.rows.map((x) => [x.employeeId, x.activeMs, x.tasksDone, x.tasksFailed, +x.costUsd.toFixed(6)])) ===
      JSON.stringify(local.rows.map((x) => [x.employeeId, x.activeMs, x.tasksDone, x.tasksFailed, +x.costUsd.toFixed(6)]));
    if (!same) throw new Error(`rows differ: warehouse ${JSON.stringify(r.rows.map((x) => x.activeMs))}, local ${JSON.stringify(local.rows.map((x) => x.activeMs))}`);
    return `source databricks, ${r.rows.length} rows, ${r.totals.tasksDone} done`;
  });

  await step('team report again (another range, warm)', async () => {
    const r = await reader.teamReport('week');
    if (r.source !== 'databricks') throw new Error('the report came from the local fallback');
    return `source databricks, ${r.totals.tasksDone} done`;
  });

  await step('a second sync of the same rows changes nothing', async () => {
    const again = createDatabricksSync({ env, data: store }, opts);
    for (const t of made.tasks) again.record('tasks', t);
    for (const m of made.messages) again.record('messages', m);
    for (const x of made.steps) again.record('steps', x);
    for (const e of ids.emps) again.record('employees', store.getEmployee(e));
    await again.stop();
    const count = async (t: string, col: string, xs: string[]) => Number((await wh.execute(`SELECT COUNT(*) FROM ${quoteIdent(loc.catalog)}.${quoteIdent(loc.schema)}.${quoteIdent(t)} WHERE ${col} IN (${xs.map((x) => `'${x}'`).join(', ')})`, { budgetMs: 300_000 })).rows[0][0]);
    const got = { employees: await count('employees', 'employee_id', ids.emps), tasks: await count('tasks', 'task_id', ids.tasks), events: await count('events', 'event_id', ids.steps), messages: await count('messages', 'message_id', ids.messages) };
    const want = { employees: 2, tasks: 6, events: 6, messages: 6 };
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`row counts after the second sync: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    return `row counts unchanged: ${JSON.stringify(got)}`;
  });

  if (env.DATABRICKS_GENIE_SPACE_ID) {
    await step('ask Genie one question', async () => {
      const a = await reader.ask('Who spent the most this month?');
      return `answer "${a.answer.slice(0, 80)}", sql ${a.sql ? 'yes' : 'no'}, ${a.rows.length} rows`;
    });
  } else console.log('SKIP ask Genie: DATABRICKS_GENIE_SPACE_ID is not set');

  if (!fakeMode) {
    await step('MLflow: a traced session shows up in the experiment', async () => {
      const x = await ensureExperiment(env);
      const traceEnv = { ...process.env, DATABRICKS_HOST: env.DATABRICKS_HOST, DATABRICKS_TOKEN: env.DATABRICKS_TOKEN, MLFLOW_TRACKING_URI: env.MLFLOW_TRACKING_URI || 'databricks', MLFLOW_EXPERIMENT_ID: x.id };
      await warmTracing(traceEnv);
      // A stand-in for the Agent SDK query: the same message sequence, no model call.
      const stub = (_params: { prompt: string }) => (async function* () {
        yield { type: 'system', subtype: 'init', session_id: `smoke-${tag}`, model: 'smoke-model' };
        yield { type: 'assistant', message: { model: 'smoke-model', content: [{ type: 'text', text: 'Smoke trace answer.' }], usage: { input_tokens: 10, output_tokens: 5 } } };
        yield { type: 'result', subtype: 'success', result: 'Smoke trace answer.', is_error: false, duration_ms: 5, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 10, output_tokens: 5 } };
      })();
      const q = tracedQuery(stub);
      if (q === stub) throw new Error('tracedQuery returned the plain query (MLflow did not load)');
      await new Promise((r) => setTimeout(r, 300));
      for await (const m of q({ prompt: `smoke ${tag}` }) as AsyncIterable<unknown>) void m;
      const core = await import('@mlflow/core');
      const client = new core.MlflowClient({ trackingUri: traceEnv.MLFLOW_TRACKING_URI, authProvider: core.createAuthProvider({ trackingUri: traceEnv.MLFLOW_TRACKING_URI }) });
      const t0 = Date.now();
      for (;;) {
        const r = await client.searchTraces({
          locations: [{ type: core.TraceLocationType.MLFLOW_EXPERIMENT, mlflowExperiment: { experimentId: x.id } }],
          maxResults: 5, orderBy: ['timestamp_ms DESC'], includeSpans: false,
        });
        if (r.traces.length) return `${r.traces.length} trace(s) listed in experiment ${x.id} after ${secs(Date.now() - t0)}; ${x.url}`;
        if (Date.now() - t0 > 60_000) throw new Error('the trace was sent but is not listed after 60 s');
        await new Promise((r2) => setTimeout(r2, 3000));
      }
    });
  } else console.log('SKIP MLflow trace: fake mode');

  if (!keep) {
    await step('delete the synthetic rows', async () => {
      const list = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');
      const del = (t: string, col: string, xs: string[]) => wh.execute(`DELETE FROM ${quoteIdent(loc.catalog)}.${quoteIdent(loc.schema)}.${quoteIdent(t)} WHERE ${col} IN (${list(xs)})`, { budgetMs: 300_000 });
      await del('employees', 'employee_id', ids.emps);
      await del('tasks', 'task_id', ids.tasks);
      await del('events', 'event_id', ids.steps);
      await del('messages', 'message_id', ids.messages);
      await del('usage', 'employee_id', ids.emps);
      return 'removed';
    });
  }

  await reader.stop();
  store.close();
  await fake?.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} steps failed.` : `All ${results.length} steps passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
