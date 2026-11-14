import type { TeamAskResponse } from '../../shared/index.ts';
import { api, DatabricksError, type ApiConfig } from './http.ts';
import { SyncError } from './types.ts';

export interface GenieConfig extends ApiConfig {
  spaceId: string;
  /** Pause between polls of the message. */
  pollMs?: number;
  /** Longest wait for an answer. */
  capMs?: number;
  /** Questions allowed per window. */
  perWindow?: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface GenieMessage {
  id?: string;
  message_id?: string;
  conversation_id?: string;
  status?: string;
  error?: { error?: string; message?: string; type?: string };
  attachments?: {
    attachment_id?: string;
    text?: { content?: string };
    query?: { query?: string; description?: string; title?: string };
  }[];
}

interface StartResponse extends GenieMessage {
  message?: GenieMessage;
}

interface QueryResult {
  statement_response?: QueryStatement;
  manifest?: QueryStatement['manifest'];
  result?: QueryStatement['result'];
}
interface QueryStatement {
  manifest?: { schema?: { columns?: { name: string }[] } };
  result?: { data_array?: unknown[][] };
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DONE = new Set(['COMPLETED']);
const BAD = new Set(['FAILED', 'CANCELLED', 'QUERY_RESULT_EXPIRED']);
const MAX_ROWS = 20;

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Genie Conversation API: start or continue a conversation, poll until the answer is complete, fetch the query result. */
export function createGenieClient(cfg: GenieConfig) {
  const now = cfg.now ?? Date.now;
  const sleep = cfg.sleep ?? realSleep;
  const asked: number[] = [];
  const base = `/api/2.0/genie/spaces/${encodeURIComponent(cfg.spaceId)}`;

  function limit(): void {
    const windowMs = cfg.windowMs ?? 60_000;
    const t = now();
    while (asked.length && t - asked[0] >= windowMs) asked.shift();
    if (asked.length >= (cfg.perWindow ?? 5)) {
      throw new SyncError(429, 'rate_limited', 'Ask is limited to five questions a minute. Try again in a moment.');
    }
    asked.push(t);
  }

  async function run(question: string, conversationId?: string): Promise<TeamAskResponse> {
    const started = conversationId
      ? await api<StartResponse>(cfg, 'POST', `${base}/conversations/${encodeURIComponent(conversationId)}/messages`, { content: question })
      : await api<StartResponse>(cfg, 'POST', `${base}/start-conversation`, { content: question });
    const cid = started.conversation_id ?? started.message?.conversation_id ?? conversationId;
    const mid = started.message_id ?? started.id ?? started.message?.id ?? started.message?.message_id;
    if (!cid || !mid) throw new DatabricksError('Genie did not return a conversation.', 'http');

    const deadline = now() + (cfg.capMs ?? 45_000);
    let msg: GenieMessage = {};
    for (;;) {
      msg = await api<GenieMessage>(cfg, 'GET', `${base}/conversations/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`);
      if (msg.status && DONE.has(msg.status)) break;
      if (msg.status && BAD.has(msg.status)) {
        throw new SyncError(502, 'genie_failed', 'Genie could not answer that. Try asking it another way.');
      }
      if (now() + (cfg.pollMs ?? 2000) > deadline) {
        throw new SyncError(504, 'genie_timeout', 'Genie took too long to answer. Try a simpler question.');
      }
      await sleep(cfg.pollMs ?? 2000);
    }

    const atts = msg.attachments ?? [];
    const text = atts.find((a) => a.text?.content)?.text?.content;
    const q = atts.find((a) => a.query?.query);
    let columns: string[] = [];
    let rows: string[][] = [];
    if (q?.attachment_id) {
      try {
        const r = await api<QueryResult>(cfg, 'GET', `${base}/conversations/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}/attachments/${encodeURIComponent(q.attachment_id)}/query-result`);
        const st = r.statement_response ?? r;
        columns = (st.manifest?.schema?.columns ?? []).map((c) => c.name);
        rows = (st.result?.data_array ?? []).slice(0, MAX_ROWS).map((row) => row.map(cell));
      } catch {
        // The answer and the query are still worth showing without the table.
      }
    }
    return {
      answer: text ?? q?.query?.description ?? (rows.length ? 'Here is what I found.' : 'Genie had no answer for that.'),
      sql: q?.query?.query ?? null,
      columns,
      rows,
      conversationId: cid,
    };
  }

  return {
    async ask(question: string, conversationId?: string): Promise<TeamAskResponse> {
      limit();
      try {
        return await run(question, conversationId);
      } catch (e) {
        if (e instanceof SyncError) throw e;
        if (e instanceof DatabricksError && e.kind === 'auth') throw new SyncError(502, 'genie_failed', 'Databricks refused the saved token. Check it in the Databricks settings.');
        if (e instanceof DatabricksError && e.kind === 'timeout') throw new SyncError(504, 'genie_timeout', 'Genie took too long to answer. Try a simpler question.');
        throw new SyncError(502, 'genie_failed', 'Genie is not reachable right now. Try again in a moment.');
      }
    },
  };
}

export type GenieClient = ReturnType<typeof createGenieClient>;
