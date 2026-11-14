import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A small in-process stand-in for the Databricks REST endpoints the sync uses (tests and offline runs; production code never imports it):
 * the SQL Statement Execution API (sync result, async polling by statement id, FAILED states) and the three Genie Conversation endpoints.
 * It understands the MERGE statements the sync builds (it parses the inlined VALUES) and answers the team-report aggregate from them.
 */

type Cell = string | number | null;
export type FakeRow = Record<string, Cell>;

export interface FakeOptions {
  token?: string;
  /** Added to every response. */
  latencyMs?: number;
  /** Statements answer PENDING this many times (counted per statement) before they succeed. */
  pendingPolls?: number;
  /** The Genie message stays in a working state for this many polls. */
  geniePolls?: number;
  genieSpaceId?: string;
  /** Genie answers with this text, SQL and table. */
  genie?: { text?: string; sql?: string; columns?: string[]; rows?: unknown[][]; fail?: boolean };
}

export interface FakeRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

export interface FakeDatabricks {
  url: string;
  token: string;
  options: Required<Pick<FakeOptions, 'latencyMs' | 'pendingPolls' | 'geniePolls'>> & FakeOptions;
  requests: FakeRequest[];
  /** Statement texts received, oldest first. */
  statements: string[];
  tables: Map<string, Map<string, FakeRow>>;
  /** Make the next n statement requests answer with this HTTP status. */
  failNext(n: number, status?: number): void;
  /** Every statement request answers with this HTTP status until set to null. */
  failAll(status: number | null): void;
  /** Statements fail with state FAILED and this message until set to null; `match` limits it to statements whose text matches. */
  failStatements(message: string | null, match?: RegExp): void;
  /** Merges fail with TABLE_OR_VIEW_NOT_FOUND until a CREATE TABLE has been seen. */
  requireTables(on: boolean): void;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function unescapeString(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const n = src[++i];
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === '0') out += '\0';
    else if (n === 'u') {
      out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16));
      i += 4;
    } else out += n;
  }
  return out;
}

/** Reads one cell of the VALUES list starting at `i`; returns the value and the index after it. */
function readCell(sql: string, i: number): [Cell, number] {
  if (sql[i] === "'") {
    let j = i + 1;
    let raw = '';
    for (; j < sql.length; j++) {
      if (sql[j] === '\\') {
        raw += sql[j] + sql[j + 1];
        j++;
      } else if (sql[j] === "'") break;
      else raw += sql[j];
    }
    return [unescapeString(raw), j + 1];
  }
  let depth = 0;
  let j = i;
  for (; j < sql.length; j++) {
    if (sql[j] === '(') depth++;
    else if (sql[j] === ')') {
      if (depth === 0) break;
      depth--;
    } else if (sql[j] === ',' && depth === 0) break;
  }
  const text = sql.slice(i, j).trim();
  if (/^CAST\(NULL AS /i.test(text)) return [null, j];
  const m = /^(?:CAST\(|timestamp_millis\()(-?[0-9.eE+-]+)/.exec(text);
  return [m ? Number(m[1]) : null, j];
}

/** Parses the MERGE the sync builds into its table name, key, mode and rows. */
export function parseMerge(sql: string): { table: string; key: string; update: boolean; rows: FakeRow[] } | null {
  const head = /^MERGE INTO `[^`]+`\.`[^`]+`\.`([^`]+)` AS t\nUSING \(SELECT \* FROM VALUES\n/.exec(sql);
  if (!head) return null;
  const tail = sql.lastIndexOf('\n  AS v(');
  const colsM = /^\n {2}AS v\((.*)\)\) AS s\nON t\.`([^`]+)` = s\./.exec(sql.slice(tail));
  if (!colsM) return null;
  const cols = [...colsM[1].matchAll(/`((?:[^`]|``)+)`/g)].map((m) => m[1].replace(/``/g, '`'));
  const body = sql.slice(head[0].length, tail);
  const rows: FakeRow[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && body[i] !== '(') i++;
    if (i >= body.length) break;
    i++;
    const row: FakeRow = {};
    for (const c of cols) {
      while (body[i] === ' ' || body[i] === ',') i++;
      const [v, next] = readCell(body, i);
      row[c] = v;
      i = next;
    }
    while (i < body.length && body[i] !== ')') i++;
    i++;
    rows.push(row);
  }
  return { table: head[1], key: colsM[2], update: /WHEN MATCHED THEN UPDATE SET \*/.test(sql), rows };
}

export async function startFakeDatabricks(opts: FakeOptions = {}): Promise<FakeDatabricks> {
  const token = opts.token ?? 'dapi-test-token';
  const options: FakeDatabricks['options'] = { latencyMs: 0, pendingPolls: 0, geniePolls: 0, genieSpaceId: 'space1', ...opts };
  const requests: FakeRequest[] = [];
  const statements: string[] = [];
  const tables = new Map<string, Map<string, FakeRow>>();
  const results = new Map<string, { polls: number; answer: Record<string, unknown> }>();
  const genieMsgs = new Map<string, { polls: number }>();
  let failN = 0;
  let failStatus = 500;
  let failAllStatus: number | null = null;
  let failMessage: string | null = null;
  let failMatch: RegExp | null = null;
  let needTables = false;
  let tablesCreated = false;
  let nextId = 1;

  function aggregate(params: { name: string; value: string }[]): { columns: string[]; rows: string[][] } {
    const p = Object.fromEntries(params.map((x) => [x.name, Number(x.value)]));
    const agg = new Map<string, { tasks: number; active: number; done: number; failed: number; cost: number }>();
    for (const t of tables.get('tasks')?.values() ?? []) {
      const at = Number(t.finished_ms ?? t.assigned_ms);
      if (at < p.prev_start_ms || at >= p.end_ms) continue;
      const k = `${t.employee_id}|${at >= p.start_ms ? 'cur' : 'prev'}`;
      const a = agg.get(k) ?? { tasks: 0, active: 0, done: 0, failed: 0, cost: 0 };
      a.tasks++;
      a.active += Number(t.active_ms ?? 0);
      a.done += t.status === 'done' ? 1 : 0;
      a.failed += t.status === 'failed' ? 1 : 0;
      a.cost += Number(t.cost_usd ?? 0);
      agg.set(k, a);
    }
    return {
      columns: ['employee_id', 'period', 'tasks', 'active_ms', 'tasks_done', 'tasks_failed', 'cost_usd'],
      rows: [...agg].map(([k, a]) => {
        const [emp, period] = k.split('|');
        return [emp, period, String(a.tasks), String(a.active), String(a.done), String(a.failed), String(a.cost)];
      }),
    };
  }

  function runStatement(body: Record<string, unknown>): { error?: string; columns?: string[]; rows?: string[][] } {
    const sql = String(body.statement ?? '');
    statements.push(sql);
    if (failMessage && (!failMatch || failMatch.test(sql))) return { error: failMessage };
    if (/^CREATE TABLE/i.test(sql)) tablesCreated = true;
    const merge = parseMerge(sql);
    if (merge) {
      if (needTables && !tablesCreated) return { error: 'TABLE_OR_VIEW_NOT_FOUND: The table or view cannot be found.' };
      const t = tables.get(merge.table) ?? new Map<string, FakeRow>();
      tables.set(merge.table, t);
      for (const r of merge.rows) {
        const k = String(r[merge.key]);
        if (t.has(k) && !merge.update) continue;
        t.set(k, r);
      }
      return { columns: ['num_affected_rows'], rows: [[String(merge.rows.length)]] };
    }
    if (/GROUP BY 1, 2/.test(sql)) return aggregate((body.parameters as { name: string; value: string }[]) ?? []);
    const count = /^SELECT COUNT\(\*\)(?:, COUNT\(DISTINCT (\w+)\))? FROM `[^`]+`\.`[^`]+`\.`(\w+)`(?: WHERE (\w+) IN \((.*)\))?$/.exec(sql);
    if (count) {
      const ids = count[4] ? [...count[4].matchAll(/'([^']*)'/g)].map((m) => m[1]) : null;
      const rows = [...(tables.get(count[2])?.values() ?? [])].filter((r) => !ids || ids.includes(String(r[count[3]])));
      return { columns: ['count'], rows: [count[1] ? [String(rows.length), String(new Set(rows.map((r) => r[count[1]])).size)] : [String(rows.length)]] };
    }
    const del = /^DELETE FROM `[^`]+`\.`[^`]+`\.`(\w+)` WHERE (\w+) IN \((.*)\)$/.exec(sql);
    if (del) {
      const ids = [...del[3].matchAll(/'([^']*)'/g)].map((m) => m[1]);
      const t = tables.get(del[1]);
      for (const [k, r] of t ?? []) if (ids.includes(String(r[del[2]]))) t!.delete(k);
      return { columns: ['num_affected_rows'], rows: [['0']] };
    }
    if (/^SELECT 1/i.test(sql)) return { columns: ['1'], rows: [['1']] };
    return { columns: [], rows: [] };
  }

  function statementJson(id: string, state: string, out?: ReturnType<typeof runStatement>) {
    if (state === 'FAILED') return { statement_id: id, status: { state, error: { error_code: 'BAD_REQUEST', message: out?.error } } };
    if (state !== 'SUCCEEDED') return { statement_id: id, status: { state } };
    return {
      statement_id: id,
      status: { state },
      manifest: { schema: { columns: (out?.columns ?? []).map((name) => ({ name })) } },
      result: { data_array: out?.rows ?? [] },
    };
  }

  function genieMessage(cid: string, mid: string, polls: number) {
    const g = options.genie ?? {};
    const state = g.fail ? 'FAILED' : polls <= options.geniePolls ? (polls === 1 ? 'ASKING_AI' : 'EXECUTING_QUERY') : 'COMPLETED';
    const base = { id: mid, message_id: mid, conversation_id: cid, space_id: options.genieSpaceId, status: state };
    if (state !== 'COMPLETED') return base;
    return {
      ...base,
      attachments: [
        { attachment_id: 'att-text', text: { content: g.text ?? 'Maya worked the most this week.' } },
        { attachment_id: 'att-query', query: { query: g.sql ?? 'SELECT name, SUM(active_ms) FROM tasks GROUP BY name', description: 'Active time per person' } },
      ],
    };
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const url = (req.url ?? '').split('?')[0];
    const method = req.method ?? 'GET';
    let body: Record<string, unknown> | null = null;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      /* ignored */
    }
    requests.push({ method, path: url, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (options.latencyMs) await sleep(options.latencyMs);
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error_code: 'UNAUTHENTICATED', message: 'Invalid access token.' });

    if (method === 'POST' && url === '/api/2.0/sql/statements') {
      if (failAllStatus !== null) return send(failAllStatus, { error_code: 'INTERNAL_ERROR', message: 'fake failure' });
      if (failN > 0) {
        failN--;
        return send(failStatus, { error_code: 'INTERNAL_ERROR', message: 'fake failure' });
      }
      const id = `st-${nextId++}`;
      const out = runStatement(body ?? {});
      const final = out.error ? 'FAILED' : 'SUCCEEDED';
      if (options.pendingPolls > 0 && !out.error) {
        results.set(id, { polls: 0, answer: statementJson(id, 'SUCCEEDED', out) });
        return send(200, statementJson(id, 'PENDING'));
      }
      return send(200, statementJson(id, final, out));
    }
    const poll = /^\/api\/2\.0\/sql\/statements\/([^/]+)$/.exec(url);
    if (method === 'GET' && poll) {
      const r = results.get(poll[1]);
      if (!r) return send(404, { error_code: 'RESOURCE_DOES_NOT_EXIST', message: 'No such statement.' });
      r.polls++;
      return send(200, r.polls >= options.pendingPolls ? r.answer : statementJson(poll[1], 'RUNNING'));
    }
    if (method === 'POST' && /^\/api\/2\.0\/sql\/statements\/[^/]+\/cancel$/.test(url)) return send(200, {});

    const g = new RegExp(`^/api/2\\.0/genie/spaces/${options.genieSpaceId}(/.*)$`).exec(url);
    if (g) {
      const rest = g[1];
      if (method === 'POST' && rest === '/start-conversation') {
        const cid = `conv-${nextId++}`;
        const mid = `msg-${nextId++}`;
        genieMsgs.set(`${cid}/${mid}`, { polls: 0 });
        return send(200, { conversation_id: cid, message_id: mid, conversation: { id: cid }, message: { id: mid, conversation_id: cid } });
      }
      let m = /^\/conversations\/([^/]+)\/messages$/.exec(rest);
      if (method === 'POST' && m) {
        const mid = `msg-${nextId++}`;
        genieMsgs.set(`${m[1]}/${mid}`, { polls: 0 });
        return send(200, { id: mid, message_id: mid, conversation_id: m[1] });
      }
      m = /^\/conversations\/([^/]+)\/messages\/([^/]+)$/.exec(rest);
      if (method === 'GET' && m) {
        const s = genieMsgs.get(`${m[1]}/${m[2]}`);
        if (!s) return send(404, { error_code: 'RESOURCE_DOES_NOT_EXIST', message: 'No such message.' });
        s.polls++;
        return send(200, genieMessage(m[1], m[2], s.polls));
      }
      m = /^\/conversations\/([^/]+)\/messages\/([^/]+)\/attachments\/([^/]+)\/query-result$/.exec(rest);
      if (method === 'GET' && m) {
        const q = options.genie ?? {};
        const columns = q.columns ?? ['name', 'hours'];
        const rows = q.rows ?? [['Maya Okafor', 3.5], ['Priya Raman', 1.25]];
        return send(200, { statement_response: { statement_id: 'g1', status: { state: 'SUCCEEDED' }, manifest: { schema: { columns: columns.map((name) => ({ name })) } }, result: { data_array: rows } } });
      }
    }
    return send(404, { error_code: 'ENDPOINT_NOT_FOUND', message: `No route ${method} ${url}` });
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      res.writeHead(500);
      res.end(String(e));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    options,
    requests,
    statements,
    tables,
    failNext(n, status = 500) {
      failN = n;
      failStatus = status;
    },
    failAll(status) {
      failAllStatus = status;
    },
    failStatements(message, match) {
      failMessage = message;
      failMatch = match ?? null;
    },
    requireTables(on) {
      needTables = on;
      tablesCreated = false;
    },
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}
