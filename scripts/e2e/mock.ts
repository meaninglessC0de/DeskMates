// Layer 2 end-to-end test: scenarios S1, S4, S6, S8, S9 and S17 of docs/hackathon/spec/test-plan.md
// against a running mock office, over HTTP and the WebSocket.
//   MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=20 npm run office:once      (office, in one shell)
//   MOCK_SPEED=20 npx tsx scripts/e2e/mock.ts [--keep]               (this script)
// It starts from a clean slate (removes every employee) and, unless --keep is given, runs the seed afterwards.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Approval, Candidate, Capabilities, Employee, Message, RolePreset, ServerEvent, Task, ThreadResponse } from '../../src/shared/index.ts';
import { readEnv } from '../../src/shared/index.ts';
import { seedOffice } from '../seed.ts';

const env = readEnv();
const BASE = `http://127.0.0.1:${env.OFFICE_PORT}`;
const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.isAbsolute(env.DATA_DIR) ? env.DATA_DIR : path.join(ROOT, env.DATA_DIR);
const KEEP = process.argv.includes('--keep');

async function api<T = unknown>(method: string, p: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + p, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data: data as T };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

class Events {
  readonly log: { at: number; e: ServerEvent }[] = [];
  private ws: WebSocket;
  ready: Promise<void>;

  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${env.OFFICE_PORT}/ws`);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')));
    });
    this.ws.addEventListener('message', (m) => this.log.push({ at: Date.now(), e: JSON.parse(String(m.data)) as ServerEvent }));
  }

  mark(): number {
    return this.log.length;
  }

  async waitFor<T extends ServerEvent>(what: string, pred: (e: ServerEvent) => e is T, from = 0, timeoutMs = 60_000): Promise<T> {
    const start = Date.now();
    let i = from;
    for (;;) {
      while (i < this.log.length) {
        const e = this.log[i++].e;
        if (pred(e)) return e;
      }
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  close(): void {
    this.ws.close();
  }
}

type Ev<K extends ServerEvent['type']> = Extract<ServerEvent, { type: K }>;
const isEmployee = (id: string, state?: string) => (e: ServerEvent): e is Ev<'employee'> =>
  e.type === 'employee' && e.employee.id === id && (state === undefined || e.employee.state === state);
const isMessage = (id: string, from: Message['from'], kind?: Message['kind']) => (e: ServerEvent): e is Ev<'message'> =>
  e.type === 'message' && e.message.employeeId === id && e.message.from === from && (kind === undefined || e.message.kind === kind);
const isApproval = (id: string, status: Approval['status']) => (e: ServerEvent): e is Ev<'approval'> =>
  e.type === 'approval' && e.approval.employeeId === id && e.approval.status === status;

async function hire(roleKey: string, expectFirstName: string): Promise<{ e: Employee; ms: number }> {
  const cand = await api<Candidate>('POST', '/api/candidates', { roleKey });
  assert(cand.status === 200, `candidate ${roleKey}: ${cand.status}`);
  assert(cand.data.persona.firstName === expectFirstName, `expected ${expectFirstName}, got ${cand.data.persona.firstName}`);
  const t0 = Date.now();
  const r = await api<Employee>('POST', '/api/employees', { token: cand.data.token });
  assert(r.status === 200, `hire ${roleKey}: ${r.status} ${JSON.stringify(r.data)}`);
  return { e: r.data, ms: Date.now() - t0 };
}

async function thread(id: string): Promise<ThreadResponse> {
  return (await api<ThreadResponse>('GET', `/api/employees/${id}/thread`)).data;
}

async function employee(id: string): Promise<Employee> {
  return (await api<Employee>('GET', `/api/employees/${id}`)).data;
}

async function isJpeg(p: string): Promise<number> {
  const res = await fetch(BASE + p);
  assert(res.status === 200, `${p} answered ${res.status}`);
  assert(res.headers.get('content-type') === 'image/jpeg', `${p} content-type ${res.headers.get('content-type')}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  assert(buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8, `${p} did not return JPEG bytes`);
  return buf.length;
}

const results: string[] = [];
async function scenario(id: string, name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const note = await fn();
    const line = `PASS ${id} ${name} (${Date.now() - t0} ms)${note ? ` - ${note}` : ''}`;
    results.push(line);
    console.log(line);
  } catch (err) {
    console.log(`FAIL ${id} ${name}: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    throw err;
  }
}

async function main() {
  const health = await api<{ ok: boolean; capabilities: Capabilities }>('GET', '/api/health').catch(() => null);
  assert(health && health.status === 200, `No office answering at ${BASE}`);
  assert(health.data.capabilities.desktops === 'mock', 'The office must run with DESKTOPS=mock');
  assert((await api('POST', '/api/dev/seed', {})).status === 204, 'The office must run with MOCK_LLM=1');

  const ev = new Events();
  await ev.ready;
  for (const e of (await api<Employee[]>('GET', '/api/employees')).data) await api('DELETE', `/api/employees/${e.id}`);

  let maya!: Employee;
  let priya!: Employee;
  let jonas!: Employee;

  await scenario('S1', 'Hire Maya from the preset', async () => {
    const presets = (await api<RolePreset[]>('GET', '/api/presets')).data;
    assert(presets.length === 8, `expected 8 presets, got ${presets.length}`);
    const from = ev.mark();
    const { e, ms } = await hire('web_developer', 'Maya');
    maya = e;
    assert(ms < 1000, `hire answered after ${ms} ms`);
    assert(e.state === 'starting' && e.stateDetail === 'Starting desktop', `state ${e.state} / ${e.stateDetail}`);
    assert(e.permissions.level === 'asks_big_steps', `Maya's default level is ${e.permissions.level}`);
    await ev.waitFor('Maya starting', isEmployee(e.id, 'starting'), from, 2000);
    const up = await ev.waitFor('Maya idle', isEmployee(e.id, 'idle'), from);
    assert(up.employee.desktopSinceMs !== null && up.employee.spaceId?.startsWith('mock:'), 'desktop not recorded');
    const hello = await ev.waitFor('Maya greeting', isMessage(e.id, 'employee', 'text'), from);
    assert(hello.message.text.includes('Maya'), `greeting: ${hello.message.text}`);
    assert(!ev.log.slice(from).some((x) => x.e.type === 'message' && x.e.message.from === 'user'), 'a user message was sent');
    const frame = await isJpeg(`/api/employees/${e.id}/frame.jpg`);
    const thumb = await isJpeg(`/api/employees/${e.id}/thumbnail.jpg`);
    const s = (await api<{ kind: string; url?: string }>('POST', `/api/employees/${e.id}/stream`, { mode: 'view' })).data;
    assert(s.kind === 'frames', `stream kind ${s.kind}`);
    return `starting in ${ms} ms, greeting arrived unprompted, frame ${frame} B, thumbnail ${thumb} B`;
  });

  await scenario('S4', 'Approval: approve, then deny', async () => {
    priya = (await hire('marketer', 'Priya')).e;
    await ev.waitFor('Priya idle', isEmployee(priya.id, 'idle'));
    const patched = await api<Employee>('PATCH', `/api/employees/${priya.id}`, { permissions: { level: 'asks_first' } });
    assert(patched.status === 200 && patched.data.permissions.level === 'asks_first', 'could not set asks_first');

    // run 1: approve
    let from = ev.mark();
    const sent = await api<Message>('POST', `/api/employees/${priya.id}/messages`, { text: 'Please save a file called notes.txt.' });
    assert(sent.status === 200 && sent.data.from === 'user', 'message not accepted');
    const pending = await ev.waitFor('a pending approval', isApproval(priya.id, 'pending'), from);
    assert(pending.approval.title === 'Save a file' && pending.approval.kind === 'tool', `approval: ${pending.approval.title}/${pending.approval.kind}`);
    await ev.waitFor('a notify for it', (e): e is Ev<'notify'> => e.type === 'notify' && e.employeeId === priya.id && e.kind === 'approval', from);
    assert((await employee(priya.id)).state === 'needs_you', 'state is not needs_you while waiting');
    const th = await thread(priya.id);
    assert(th.messages.some((m) => m.id === sent.data.id && m.seenMs !== null), 'the message was not marked seen');
    assert(th.approvals.some((a) => a.id === pending.approval.id), 'approval missing from the thread');
    const ok = await api<Approval>('POST', `/api/approvals/${pending.approval.id}`, { decision: 'approve', scope: 'task' });
    assert(ok.status === 200 && ok.data.status === 'approved', `approve: ${ok.status}`);
    await ev.waitFor('done bubble', isMessage(priya.id, 'employee', 'done'), from);
    await ev.waitFor('Priya idle again', isEmployee(priya.id, 'idle'), from);
    const t1 = (await thread(priya.id)).task as Task;
    assert(t1.status === 'done' && t1.plan.length === 4 && t1.plan.every((s) => s.status === 'done'), 'task or plan not finished');
    assert(t1.costUsd > 0 && t1.activeMs > 0, 'task has no cost or time');
    const again = await api('POST', `/api/approvals/${pending.approval.id}`, { decision: 'approve' });
    assert(again.status === 409, `second answer gave ${again.status}`);

    // run 2: deny
    from = ev.mark();
    await api('POST', `/api/employees/${priya.id}/messages`, { text: 'Save another file, please.' });
    const second = await ev.waitFor('a second approval', isApproval(priya.id, 'pending'), from);
    const no = await api<Approval>('POST', `/api/approvals/${second.approval.id}`, { decision: 'deny', note: 'Not now' });
    assert(no.status === 200 && no.data.status === 'denied', `deny: ${no.status}`);
    const said = await ev.waitFor('her reply to the denial', (e): e is Ev<'message'> => e.type === 'message' && e.message.employeeId === priya.id && e.message.from === 'employee' && /won't|will not/i.test(e.message.text), from);
    // idle after her reply (an earlier idle event is only the user's message touching the row)
    await ev.waitFor('Priya idle after denial', isEmployee(priya.id, 'idle'), ev.log.findIndex((x) => x.e === said) + 1);
    return `approved run finished the 4-step plan; denied run said "${said.message.text.slice(0, 40)}..."`;
  });

  await scenario('S6', 'A question sorts to the top and a reply resumes', async () => {
    const from = ev.mark();
    await api('POST', `/api/employees/${priya.id}/messages`, { text: 'Write a tagline for us. Ask me if you need anything.' });
    const q = await ev.waitFor('a question bubble', isMessage(priya.id, 'employee', 'question'), from);
    await ev.waitFor('needs_you', isEmployee(priya.id, 'needs_you'), from);
    const list = (await api<Employee[]>('GET', '/api/employees')).data;
    assert(list[0].id === priya.id, `needs_you employee is not first (first is ${list[0].persona.firstName})`);
    assert(list[0].stateDetail.startsWith('Which colour'), `stateDetail: ${list[0].stateDetail}`);
    await api('POST', `/api/employees/${priya.id}/messages`, { text: 'Make it playful.' });
    await ev.waitFor('done bubble after the reply', isMessage(priya.id, 'employee', 'done'), from);
    await ev.waitFor('Priya idle', isEmployee(priya.id, 'idle'), from);
    return `question "${q.message.text}"`;
  });

  await scenario('S8', 'Stuck, banner state, Try again', async () => {
    jonas = (await hire('researcher', 'Jonas')).e;
    await ev.waitFor('Jonas idle', isEmployee(jonas.id, 'idle'));
    const from = ev.mark();
    await api('POST', `/api/employees/${jonas.id}/messages`, { text: 'Open nosuchsite.invalid and log in. Tell me if you get stuck.' });
    const stuck = await ev.waitFor('stuck', isEmployee(jonas.id, 'stuck'), from);
    assert(stuck.employee.stateDetail.length > 0 && stuck.employee.stateDetail.length <= 40, `stateDetail "${stuck.employee.stateDetail}"`);
    const th = await thread(jonas.id);
    assert(th.steps.some((s) => s.status === 'error'), 'no failed step recorded');
    assert((th.task as Task).status === 'failed', `task is ${(th.task as Task).status}`);
    await ev.waitFor('a stuck notification', (e): e is Ev<'notify'> => e.type === 'notify' && e.employeeId === jonas.id && e.kind === 'stuck', from);
    const retry = ev.mark();
    const r = await api<Employee>('POST', `/api/employees/${jonas.id}/resume`);
    assert(r.status === 200 && r.data.state !== 'stuck', `resume left state ${r.data.state}`);
    await ev.waitFor('done after Try again', isMessage(jonas.id, 'employee', 'done'), retry);
    await ev.waitFor('Jonas idle', isEmployee(jonas.id, 'idle'), retry);
    return `stuck with "${stuck.employee.stateDetail}", recovered through resume`;
  });

  await scenario('S9', 'Pause, resume, restart, reset, remove', async () => {
    const ines = (await hire('designer', 'Ines')).e;
    await ev.waitFor('Ines idle', isEmployee(ines.id, 'idle'));
    const paused = await api<Employee>('POST', `/api/employees/${ines.id}/pause`);
    assert(paused.data.state === 'paused' && paused.data.stateDetail === 'Paused by you', `pause: ${paused.data.state}`);
    const resumed = await api<Employee>('POST', `/api/employees/${ines.id}/resume`);
    assert(resumed.data.state === 'idle', `resume: ${resumed.data.state}`);

    const control = await api<Employee>('POST', `/api/employees/${ines.id}/control`, { on: true });
    assert(control.data.state === 'paused' && control.data.controlledByUser && control.data.stateDetail === 'You have control', 'take control');
    const back = await api<Employee>('POST', `/api/employees/${ines.id}/control`, { on: false });
    assert(back.data.state === 'idle' && !back.data.controlledByUser, 'give back');

    const before = (await employee(ines.id)).desktopSinceMs;
    let from = ev.mark();
    const rs = await api<Employee>('POST', `/api/employees/${ines.id}/desktop/restart`);
    assert(rs.status === 200 && rs.data.state === 'starting', `restart answered state ${rs.data.state}`);
    const up = await ev.waitFor('idle after restart', isEmployee(ines.id, 'idle'), from);
    assert(up.employee.desktopSinceMs !== null && up.employee.desktopSinceMs !== before, 'desktopSinceMs did not change after restart');

    await api('POST', `/api/employees/${ines.id}/desktop/stop`);
    assert((await employee(ines.id)).state === 'offline', 'stop did not take her offline');
    assert((await fetch(`${BASE}/api/employees/${ines.id}/thumbnail.jpg`)).status === 404, 'thumbnail of an offline desktop is not 404');
    from = ev.mark();
    await api('POST', `/api/employees/${ines.id}/desktop/start`);
    await ev.waitFor('idle after start', isEmployee(ines.id, 'idle'), from);

    from = ev.mark();
    const reset = await api<Employee>('POST', `/api/employees/${ines.id}/desktop/reset`);
    assert(reset.data.state === 'starting', `reset answered state ${reset.data.state}`);
    await ev.waitFor('idle after reset', isEmployee(ines.id, 'idle'), from);
    await isJpeg(`/api/employees/${ines.id}/thumbnail.jpg`);

    const space = path.join(DATA, 'mock-spaces', ines.id);
    const home = path.join(DATA, 'employees', ines.id);
    assert(existsSync(space), 'mock desktop folder missing before removal');
    from = ev.mark();
    const del = await api('DELETE', `/api/employees/${ines.id}`);
    assert(del.status === 204, `delete: ${del.status}`);
    await ev.waitFor('employee_removed', (e): e is Ev<'employee_removed'> => e.type === 'employee_removed' && e.id === ines.id, from);
    assert((await api('GET', `/api/employees/${ines.id}`)).status === 404, 'removed employee still answers');
    assert((await fetch(`${BASE}/api/employees/${ines.id}/thumbnail.jpg`)).status === 404, 'thumbnail after removal');
    assert(!existsSync(space) && !existsSync(home), 'orphan folders left after removal');
    return 'pause, control, restart, stop, start, reset and remove all behaved; no orphan folders';
  });

  await scenario('S17', 'No keys: disabled states and no errors', async () => {
    const h = (await api<{ capabilities: Capabilities }>('GET', '/api/health')).data.capabilities;
    assert(h.databricks === false, 'databricks should be off');
    if (!env.MOCK_GENIE) {
      assert(h.genie === false, 'genie should be off');
      const ask = await api<{ error: { code: string } }>('POST', '/api/team/ask', { question: 'Who worked most?' });
      assert(ask.status === 409 && ask.data.error.code === 'genie_off', `ask answered ${ask.status}`);
    }
    // force the no-LiveKit-keys capability so the refusal can be seen on a mock office
    const off = await api<Capabilities>('POST', '/api/dev/capabilities', { calls: 'off' });
    assert(off.data.calls === 'off', 'could not force calls off');
    assert((await api<{ capabilities: Capabilities }>('GET', '/api/health')).data.capabilities.calls === 'off', 'health does not show calls off');
    const call = await api<{ error: { code: string; message: string } }>('POST', '/api/calls', { employeeIds: [maya.id] });
    assert(call.status === 409 && call.data.error.code === 'calls_off', `calls answered ${call.status}`);
    await api('POST', '/api/dev/capabilities', {});
    assert((await api<{ capabilities: Capabilities }>('GET', '/api/health')).data.capabilities.calls === 'audio', 'calls did not come back');
    for (const p of ['/api/presets', '/api/employees', '/api/settings', '/api/team?range=today', '/api/team?range=week', '/api/team?range=month']) {
      const r = await api('GET', p);
      assert(r.status === 200, `${p} answered ${r.status}`);
    }
    return `ask refused with 409 genie_off, calls refused with 409 calls_off, ${6} read routes answer 200`;
  });

  ev.close();
  if (!KEEP) {
    console.log('restoring the seeded demo team...');
    await seedOffice(BASE, () => {});
  }
  console.log(`\n${results.length} of 6 scenarios passed`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
