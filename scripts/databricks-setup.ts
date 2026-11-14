// Creates the Databricks schema and tables the app mirrors into (idempotent; safe to run again).
// Usage: npx tsx scripts/databricks-setup.ts   (reads DATABRICKS_* from .env.local or the environment)
import dotenv from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readEnv, type Env } from '../src/shared/index.ts';
import { api, DatabricksError, normaliseHost } from '../src/office/sync/http.ts';
import { ddl } from '../src/office/sync/sql.ts';
import { Warehouse } from '../src/office/sync/warehouse.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const REQUIRED = ['DATABRICKS_HOST', 'DATABRICKS_TOKEN', 'DATABRICKS_WAREHOUSE_ID'] as const;

export function missing(env: Env): string[] {
  return REQUIRED.filter((k) => !env[k]);
}

export interface SetupResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

/** Runs the DDL in order and returns one result per statement. Statements run even if an earlier one failed, so every table gets its answer. */
export async function runSetup(env: Env, log: (line: string) => void = console.log): Promise<SetupResult[]> {
  const wh = new Warehouse({
    host: normaliseHost(env.DATABRICKS_HOST),
    token: env.DATABRICKS_TOKEN,
    warehouseId: env.DATABRICKS_WAREHOUSE_ID,
    catalog: env.DATABRICKS_CATALOG,
    schema: env.DATABRICKS_SCHEMA,
    requestTimeoutMs: 30_000,
  });
  const results: SetupResult[] = [];
  for (const d of ddl({ catalog: env.DATABRICKS_CATALOG, schema: env.DATABRICKS_SCHEMA })) {
    const t0 = Date.now();
    try {
      await wh.execute(d.sql, { budgetMs: 300_000 });
      results.push({ name: d.name, ok: true, ms: Date.now() - t0 });
      log(`${d.name.padEnd(14)} ok      ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      const error = (e as Error).message;
      results.push({ name: d.name, ok: false, ms: Date.now() - t0, error });
      log(`${d.name.padEnd(14)} FAILED  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${error}`);
    }
  }
  return results;
}

export interface ExperimentInfo {
  id: string;
  name: string;
  url: string;
  created: boolean;
}

/** The MLflow experiment: the one in MLFLOW_EXPERIMENT_ID, else /Users/<token's user>/agent-manager (created if it does not exist). */
export async function ensureExperiment(env: Env, preset = process.env.MLFLOW_EXPERIMENT_ID ?? ''): Promise<ExperimentInfo> {
  const cfg = { host: normaliseHost(env.DATABRICKS_HOST), token: env.DATABRICKS_TOKEN, requestTimeoutMs: 30_000 };
  const url = (id: string) => `${cfg.host}/ml/experiments/${id}`;
  if (preset) return { id: preset, name: '(from MLFLOW_EXPERIMENT_ID)', url: url(preset), created: false };
  const me = await api<{ userName?: string }>(cfg, 'GET', '/api/2.0/preview/scim/v2/Me');
  // Some workspaces (Free Edition among them) keep home folders under an id, so /Users/<user name> may not exist; /Shared always does.
  const names = [me.userName ? `/Users/${me.userName}/agent-manager` : '', '/Shared/agent-manager'].filter(Boolean);
  let last: unknown;
  for (const name of names) {
    // An experiment that already exists wins, so running this again always finds the same one.
    const found = await api<{ experiment?: { experiment_id: string } }>(cfg, 'GET', `/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(name)}`)
      .catch(() => ({ experiment: undefined }));
    if (found.experiment) return { id: found.experiment.experiment_id, name, url: url(found.experiment.experiment_id), created: false };
    try {
      const r = await api<{ experiment_id: string }>(cfg, 'POST', '/api/2.0/mlflow/experiments/create', { name });
      return { id: r.experiment_id, name, url: url(r.experiment_id), created: true };
    } catch (e) {
      last = e;
      if (!(e instanceof DatabricksError) || !/parent directory does not exist|RESOURCE_DOES_NOT_EXIST|NOT_FOUND/i.test(e.message)) throw e;
    }
  }
  throw last instanceof Error ? last : new Error('Could not create the experiment.');
}

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  const env = readEnv();
  const gone = missing(env);
  if (gone.length) {
    console.error(`Databricks is not configured. Missing: ${gone.join(', ')}.`);
    process.exit(1);
  }
  console.log(`Setting up ${env.DATABRICKS_CATALOG}.${env.DATABRICKS_SCHEMA}`);
  const results = await runSetup(env);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `${failed.length} of ${results.length} statements failed.` : `All ${results.length} statements succeeded.`);
  let code = failed.length ? 1 : 0;
  try {
    const x = await ensureExperiment(env);
    console.log(`\nMLflow experiment ${x.created ? 'created' : 'found'}: ${x.name}`);
    console.log(`MLFLOW_EXPERIMENT_ID=${x.id}`);
    console.log(`Experiment page: ${x.url}`);
    if (!process.env.MLFLOW_EXPERIMENT_ID) console.log('Put the MLFLOW_EXPERIMENT_ID line in .env.local to turn tracing on.');
  } catch (e) {
    console.log(`\nMLflow experiment: FAILED ${(e as Error).message}`);
    code = 1;
  }
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
