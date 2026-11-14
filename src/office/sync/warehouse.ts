import { api, DatabricksError, type ApiConfig } from './http.ts';
import type { Location } from './sql.ts';

export interface StatementParam {
  name: string;
  value: string | null;
  type?: string;
}

export interface StatementResult {
  columns: string[];
  rows: (string | null)[][];
}

export interface WarehouseConfig extends ApiConfig, Location {
  warehouseId: string;
  /** Pause between polls of a statement that is still running. */
  pollMs?: number;
  /** Longest a single statement may take from first request to result. */
  ceilingMs?: number;
}

interface StatementResponse {
  statement_id?: string;
  status?: { state?: string; error?: { error_code?: string; message?: string } };
  manifest?: { schema?: { columns?: { name: string }[] } };
  result?: { data_array?: (string | null)[][] };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** SQL Statement Execution API over plain fetch. Failures come back as HTTP 200 with state FAILED; those are thrown too. */
export class Warehouse {
  constructor(private cfg: WarehouseConfig) {}

  async execute(statement: string, opts: { parameters?: StatementParam[]; budgetMs?: number } = {}): Promise<StatementResult> {
    const c = this.cfg;
    const budget = opts.budgetMs ?? c.ceilingMs ?? 120_000;
    const deadline = Date.now() + budget;
    let res = await api<StatementResponse>(c, 'POST', '/api/2.0/sql/statements', {
      warehouse_id: c.warehouseId,
      statement,
      catalog: c.catalog,
      schema: c.schema,
      wait_timeout: '5s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
      ...(opts.parameters?.length ? { parameters: opts.parameters } : {}),
    });
    const id = res.statement_id;
    for (;;) {
      const state = res.status?.state;
      if (state === 'SUCCEEDED') {
        return { columns: (res.manifest?.schema?.columns ?? []).map((x) => x.name), rows: res.result?.data_array ?? [] };
      }
      if (state === 'FAILED' || state === 'CANCELED' || state === 'CLOSED') {
        const err = res.status?.error;
        throw new DatabricksError([err?.error_code, err?.message].filter(Boolean).join(': ') || `The statement ${state?.toLowerCase()}.`, 'failed');
      }
      if (!id || Date.now() + (c.pollMs ?? 1500) > deadline) {
        if (id) void api(c, 'POST', `/api/2.0/sql/statements/${encodeURIComponent(id)}/cancel`).catch(() => {});
        throw new DatabricksError('The warehouse did not answer in time.', 'timeout');
      }
      await sleep(c.pollMs ?? 1500);
      res = await api<StatementResponse>(c, 'GET', `/api/2.0/sql/statements/${encodeURIComponent(id)}`);
    }
  }
}
