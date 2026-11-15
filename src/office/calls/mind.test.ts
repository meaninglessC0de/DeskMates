import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACK, FILLER, runCallMind, toModelMessages } from './mind.ts';
import { buildSystemPrompt } from './prompt.ts';
import { employee, fakeClient, fakeHost, mayaSituation } from './testHost.ts';

const maya = employee('e1', 'Maya', 'Web developer');
const req = (content: string) => ({ model: 'call_1', messages: [{ role: 'user' as const, content }] });

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of it) out.push(t);
  return out;
}

afterEach(() => vi.useRealTimers());

describe('call mind prompt', () => {
  it('carries the seeded situation: state, task, plan, activity, chat, waiting, notes', () => {
    const p = buildSystemPrompt(mayaSituation(maya));
    expect(p).toContain('You are Maya, a web developer, on a live video call with your manager, Sam.');
    expect(p).toContain('Calm and exact.');
    expect(p).toContain('State: working · Editing the pricing page');
    expect(p).toContain('Task: Rebuild the pricing page');
    expect(p).toContain('- Sketch the layout (done)');
    expect(p).toContain('- Build the table (in progress)');
    expect(p).toContain('- Wire the buy button (next)');
    expect(p).toContain('- Opened the staging site');
    expect(p).toContain('Manager: Please use the blue theme.');
    expect(p).toContain('You: On it.');
    expect(p).toContain('Waiting on your manager: Publish the draft');
    expect(p).toContain('- Brand blue is the accent');
    expect(p).toContain('tell_worker');
    expect(p).toContain('look_at_screen');
  });

  it('says none for an empty situation and caps notes at 15', () => {
    const s = mayaSituation(maya);
    s.task = null; s.plan = []; s.recentSteps = []; s.recentChat = []; s.waitingOn = null;
    s.notes = Array.from({ length: 20 }, (_, i) => `note ${i}`);
    const p = buildSystemPrompt(s);
    expect(p).toContain('Task: none');
    expect(p).toContain('Waiting on your manager: nothing');
    expect(p).toContain('note 14');
    expect(p).not.toContain('note 15');
  });

  it('adds the meeting line with what the others said', () => {
    const p = buildSystemPrompt(mayaSituation(maya), { others: [{ firstName: 'Priya', role: 'Marketer', said: ['Launch is Friday.'] }, { firstName: 'Jonas', role: 'Researcher', said: [] }] });
    expect(p).toContain('This is a meeting. Also here: Priya (marketer) has said: "Launch is Friday."; Jonas (researcher) has not spoken yet.');
  });
});

describe('toModelMessages', () => {
  it('folds system messages out, merges same-role turns and starts with a user turn', () => {
    const r = toModelMessages({ model: 'c', messages: [{ role: 'system', content: 'Greet them.' }, { role: 'assistant', content: 'Hi.' }, { role: 'assistant', content: 'There.' }, { role: 'user', content: 'Hello' }] });
    expect(r.extraSystem).toEqual(['Greet them.']);
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(r.messages[1].content).toBe('Hi. There.');
  });
});

describe('runCallMind', () => {
  it('streams text deltas and builds the request from the situation', async () => {
    const host = fakeHost([maya]);
    const client = fakeClient([{ text: ['I am rebuilding ', 'the pricing page.'] }]);
    const out = await collect(runCallMind({ client, model: 'claude-haiku-5-5', host, callId: 'call_1', employeeId: 'e1', req: req('what are you doing?'), signal: new AbortController().signal }));
    expect(out).toEqual(['I am rebuilding ', 'the pricing page.']);
    const r = client.requests[0];
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.max_tokens).toBe(400);
    expect(r.stream).toBe(true);
    expect(r.output_config).toEqual({ effort: 'low' });
    expect(r).not.toHaveProperty('thinking');
    expect(r.system[0].text).toContain('Task: Rebuild the pricing page');
    expect(r.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(r.messages).toEqual([{ role: 'user', content: 'what are you doing?' }]);
    expect(host.delivered).toHaveLength(0);
  });

  it('tell_worker delivers a manager inbox item via call; after a spoken acknowledgement the turn ends without a second request', async () => {
    const host = fakeHost([maya]);
    const client = fakeClient([{ text: ['Sure. '], tool: { name: 'tell_worker', input: { instruction: 'Use the green theme instead of blue.' } } }, { text: ['should not be asked'] }]);
    const seen: string[] = [];
    const out = await collect(runCallMind({ client, model: 'm', host, callId: 'call_1', employeeId: 'e1', req: req('switch to green'), signal: new AbortController().signal, onToolInstruction: (t) => seen.push(t) }));
    expect(out.join('')).toBe('Sure. ');
    expect(host.delivered).toHaveLength(1);
    expect(host.delivered[0].id).toBe('e1');
    expect(host.delivered[0].item).toMatchObject({ kind: 'manager', via: 'call', text: 'Use the green theme instead of blue.' });
    expect(seen).toEqual(['Use the green theme instead of blue.']);
    expect(client.requests).toHaveLength(1);
  });

  it('tell_worker without any spoken words continues with a second request carrying the tool result', async () => {
    const host = fakeHost([maya]);
    const client = fakeClient([{ tool: { name: 'tell_worker', input: { instruction: 'Do Y.' } } }, { text: ['Passed on.'] }]);
    const out = await collect(runCallMind({ client, model: 'm', host, callId: 'c', employeeId: 'e1', req: req('do y'), signal: new AbortController().signal }));
    expect(out.join('')).toBe('Passed on.');
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(JSON.stringify(client.requests[1].messages[2].content)).toContain('passed on');
  });

  it('nudges for a spoken reply when the model went straight to the tool, and falls back to a plain acknowledgement', async () => {
    const host = fakeHost([maya]);
    const client = fakeClient([{ tool: { name: 'tell_worker', input: { instruction: 'Do X.' } } }, {}]);
    const out = await collect(runCallMind({ client, model: 'm', host, callId: 'c', employeeId: 'e1', req: req('do x'), signal: new AbortController().signal }));
    expect(out).toEqual([ACK]);
    expect(JSON.stringify(client.requests[1].messages[2].content)).toContain('say your short reply out loud');
    expect(host.delivered).toHaveLength(1);
  });

  it('look_at_screen returns an image block from the host screenshot', async () => {
    const host = fakeHost([maya]);
    const client = fakeClient([{ tool: { name: 'look_at_screen', input: {} } }, { text: ['A terminal.'] }]);
    const out = await collect(runCallMind({ client, model: 'm', host, callId: 'c', employeeId: 'e1', req: req('what is on your screen?'), signal: new AbortController().signal }));
    expect(out.join('')).toBe('A terminal.');
    const tr = JSON.stringify(client.requests[1].messages[2].content);
    expect(tr).toContain('"type":"image"');
    expect(tr).toContain(Buffer.from([0xff, 0xd8, 0xff]).toString('base64'));
  });

  it('sends the filler after 2.5 s when the model is silent, then the real text', async () => {
    vi.useFakeTimers();
    const host = fakeHost([maya]);
    const client = fakeClient([{ delayMs: 4000, text: ['Here is the answer.'] }]);
    const got: string[] = [];
    const done = (async () => {
      for await (const t of runCallMind({ client, model: 'm', host, callId: 'c', employeeId: 'e1', req: req('hi'), signal: new AbortController().signal })) got.push(t);
    })();
    await vi.advanceTimersByTimeAsync(2400);
    expect(got).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(got).toEqual([FILLER]);
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(got).toEqual([FILLER, 'Here is the answer.']);
  });

  it('does not send the filler when text arrives in time', async () => {
    vi.useFakeTimers();
    const host = fakeHost([maya]);
    const client = fakeClient([{ delayMs: 500, text: ['Quick.'] }]);
    const got: string[] = [];
    const done = (async () => {
      for await (const t of runCallMind({ client, model: 'm', host, callId: 'c', employeeId: 'e1', req: req('hi'), signal: new AbortController().signal })) got.push(t);
    })();
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(got).toEqual(['Quick.']);
  });
});
