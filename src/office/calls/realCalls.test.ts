import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '../../shared/index.ts';
import { buildServer } from '../routes/server.ts';
import { harness, type Ev, type Harness } from '../testkit.ts';
import { createCalls } from './index.ts';
import { createRealCalls } from './realCalls.ts';
import { employee, fakeClient, fakeHost, type ScriptedTurn } from './testHost.ts';
import type { WorkerSupervisor } from './voiceWorker.ts';

const keys = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'APIkey123', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-0123456789' };
const worker = (alive = true): WorkerSupervisor & { started: number; stopped: number } => {
  const w = { started: 0, stopped: 0, start: () => void w.started++, stop: async () => void w.stopped++, alive: () => alive };
  return w;
};
const roomService = () => {
  const deleted: string[] = [];
  return { deleted, deleteRoom: async (r: string) => void deleted.push(r) };
};
const callEvents = (events: ServerEvent[]) => events.filter((e): e is Ev<'call'> => e.type === 'call').map((e) => e.event);

describe('createCalls (no office)', () => {
  it('reports off in real mode without LiveKit keys', async () => {
    const host = fakeHost([employee('e1', 'Maya', 'Web developer')], { LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' });
    const calls = await createCalls(host.env, host);
    expect(calls.mode()).toBe('off');
    await expect(calls.start(['e1'])).rejects.toMatchObject({ status: 409, code: 'calls_off' });
  });
});

describe('real calls flow', () => {
  it('start, joined, captions, speaking, tell_worker, end', async () => {
    const e1 = employee('e1', 'Maya', 'Web developer');
    const host = fakeHost([e1]);
    const w = worker();
    const rs = roomService();
    const client = fakeClient([{ text: ['Sure. '], tool: { name: 'tell_worker', input: { instruction: 'Switch to the green theme.' } } }, { text: ['You agreed to switch the theme to green.'] }]);
    const calls = createRealCalls(host.env, host, { client, worker: w, roomService: rs });
    await calls.boot();
    expect(w.started).toBe(1);
    expect(calls.mode()).toBe('audio');

    const info = await calls.start(['e1']);
    expect(info).toMatchObject({ employeeIds: ['e1'], livekitUrl: keys.LIVEKIT_URL, mock: false, mode: 'audio' });
    expect(info.token.split('.')).toHaveLength(3);
    expect(host.onCall.get('e1')).toBe(info.id);
    expect(callEvents(host.events)[0]).toEqual({ kind: 'state', state: 'connecting', mode: 'audio' });

    await calls.event(info.id, { type: 'joined' });
    await calls.event(info.id, { type: 'user_transcript', text: 'Please switch to green.', final: true });
    const out: string[] = [];
    for await (const t of calls.chat(info.id, undefined, { model: info.id, messages: [{ role: 'user', content: 'Please switch to green.' }] }, new AbortController().signal)) out.push(t);
    expect(out.join('')).toBe('Sure. ');
    await calls.event(info.id, { type: 'speech_started', employeeId: 'e1' });
    await calls.event(info.id, { type: 'agent_transcript', employeeId: 'e1', text: 'Sure. ', final: true });
    await calls.event(info.id, { type: 'speech_ended', employeeId: 'e1' });

    expect(host.delivered[0]).toMatchObject({ id: 'e1', item: { kind: 'manager', via: 'call', text: 'Switch to the green theme.' } });

    const kinds = callEvents(host.events);
    expect(kinds).toContainEqual({ kind: 'participant', employeeId: 'e1', state: 'present' });
    expect(kinds).toContainEqual({ kind: 'state', state: 'live', mode: 'audio' });
    expect(kinds).toContainEqual({ kind: 'caption', from: 'user', text: 'Please switch to green.', final: true });
    const phases = kinds.filter((k) => k.kind === 'speaker').map((k) => (k as { phase: string }).phase);
    expect(phases).toEqual(['thinking', 'speaking', 'idle']);

    await calls.end(info.id);
    await calls.end(info.id);
    expect(host.system).toHaveLength(1);
    expect(host.system[0].text).toMatch(/^Call with Maya · 1 min$/);
    expect(host.onCall.get('e1')).toBeNull();
    expect(callEvents(host.events).at(-1)).toEqual({ kind: 'state', state: 'ended', mode: 'audio' });
    expect(rs.deleted).toEqual([info.room]);
    await vi.waitFor(() => expect(host.delivered).toHaveLength(2));
    expect(host.delivered[1].item).toEqual({ kind: 'office', text: 'Call summary: You agreed to switch the theme to green.' });
  });

  it('refuses when the worker is not running, the person is offline or busy, or the size is wrong', async () => {
    const host = fakeHost([employee('e1', 'Maya', 'Web developer'), employee('e2', 'Priya', 'Marketer', { state: 'offline' })]);
    const dead = createRealCalls(host.env, host, { client: null, worker: worker(false), roomService: roomService() });
    await expect(dead.start(['e1'])).rejects.toMatchObject({ status: 409, code: 'calls_off' });
    const calls = createRealCalls(host.env, host, { client: null, worker: worker(), roomService: roomService() });
    await expect(calls.start([])).rejects.toMatchObject({ status: 400 });
    await expect(calls.start(['e2'])).rejects.toMatchObject({ status: 409, code: 'employee_unavailable' });
    await expect(calls.start(['nope'])).rejects.toMatchObject({ status: 404 });
    const info = await calls.start(['e1']);
    host.employees.set('e1', { ...host.employees.get('e1')!, state: 'on_call' });
    await expect(calls.start(['e1'])).rejects.toMatchObject({ status: 409, code: 'employee_busy' });
    await calls.end(info.id);
  });

  it('fails the call when the worker never joins', async () => {
    vi.useFakeTimers();
    try {
      const host = fakeHost([employee('e1', 'Maya', 'Web developer')]);
      const calls = createRealCalls(host.env, host, { client: null, worker: worker(), roomService: roomService(), joinTimeoutMs: 1000 });
      const info = await calls.start(['e1']);
      await vi.advanceTimersByTimeAsync(1100);
      expect(callEvents(host.events).at(-1)).toEqual({ kind: 'state', state: 'failed', mode: 'audio' });
      expect(host.onCall.get('e1')).toBeNull();
      await calls.end(info.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('avatar_ready and avatar_failed switch the reported mode; avatar mode needs a key and every avatar id', async () => {
    const host = fakeHost([employee('e1', 'Maya', 'Web developer', {}, 'av-1'), employee('e2', 'Zed', 'Marketer'), employee('e3', 'Priya', 'Marketer')], { SYNTHESIA_API_KEY: 'syn' });
    const calls = createRealCalls(host.env, host, { client: null, worker: worker(), roomService: roomService() });
    expect(calls.mode()).toBe('avatar');
    const one = await calls.start(['e1']);
    expect(one.mode).toBe('avatar');
    await calls.event(one.id, { type: 'joined' });
    await calls.event(one.id, { type: 'avatar_failed', reason: 'timeout' });
    expect(callEvents(host.events).at(-1)).toEqual({ kind: 'state', state: 'live', mode: 'audio' });
    await calls.end(one.id);
    const two = await calls.start(['e1', 'e2']);
    expect(two.mode).toBe('audio');
    await calls.end(two.id);
    // Priya has no avatar id in the cast file: config/avatars.json supplies it
    const three = await calls.start(['e1', 'e3']);
    expect(three.mode).toBe('avatar');
    const meta = JSON.parse(JSON.stringify(JSON.parse(Buffer.from(three.token.split('.')[1], 'base64url').toString()).roomConfig.agents[0].metadata));
    expect(JSON.parse(meta).participants.map((p: { avatarId: string }) => p.avatarId)).toEqual(['av-1', 'e929d062-a7b1-4801-a762-b38aabab9fb7']);
    await calls.end(three.id);
  });

  it('meeting: routes by name, address, previous speaker; the prompt lists the others and what they said', async () => {
    const host = fakeHost([employee('e1', 'Maya', 'Web developer'), employee('e2', 'Priya', 'Marketer'), employee('e3', 'Jonas', 'Researcher')]);
    const turns: ScriptedTurn[] = [{ text: ['Launch is Friday.'] }, { text: ['Fine.'] }];
    const client = fakeClient(turns);
    const calls = createRealCalls(host.env, host, { client, worker: worker(), roomService: roomService() });
    const info = await calls.start(['e1', 'e2', 'e3']);
    await calls.event(info.id, { type: 'joined' });

    expect(await calls.route(info.id, 'Priya, when do we launch?')).toEqual(['e2']);
    for await (const t of calls.chat(info.id, 'e2', { model: info.id, messages: [{ role: 'user', content: 'Priya, when do we launch?' }] }, new AbortController().signal)) void t;
    await calls.event(info.id, { type: 'agent_transcript', employeeId: 'e2', text: 'Launch is Friday.', final: true });
    await calls.event(info.id, { type: 'speech_ended', employeeId: 'e2' });

    expect(await calls.route(info.id, 'why?')).toEqual(['e2']);
    await calls.address(info.id, 'e3');
    expect(await calls.route(info.id, 'Priya, again')).toEqual(['e3']);   // the click wins once
    expect(await calls.route(info.id, 'Maya and Jonas, go')).toEqual(['e1', 'e3']);
    expect(await calls.route(info.id, 'everyone say hi')).toEqual(['e1', 'e2', 'e3']);

    for await (const t of calls.chat(info.id, 'e1', { model: info.id, messages: [{ role: 'user', content: 'Maya, your view?' }] }, new AbortController().signal)) void t;
    const sys = client.requests[1].system[0].text;
    expect(sys).toContain('This is a meeting. Also here: Priya (marketer) has said: "Launch is Friday."');
    expect(sys).toContain('Jonas (researcher) has not spoken yet');
    await expect(calls.address(info.id, 'ghost')).rejects.toMatchObject({ status: 404 });
    await calls.end(info.id);
    expect(host.system.map((s) => s.text)).toEqual(Array(3).fill('Meeting · 1 min · Maya, Priya, Jonas'));
  });

  it('without an Anthropic key the mind speaks a short apology instead of failing', async () => {
    const host = fakeHost([employee('e1', 'Maya', 'Web developer')]);
    const calls = createRealCalls(host.env, host, { client: null, worker: worker(), roomService: roomService() });
    const info = await calls.start(['e1']);
    const out: string[] = [];
    for await (const t of calls.chat(info.id, undefined, { model: info.id, messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal)) out.push(t);
    expect(out.join('')).toContain("can't think straight");
    await calls.end(info.id);
  });
});

describe('through the real routes', () => {
  let h: Harness | null = null;
  afterEach(async () => {
    await h?.cleanup();
    h = null;
  });

  it('streams OpenAI-style SSE, routes, takes events, and a call round-trips through POST and DELETE', async () => {
    h = await harness();
    const maya = await h.hire('web_developer');
    await h.state(maya.id, 'idle');
    const client = fakeClient([{ text: ['I am working on ', 'the task.'] }]);
    const calls = createRealCalls({ ...h.office.env, ...keys }, h.office.callsHost(), { client, worker: worker(), roomService: roomService() });
    h.office.attachCalls(calls);
    const app = await buildServer(h.office);

    const created = await app.inject({ method: 'POST', url: '/api/calls', payload: { employeeIds: [maya.id] } });
    expect(created.body).toContain('"mock":false');
    expect(created.statusCode).toBe(200);
    const info = created.json();
    expect(info).toMatchObject({ mock: false, employeeIds: [maya.id] });

    const ev = await app.inject({ method: 'POST', url: `/voice/calls/${info.id}/events`, payload: { type: 'joined' } });
    expect(ev.statusCode).toBe(204);
    const route = await app.inject({ method: 'POST', url: `/voice/calls/${info.id}/route`, payload: { utterance: 'hello' } });
    expect(route.json()).toEqual({ speakers: [maya.id] });

    const res = await app.inject({ method: 'POST', url: '/voice/v1/chat/completions', headers: { 'x-speaker': maya.id }, payload: { model: info.id, stream: true, messages: [{ role: 'user', content: 'what are you doing?' }] } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const lines = res.body.split('\n\n').filter(Boolean);
    expect(lines.at(-1)).toBe('data: [DONE]');
    const chunks = lines.slice(0, -1).map((l) => JSON.parse(l.slice(6)));
    expect(chunks[0].choices[0].delta).toEqual({ role: 'assistant' });
    expect(chunks.every((c) => c.object === 'chat.completion.chunk' && c.model === info.id)).toBe(true);
    expect(chunks.map((c) => c.choices[0].delta.content).filter(Boolean).join('')).toBe('I am working on the task.');
    expect(chunks.at(-1).choices[0].finish_reason).toBe('stop');
    expect(client.abortedDuringStream).toBe(false);   // the request body being read must not abort the model call

    const unknown = await app.inject({ method: 'POST', url: '/voice/v1/chat/completions', payload: { model: 'call_none', messages: [] } });
    expect(unknown.statusCode).toBe(404);

    const del = await app.inject({ method: 'DELETE', url: `/api/calls/${info.id}` });
    expect(del.statusCode).toBe(204);
    const thread = await app.inject({ method: 'GET', url: `/api/employees/${maya.id}/thread?limit=10` });
    expect(thread.json().messages.some((m: { kind: string; text: string }) => m.kind === 'system' && m.text.startsWith('Call with'))).toBe(true);
    await app.close();
  });
});
