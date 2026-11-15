import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFakeDatabricks, type FakeDatabricks } from './fakeDatabricks.ts';
import { createGenieClient } from './genie.ts';
import { SyncError } from './types.ts';

let fake: FakeDatabricks;
beforeEach(async () => {
  fake = await startFakeDatabricks();
});
afterEach(() => fake.close());

const client = (over: Record<string, unknown> = {}) =>
  createGenieClient({ host: fake.url, token: fake.token, spaceId: 'space1', pollMs: 5, capMs: 2000, ...over });

describe('genie', () => {
  it('starts a conversation and returns answer, sql, columns and rows', async () => {
    const r = await client().ask('Who worked the most?');
    expect(r.answer).toBe('Maya worked the most this week.');
    expect(r.sql).toContain('SELECT name');
    expect(r.columns).toEqual(['name', 'hours']);
    expect(r.rows).toEqual([['Maya Chen', '3.5'], ['Priya Raman', '1.25']]);
    expect(r.conversationId).toMatch(/^conv-/);
    expect(fake.requests.map((x) => `${x.method} ${x.path.replace(/(conv|msg)-\d+/g, '$1')}`)).toEqual([
      'POST /api/2.0/genie/spaces/space1/start-conversation',
      'GET /api/2.0/genie/spaces/space1/conversations/conv/messages/msg',
      'GET /api/2.0/genie/spaces/space1/conversations/conv/messages/msg/attachments/att-query/query-result',
    ]);
    expect(fake.requests[0].body).toEqual({ content: 'Who worked the most?' });
  });

  it('polls until the message completes', async () => {
    fake.options.geniePolls = 3;
    const r = await client().ask('q');
    expect(r.answer).toContain('Maya');
    expect(fake.requests.filter((x) => x.method === 'GET' && /messages\/msg-\d+$/.test(x.path))).toHaveLength(4);
  });

  it('a follow-up posts to the same conversation', async () => {
    const c = client();
    const first = await c.ask('one');
    const second = await c.ask('two', first.conversationId);
    expect(second.conversationId).toBe(first.conversationId);
    expect(fake.requests.some((x) => x.method === 'POST' && x.path === `/api/2.0/genie/spaces/space1/conversations/${first.conversationId}/messages`)).toBe(true);
    expect(fake.requests.filter((x) => x.path.endsWith('start-conversation'))).toHaveLength(1);
  });

  it('returns only the first 20 rows', async () => {
    fake.options.genie = { columns: ['n'], rows: Array.from({ length: 30 }, (_, i) => [i]) };
    const r = await client().ask('q');
    expect(r.rows).toHaveLength(20);
    expect(r.rows[19]).toEqual(['19']);
  });

  it('allows five questions a minute and then answers with a plain sentence', async () => {
    const clock = { t: 0 };
    const c = client({ now: () => clock.t });
    for (let i = 0; i < 5; i++) await c.ask(`q${i}`);
    const err = await c.ask('q6').catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.status).toBe(429);
    expect(err.message).toBe('Ask is limited to five questions a minute. Try again in a moment.');
    clock.t = 60_000;
    await expect(c.ask('later')).resolves.toBeTruthy();
  });

  it('reports a failed message in one sentence', async () => {
    fake.options.genie = { fail: true };
    const err = await client().ask('q').catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.code).toBe('genie_failed');
  });

  it('gives up after the cap', async () => {
    fake.options.geniePolls = 10_000;
    const err = await client({ capMs: 60 }).ask('q').catch((e) => e);
    expect(err.code).toBe('genie_timeout');
  });

  it('turns a bad token into a plain sentence without the token in it', async () => {
    const err = await createGenieClient({ host: fake.url, token: 'wrong-secret', spaceId: 'space1' }).ask('q').catch((e) => e);
    expect(err.code).toBe('genie_failed');
    expect(err.message).not.toContain('wrong-secret');
  });
});
