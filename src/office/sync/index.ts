import { createLocalSync } from './localSync.ts';
import { warmTracing } from './tracing.ts';
import type { Sync, SyncDeps } from './types.ts';

/** Local numbers unless Databricks is on and configured. The real module is imported only then; if it fails, fall back. */
export async function createSync(deps: SyncDeps): Promise<Sync> {
  const e = deps.env;
  // A mock office (scripted employees) holds test data. It never mirrors to the real workspace or traces,
  // unless a test asks for it explicitly with DATABRICKS_SYNC_MOCK=1.
  const mockOnly = e.MOCK_LLM && process.env.DATABRICKS_SYNC_MOCK !== '1';
  if (mockOnly) return createLocalSync(deps);
  await warmTracing(e as unknown as Record<string, string | undefined>).catch(() => {});
  if (e.DATABRICKS_SYNC === 'on' && e.DATABRICKS_HOST && e.DATABRICKS_TOKEN && e.DATABRICKS_WAREHOUSE_ID) {
    try {
      const mod = await import('./databricks.ts');
      return mod.createDatabricksSync(deps);
    } catch (err) {
      console.warn('[sync] Databricks sync unavailable, using local numbers:', (err as Error).message);
    }
  }
  return createLocalSync(deps);
}

export type { Sync, SyncDeps, SyncStatus, SyncTable, TeamData } from './types.ts';
export { SyncError } from './types.ts';
export { experimentUrl, tracedQuery } from './tracing.ts';
