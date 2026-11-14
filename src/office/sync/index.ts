import { createLocalSync } from './localSync.ts';
import type { Sync, SyncDeps } from './types.ts';

/** Local numbers unless Databricks is on and configured. The real module is imported only then; if it fails, fall back. */
export async function createSync(deps: SyncDeps): Promise<Sync> {
  const e = deps.env;
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
export { tracedQuery } from './tracing.ts';
