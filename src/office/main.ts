import { mkdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { readEnv } from '../shared/index.ts';
import { Bus } from './bus.ts';
import { createCalls } from './calls/index.ts';
import { Office } from './employees/office.ts';
import { createRuntimeFactory } from './runtime/index.ts';
import { buildServer } from './routes/server.ts';
import { createHostDriver, createSpaces } from './spaces/index.ts';
import { Store } from './store/store.ts';
import { createSync } from './sync/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

export interface BootOptions {
  /** Defaults to the process environment after loading .env.local. */
  env?: ReturnType<typeof readEnv>;
  /** ':memory:' for tests. */
  dbFile?: string;
  /** Tests: replace the runtime factory. */
  createRuntime?: Awaited<ReturnType<typeof createRuntimeFactory>>;
}

export async function createOffice(opts: BootOptions = {}) {
  const env = opts.env ?? readEnv();
  const dataDir = path.isAbsolute(env.DATA_DIR) ? env.DATA_DIR : path.resolve(ROOT, env.DATA_DIR);
  mkdirSync(dataDir, { recursive: true });
  const store = new Store(opts.dbFile ?? path.join(dataDir, 'office.db'));
  const bus = new Bus();
  const spaces = await createSpaces({ dataDir, env });
  const hostDriver = await createHostDriver({ dataDir, env });
  const createRuntime = opts.createRuntime ?? (await createRuntimeFactory(env));
  const sync = await createSync({ env, data: store });
  const office = new Office({ env, store, bus, spaces, hostDriver, createRuntime, sync, dataDir });
  const calls = await createCalls(env, office.callsHost());
  office.attachCalls(calls);
  return { office, env, dataDir };
}

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  const { office, env, dataDir } = await createOffice();
  office.boot();
  await office.sync.boot();
  await office.calls.boot();
  const app = await buildServer(office);
  await app.listen({ host: '127.0.0.1', port: env.OFFICE_PORT });
  console.log(`[office] listening on http://127.0.0.1:${env.OFFICE_PORT} (data ${dataDir}, desktops ${env.DESKTOPS}, mock llm ${env.MOCK_LLM})`);

  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close().catch(() => {});
    await office.shutdown().catch(() => {});
    office.store.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('main.ts')) {
  main().catch((err) => {
    console.error('[office] could not start:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
