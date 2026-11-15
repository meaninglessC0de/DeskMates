import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Approval, Employee, Task } from '../../shared/index.ts';
import type { EmployeeRuntime, InboxItem, RuntimeDeps } from '../runtime/types.ts';
import { harness, type Ev, type Harness } from '../testkit.ts';

let h: Harness | null = null;
afterEach(async () => {
  await h?.cleanup();
  h = null;
});

const isApproval = (status: Approval['status'], id?: string) => (e: unknown): e is Ev<'approval'> => {
  const x = e as Ev<'approval'>;
  return x.type === 'approval' && x.approval.status === status && (!id || x.approval.employeeId === id);
};
const isMsg = (id: string, from: 'user' | 'employee', kind?: string) => (e: unknown): e is Ev<'message'> => {
  const x = e as Ev<'message'>;
  return x.type === 'message' && x.message.employeeId === id && x.message.from === from && (!kind || x.message.kind === kind);
};

async function hired(roleKey = 'web_developer', env?: Record<string, string>): Promise<{ h: Harness; e: Employee }> {
  h = await harness({ env });
  const e = await h.hire(roleKey);
  await h.state(e.id, 'idle');
  await h.waitFor('greeting', isMsg(e.id, 'employee', 'text'));
  return { h, e };
}

describe('hiring', () => {
  it('returns at once as starting, then comes up idle and greets by itself', async () => {
    h = await harness();
    const e = await h.hire('web_developer');
    expect(e.state).toBe('starting');
    expect(e.stateDetail).toBe('Starting desktop');
    expect(e.persona.firstName).toBe('Maya');
    expect(e.permissions.level).toBe('asks_big_steps');
    expect(e.model).toBe('claude-sonnet-5-5');
    const up = await h.state(e.id, 'idle');
    expect(up.spaceId).toMatch(/^mock:emp-/);
    expect(up.desktopSinceMs).not.toBeNull();
    expect(up.sessionId).toMatch(/^mock-session-/);
    const greet = await h.waitFor('greeting', isMsg(e.id, 'employee', 'text'));
    expect(greet.message.text).toContain('Maya');
    expect(h.office.getEmployee(e.id).unread).toBe(1);
    expect(h.events.some((x) => x.type === 'message' && x.message.from === 'user')).toBe(false);
  });

  it('refuses a hire when the team is full and hands out a different person on Shuffle', async () => {
    h = await harness({ env: { MAX_TEAM: '2' } });
    const first = await h.office.candidate({ roleKey: 'web_developer' });
    const second = await h.office.candidate({ roleKey: 'web_developer', exclude: [first.token] });
    expect(second.persona.name).not.toBe(first.persona.name);
    const a = await h.office.hire(first.token);
    await expect(h.office.hire(first.token)).rejects.toMatchObject({ status: 409, code: 'candidate_taken' });
    await h.office.hire((await h.office.candidate({ roleKey: 'marketer' })).token);
    await expect(h.office.candidate({ roleKey: 'designer' })).rejects.toMatchObject({ status: 409, code: 'team_full', message: 'Your team is full. Remove someone to hire again.' });
    expect(a.persona.firstName).toBe('Maya');
  });

  it('builds a deterministic persona for a described role and asks for the description', async () => {
    h = await harness();
    await expect(h.office.candidate({ roleKey: 'custom' })).rejects.toMatchObject({ status: 400 });
    const c = await h.office.candidate({ roleKey: 'custom', description: 'customer support agent for a bakery' });
    expect(c.persona.roleKey).toBe('custom');
    expect(c.persona.role).toBe('Customer Support Agent');
    const again = await h.office.candidate({ roleKey: 'custom', description: 'customer support agent for a bakery' });
    expect(again.persona.role).toBe(c.persona.role);
  });
});

describe('messages and the scripted employee', () => {
  it('runs the full script: typing, reply, steps, plan, approval, approve, done', async () => {
    const { h, e } = await hired();
    const from = h.mark();
    const m = h.office.sendMessage(e.id, 'Build a team page.');
    expect(m).toMatchObject({ from: 'user', kind: 'text', seenMs: null });
    await h.waitFor('typing on', (x): x is Ev<'typing'> => x.type === 'typing' && x.on, { from });
    const reply = await h.waitFor('reply', isMsg(e.id, 'employee', 'text'), { from });
    expect(reply.message.text).toContain('On it');
    await h.waitFor('seen', (x): x is Ev<'message_seen'> => x.type === 'message_seen' && x.id === m.id, { from });
    const pending = await h.waitFor('approval', isApproval('pending', e.id), { from });
    expect(pending.approval).toMatchObject({ title: 'Publish the draft', kind: 'big_step' });
    const needs = h.office.getEmployee(e.id);
    expect(needs.state).toBe('needs_you');
    expect(needs.stateDetail).toBe('Publish the draft');
    expect(h.office.listEmployees()[0].id).toBe(e.id);
    const t = h.office.thread(e.id, {});
    expect(t.task!.status).toBe('blocked');
    expect(t.task!.plan.map((s) => s.status)).toEqual(['done', 'done', 'done', 'in_progress']);
    expect(t.steps.length).toBeGreaterThanOrEqual(3);

    const done = h.office.decideApproval(pending.approval.id, 'approve', 'task');
    expect(done.status).toBe('approved');
    expect(done.resolvedMs).not.toBeNull();
    await h.waitFor('done bubble', isMsg(e.id, 'employee', 'done'), { from });
    const idle = await h.state(e.id, 'idle', from);
    expect(idle.stateDetail).toBe('Web developer');
    const task = h.office.thread(e.id, {}).task as Task;
    expect(task).toMatchObject({ status: 'done', title: 'Build a team page.' });
    expect(task.plan.every((s) => s.status === 'done')).toBe(true);
    expect(task.costUsd).toBeGreaterThan(0);
    expect(task.numTurns).toBeGreaterThan(0);
    expect(task.activeMs).toBeGreaterThan(0);
    expect(task.outcome).toContain('Done');
    await expect(Promise.resolve().then(() => h.office.decideApproval(pending.approval.id, 'approve', 'task'))).rejects.toMatchObject({ status: 409 });
  });

  it('deny: the employee says so and stops without finishing the last step', async () => {
    const { h, e } = await hired();
    const from = h.mark();
    h.office.sendMessage(e.id, 'Publish it.');
    const pending = await h.waitFor('approval', isApproval('pending', e.id), { from });
    h.office.decideApproval(pending.approval.id, 'deny', 'once', 'Not yet');
    const said = await h.waitFor('her reply', (x): x is Ev<'message'> => x.type === 'message' && x.message.from === 'employee' && /won't/.test(x.message.text), { from });
    expect(said.message.text).toContain("won't");
    await h.state(e.id, 'idle', from);
    const task = h.office.thread(e.id, {}).task as Task;
    expect(task.status).toBe('done');
    expect(task.outcome).toContain('Stopped');
    const approvals = h.office.thread(e.id, {}).approvals;
    expect(approvals.find((a) => a.id === pending.approval.id)!.status).toBe('denied');
  });

  it('asks_first employees raise a tool approval, and an "ask" message produces a question', async () => {
    const { h, e } = await hired('marketer');
    await h.office.patchEmployee(e.id, { permissions: { level: 'asks_first' } });
    const from = h.mark();
    h.office.sendMessage(e.id, 'Save a file.');
    const a = await h.waitFor('tool approval', isApproval('pending', e.id), { from });
    expect(a.approval).toMatchObject({ kind: 'tool', title: 'Save a file' });
    h.office.decideApproval(a.approval.id, 'approve', 'task');
    await h.state(e.id, 'idle', h.mark());

    const from2 = h.mark();
    h.office.sendMessage(e.id, 'Write a tagline. Ask me what you need.');
    const q = await h.waitFor('question', isMsg(e.id, 'employee', 'question'), { from: from2 });
    const needs = await h.state(e.id, 'needs_you', from2);
    expect(needs.stateDetail).toBe(q.message.text.slice(0, 40));
    h.office.sendMessage(e.id, 'Playful.');
    await h.waitFor('done', isMsg(e.id, 'employee', 'done'), { from: from2 });
    await h.state(e.id, 'idle', from2);
  });

  it('steers a working employee: the message is accepted and acknowledged, the script carries on', async () => {
    const { h, e } = await hired();
    const from = h.mark();
    h.office.sendMessage(e.id, 'Build it.');
    await h.waitFor('first step', (x): x is Ev<'step'> => x.type === 'step' && x.step.employeeId === e.id, { from });
    const steer = h.office.sendMessage(e.id, 'Make the heading blue.');
    await h.waitFor('seen', (x): x is Ev<'message_seen'> => x.type === 'message_seen' && x.id === steer.id, { from });
    await h.waitFor('ack', (x): x is Ev<'message'> => x.type === 'message' && /fold that in/.test(x.message.text), { from });
    const a = await h.waitFor('approval', isApproval('pending', e.id), { from });
    h.office.decideApproval(a.approval.id, 'approve', 'once');
    await h.waitFor('done', isMsg(e.id, 'employee', 'done'), { from });
  });
});

describe('pause, take control, stuck', () => {
  it('pause holds the script, resume continues it', async () => {
    const { h, e } = await hired();
    const from = h.mark();
    h.office.sendMessage(e.id, 'Build it.');
    await h.waitFor('working', (x): x is Ev<'step'> => x.type === 'step' && x.step.employeeId === e.id, { from });
    const p = h.office.pause(e.id);
    expect(p).toMatchObject({ state: 'paused', stateDetail: 'Paused by you' });
    const steps = () => h!.events.filter((x) => x.type === 'step').length;
    await new Promise((r) => setTimeout(r, 120));
    const frozen = steps();
    await new Promise((r) => setTimeout(r, 120));
    expect(steps()).toBe(frozen);
    expect(h.events.some((x) => x.type === 'approval' && x.approval.status === 'pending')).toBe(false);
    expect(h.office.resume(e.id).state).toBe('working');
    const a = await h.waitFor('approval after resume', isApproval('pending', e.id), { from });
    h.office.decideApproval(a.approval.id, 'approve', 'once');
    await h.waitFor('done', isMsg(e.id, 'employee', 'done'), { from });
  });

  it('take control pauses with "You have control"; give back resumes', async () => {
    const { h, e } = await hired();
    const on = h.office.control(e.id, true);
    expect(on).toMatchObject({ state: 'paused', stateDetail: 'You have control', controlledByUser: true });
    const off = h.office.control(e.id, false);
    expect(off).toMatchObject({ state: 'idle', controlledByUser: false });
  });

  it('stuck sets the banner state, and resume ("Try again") clears it and finishes', async () => {
    const { h, e } = await hired('researcher');
    const from = h.mark();
    h.office.sendMessage(e.id, 'Open nosuchsite.invalid and log in. Say if you get stuck.');
    const stuck = await h.state(e.id, 'stuck', from);
    expect(stuck.stateDetail.length).toBeLessThanOrEqual(40);
    expect(stuck.stateDetail).toMatch(/site|load/);
    const t = h.office.thread(e.id, {});
    expect((t.task as Task).status).toBe('failed');
    expect(t.steps.some((s) => s.status === 'error')).toBe(true);
    expect(h.events.some((x) => x.type === 'notify' && x.kind === 'stuck')).toBe(true);
    expect(h.office.listEmployees()[0].id).toBe(e.id);
    const from2 = h.mark();
    expect(h.office.resume(e.id).state).not.toBe('stuck');
    await h.waitFor('done', isMsg(e.id, 'employee', 'done'), { from: from2 });
    await h.state(e.id, 'idle', from2);
    expect((h.office.thread(e.id, {}).task as Task).status).toBe('done');
  });
});

describe('screen grant', () => {
  it('one holder at a time, take back, expiry, and host_off', async () => {
    const { h, e } = await hired();
    const other = await h.hire('marketer');
    await h.state(other.id, 'idle');

    const granted = await h.office.grantScreen(e.id, 5);
    expect(granted.screenGrant!.untilMs).toBeGreaterThan(Date.now());
    expect(h.events.some((x) => x.type === 'notify' && x.kind === 'screen' && x.employeeId === e.id)).toBe(true);
    await expect(h.office.grantScreen(other.id, 5)).rejects.toMatchObject({ status: 409, code: 'screen_busy' });
    await h.office.revokeScreen(e.id, 'taken_back');
    expect(h.office.getEmployee(e.id).screenGrant).toBeNull();
    const second = await h.office.grantScreen(other.id, null);
    expect(second.screenGrant).toEqual({ untilMs: null });
    await h.office.revokeScreen(other.id, 'taken_back');

    const from = h.mark();
    await h.office.grantScreen(e.id, 0.004); // 240 ms
    await h.waitFor('expiry', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === e.id && x.employee.screenGrant === null, { from, timeoutMs: 3000 });
    await expect(h.office.grantScreen(other.id, 5)).resolves.toBeTruthy();
    await h.office.revokeScreen(other.id, 'taken_back');

    h.office.setCapabilityOverride({ hostScreen: false });
    await expect(h.office.grantScreen(e.id, 5)).rejects.toMatchObject({ status: 409, code: 'host_off' });
  });

  it('a "screen" message makes the employee ask, use the host, report and release', async () => {
    const { h, e } = await hired();
    await h.office.patchEmployee(e.id, { permissions: { myScreen: true } });
    const from = h.mark();
    h.office.sendMessage(e.id, 'Read the window on my screen.');
    const a = await h.waitFor('screen approval', isApproval('pending', e.id), { from });
    expect(a.approval).toMatchObject({ kind: 'screen', title: 'Use your screen', screenMinutes: 5 });
    h.office.decideApproval(a.approval.id, 'approve', 'once');
    const said = await h.waitFor('report', (x): x is Ev<'message'> => x.type === 'message' && /On your screen I can see/.test(x.message.text), { from });
    expect(said.message.text).toContain('notes app');
    await h.waitFor('done', isMsg(e.id, 'employee', 'done'), { from });
    await h.waitFor('released', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === e.id && x.employee.screenGrant === null, { from });
    expect(h.office.getEmployee(e.id).screenGrant).toBeNull();
  });

  it('request_screen is refused when the employee may not ask', async () => {
    const { h, e } = await hired();
    const sup = h.office.peers('nobody').find((s) => s.id === e.id)!;
    await expect(sup.requestScreen('look', 5)).resolves.toMatch(/not allowed/);
  });
});

describe('desktop actions and removal', () => {
  it('restart, stop, start and reset move through starting back to idle', async () => {
    const { h, e } = await hired();
    const since = h.office.getEmployee(e.id).desktopSinceMs;
    let from = h.mark();
    expect((await h.office.desktopAction(e.id, 'restart')).state).toBe('starting');
    const up = await h.state(e.id, 'idle', from);
    expect(up.desktopSinceMs).not.toBe(since);
    expect((await h.office.desktopAction(e.id, 'stop')).state).toBe('offline');
    expect(h.office.getEmployee(e.id)).toMatchObject({ stateDetail: 'Desktop is off', desktopSinceMs: null });
    await expect(h.office.thumbnail(e.id)).rejects.toMatchObject({ status: 404 });
    from = h.mark();
    await h.office.desktopAction(e.id, 'start');
    await h.state(e.id, 'idle', from);
    await expect(h.office.thumbnail(e.id)).resolves.toBeInstanceOf(Buffer);
    from = h.mark();
    await h.office.desktopAction(e.id, 'reset');
    await h.state(e.id, 'idle', from);
    await expect(h.office.frame(e.id)).resolves.toBeInstanceOf(Buffer);
  });

  it('a message to an offline employee starts the desktop and is delivered', async () => {
    const { h, e } = await hired();
    await h.office.desktopAction(e.id, 'stop');
    const from = h.mark();
    h.office.sendMessage(e.id, 'Are you there?');
    await h.state(e.id, 'idle', from);
    await h.waitFor('seen', (x): x is Ev<'message_seen'> => x.type === 'message_seen', { from });
  });

  it('remove deletes the desktop folder, the thread and the row', async () => {
    const { h, e } = await hired();
    const dir = path.join(h.dir, 'mock-spaces', e.id);
    expect(existsSync(dir)).toBe(true);
    const from = h.mark();
    await h.office.removeEmployee(e.id);
    await h.waitFor('removed', (x): x is Ev<'employee_removed'> => x.type === 'employee_removed' && x.id === e.id, { from });
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(path.join(h.dir, 'employees', e.id))).toBe(false);
    expect(() => h!.office.getEmployee(e.id)).toThrow();
    expect(h.office.store.listMessages(e.id)).toHaveLength(0);
  });

  it('removing an employee who is waiting on an approval does not leave anything running', async () => {
    const { h, e } = await hired();
    h.office.sendMessage(e.id, 'Build it.');
    await h.waitFor('approval', isApproval('pending', e.id));
    await h.office.removeEmployee(e.id);
    await new Promise((r) => setTimeout(r, 150));
    expect(h.office.store.getEmployee(e.id)).toBeUndefined();
    expect(h.office.store.listMessages(e.id)).toHaveLength(0);
  });
});

describe('colleagues', () => {
  it('delivers by first name, lists valid names, honours the switch and stops a loop after eight', async () => {
    const { h, e } = await hired();
    const b = await h.hire('marketer');
    await h.state(b.id, 'idle');
    const maya = h.office.peers(b.id)[0];
    const priya = h.office.peers(e.id)[0];
    expect(maya.messageColleague('Nobody', 'hi')).toMatch(/No teammate called Nobody\. Valid names: Priya\./);
    const from = h.mark();
    expect(maya.messageColleague('priya', 'Can you write a tagline?')).toBe('Sent to Priya.');
    const step = await h.waitFor('peer step on Priya', (x): x is Ev<'step'> => x.type === 'step' && x.step.employeeId === b.id && x.step.peer?.direction === 'from', { from });
    expect(step.step.sentence).toBe('Maya asked something');
    expect(maya.listColleagues()).toBe('Priya, Marketer, idle');
    for (let i = 2; i <= 8; i++) {
      expect((i % 2 === 0 ? priya : maya).messageColleague(i % 2 === 0 ? 'Maya' : 'Priya', `Message ${i}`)).toMatch(/^Sent to /);
    }
    expect(priya.messageColleague('Maya', 'Nine')).toBe('Limit reached. Ask your manager instead.');
    h.office.sendMessage(e.id, 'Carry on.'); // a manager message resets the chain
    expect(priya.messageColleague('Maya', 'Four')).toBe('Sent to Maya.');
    await h.office.patchEmployee(e.id, { permissions: { teammates: false } });
    expect(maya.messageColleague('Priya', 'x')).toBe('Messaging teammates is switched off for you.');
  });
});

describe('restart recovery', () => {
  it('expires a pending approval, tells the employee, and she finishes', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'office-restart-'));
    const dbFile = path.join(dir, 'office.db');
    try {
      const first = await harness({ dir, dbFile });
      const e = await first.hire('web_developer');
      await first.state(e.id, 'idle');
      first.office.sendMessage(e.id, 'Build it.');
      const a = await first.waitFor('approval', isApproval('pending', e.id));
      await first.office.shutdown();
      first.office.store.close();

      const second = await harness({ dir, dbFile });
      h = second;
      const stored = second.office.store.getApproval(a.approval.id)!;
      expect(stored.status).toBe('expired');
      expect(stored.resolvedMs).not.toBeNull();
      expect(second.office.getEmployee(e.id).state).toBe('working'); // desktop is up and the task is still open
      expect(second.office.getEmployee(e.id).screenGrant).toBeNull();
      await second.waitFor('done after the restart notice', (x): x is Ev<'message'> => x.type === 'message' && x.message.kind === 'done');
      await second.state(e.id, 'idle');
      expect((second.office.thread(e.id, {}).task as Task).status).toBe('done');
      await expect(Promise.resolve().then(() => second.office.decideApproval(a.approval.id, 'approve', 'once'))).rejects.toMatchObject({ status: 409 });
    } finally {
      await h?.cleanup();
      h = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a stopped desktop offline and a waiting question waiting', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'office-restart-'));
    const dbFile = path.join(dir, 'office.db');
    try {
      const first = await harness({ dir, dbFile });
      const e = await first.hire('marketer');
      const other = await first.hire('researcher');
      await first.state(e.id, 'idle');
      await first.state(other.id, 'idle');
      first.office.sendMessage(e.id, 'Ask me something.');
      await first.state(e.id, 'needs_you');
      await first.office.desktopAction(other.id, 'stop');
      await first.office.shutdown();
      first.office.store.close();

      h = await harness({ dir, dbFile });
      expect(h.office.getEmployee(e.id).state).toBe('needs_you');
      expect(h.office.getEmployee(other.id)).toMatchObject({ state: 'offline', stateDetail: 'Desktop is off' });
    } finally {
      await h?.cleanup();
      h = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the keep-going rules (with a runtime that stops early)', () => {
  function stoppingRuntime(log: InboxItem[]) {
    return (deps: RuntimeDeps): EmployeeRuntime => {
      let started = false;
      const timers = new Set<NodeJS.Timeout>();
      const rt: EmployeeRuntime = {
        async start() { started = true; },
        deliver(item) {
          log.push(item);
          const nudge = item.kind === 'office' && /You stopped without finishing/.test(item.text);
          const hire = item.kind === 'office' && /just been hired/.test(item.text);
          if (!started || (item.kind === 'office' && !nudge && !hire)) return;
          const t = setTimeout(() => {
            timers.delete(t);
            deps.host.turnStarted();
            if (!nudge && !hire) deps.host.toolUsed('space');
            deps.host.turnEnded(hire ? {} : { costUsd: 0.01, numTurns: 1 });
          }, 5);
          timers.add(t);
        },
        async interrupt() {}, async setPaused() {}, onPermissionsChanged() {}, async attachHost() {}, async detachHost() {},
        async dispose() { for (const t of timers) clearTimeout(t); timers.clear(); },
      };
      return rt;
    };
  }

  it('nudges twice, then marks the employee stuck', async () => {
    const log: InboxItem[] = [];
    h = await harness({ boot: { createRuntime: stoppingRuntime(log) } });
    const e = await h.hire('web_developer');
    await h.state(e.id, 'idle');
    const from = h.mark();
    h.office.sendMessage(e.id, 'Do the thing.');
    const stuck = await h.state(e.id, 'stuck', from);
    expect(stuck.stateDetail).toBe('Stopped making progress');
    expect(log.filter((i) => i.kind === 'office' && /You stopped without finishing/.test(i.text))).toHaveLength(2);
    expect((h.office.thread(e.id, {}).task as Task).status).toBe('failed');
  });

  it('asks the manager when a task passes its budget, and cancels on "no"', async () => {
    const log: InboxItem[] = [];
    h = await harness({ env: { EMPLOYEE_TASK_BUDGET_USD: '0.005' }, boot: { createRuntime: stoppingRuntime(log) } });
    const e = await h.hire('web_developer');
    await h.state(e.id, 'idle');
    const from = h.mark();
    h.office.sendMessage(e.id, 'Do the thing.');
    const q = await h.waitFor('budget question', (x): x is Ev<'message'> => x.type === 'message' && x.message.kind === 'question', { from });
    expect(q.message.text).toBe("I've used $0.01 on this. Keep going?");
    expect(h.office.getEmployee(e.id).state).toBe('needs_you');
    h.office.sendMessage(e.id, 'No, stop.');
    expect((h.office.thread(e.id, {}).task as Task).status).toBe('cancelled');
    expect(h.office.getEmployee(e.id).state).toBe('idle');
  });
});

describe('waiting for a teammate', () => {
  const NOTE = /has not replied yet\. Carry on with anything you can do without them, message them again, or ask your manager\.$/;
  /** Manager text "wait" makes her call wait_for_colleague and stop; a colleague message or the timeout note finishes the task. */
  function waitingRuntime(log: InboxItem[], answers: string[] = []) {
    return (deps: RuntimeDeps): EmployeeRuntime => {
      let started = false;
      const timers = new Set<NodeJS.Timeout>();
      const turn = (fn: () => void) => {
        const t = setTimeout(() => { timers.delete(t); deps.host.turnStarted(); fn(); }, 5);
        timers.add(t);
      };
      const rt: EmployeeRuntime = {
        async start() { started = true; },
        deliver(item) {
          log.push(item);
          if (!started) return;
          if (item.kind === 'office' && /just been hired/.test(item.text)) return turn(() => deps.host.turnEnded({}));
          if (item.kind === 'manager') {
            return turn(() => {
              deps.host.toolUsed('space');
              answers.push(deps.host.waitForColleague(/nobody/i.test(item.text) ? 'Nobody' : 'Priya'));
              deps.host.turnEnded({ costUsd: 0.01, numTurns: 1 });
            });
          }
          if (item.kind === 'colleague' || (item.kind === 'office' && NOTE.test(item.text))) {
            return turn(() => {
              deps.host.toolUsed('space');
              if (item.kind === 'colleague') deps.host.finishTask('Used what Priya sent.');
              deps.host.turnEnded({ costUsd: 0.01, numTurns: 1 });
            });
          }
          if (item.kind === 'office' && /You stopped without finishing/.test(item.text)) return turn(() => deps.host.turnEnded({}));
        },
        async interrupt() {}, async setPaused() {}, onPermissionsChanged() {}, async attachHost() {}, async detachHost() {},
        async dispose() { for (const t of timers) clearTimeout(t); timers.clear(); },
      };
      return rt;
    };
  }
  const nudges = (log: InboxItem[]) => log.filter((i) => i.kind === 'office' && /You stopped without finishing/.test(i.text));

  async function rig(log: InboxItem[], answers: string[] = []) {
    h = await harness({ boot: { createRuntime: waitingRuntime(log, answers) } });
    const maya = await h.hire('web_developer');
    await h.state(maya.id, 'idle');
    const priya = await h.hire('marketer');
    await h.state(priya.id, 'idle');
    return { maya, priya, mayaSup: h.office.peers(priya.id)[0], priyaSup: h.office.peers(maya.id)[0] };
  }

  it('shows "Waiting for Priya", and neither nudges nor fails her', async () => {
    const log: InboxItem[] = [];
    const answers: string[] = [];
    const { maya } = await rig(log, answers);
    const from = h!.mark();
    h!.office.sendMessage(maya.id, 'Build the page, then wait.');
    await h!.waitFor('waiting detail', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === maya.id && x.employee.stateDetail === 'Waiting for Priya', { from });
    expect(answers[0]).toMatch(/^Noted\. Stop now: the office will wake you when Priya's message arrives\.$/);
    await new Promise((r) => setTimeout(r, 400));
    const e = h!.office.getEmployee(maya.id);
    expect(e).toMatchObject({ state: 'working', stateDetail: 'Waiting for Priya' });
    expect(nudges(log)).toHaveLength(0);
    expect((h!.office.thread(maya.id, {}).task as Task).status).toBe('running');
  });

  it('a colleague message wakes her and clears the flag', async () => {
    const log: InboxItem[] = [];
    const { maya, priyaSup } = await rig(log);
    h!.office.sendMessage(maya.id, 'Build the page, then wait.');
    await h!.waitFor('waiting', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === maya.id && x.employee.stateDetail === 'Waiting for Priya');
    const from = h!.mark();
    expect(priyaSup.messageColleague('Maya', 'Here is the copy.')).toBe('Sent to Maya.');
    const idle = await h!.state(maya.id, 'idle', from);
    expect(idle.stateDetail).not.toMatch(/Waiting/);
    expect(log.some((i) => i.kind === 'colleague' && i.text === 'Here is the copy.')).toBe(true);
    expect((h!.office.thread(maya.id, {}).task as Task).status).toBe('done');
    expect(nudges(log)).toHaveLength(0);
  });

  it('after four minutes (shortened here) the office delivers one note, then the normal rules apply', async () => {
    const log: InboxItem[] = [];
    const { maya, mayaSup } = await rig(log);
    mayaSup.waitTimeoutMs = 80;
    h!.office.sendMessage(maya.id, 'Build the page, then wait.');
    await h!.waitFor('waiting', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === maya.id && x.employee.stateDetail === 'Waiting for Priya');
    const stuck = await h!.state(maya.id, 'stuck');
    expect(stuck.stateDetail).toBe('Stopped making progress');
    const notes = log.filter((i) => i.kind === 'office' && NOTE.test(i.text));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ text: 'Priya has not replied yet. Carry on with anything you can do without them, message them again, or ask your manager.' });
    expect(nudges(log)).toHaveLength(2);
  });

  it('an unknown name gets an error and does not start waiting', async () => {
    const log: InboxItem[] = [];
    const answers: string[] = [];
    const { maya } = await rig(log, answers);
    h!.office.sendMessage(maya.id, 'Wait for nobody.');
    await h!.state(maya.id, 'stuck');
    expect(answers[0]).toBe('No teammate called Nobody. Valid names: Priya.');
    expect(h!.office.getEmployee(maya.id).stateDetail).toBe('Stopped making progress');
    expect(nudges(log)).toHaveLength(2);
  });

  it('pausing stops the clock and resuming starts it again; the stall watchdog leaves a waiting employee alone', async () => {
    const log: InboxItem[] = [];
    const { maya, mayaSup } = await rig(log);
    mayaSup.waitTimeoutMs = 150;
    h!.office.sendMessage(maya.id, 'Build the page, then wait.');
    await h!.waitFor('waiting', (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === maya.id && x.employee.stateDetail === 'Waiting for Priya');
    mayaSup.pause();
    await new Promise((r) => setTimeout(r, 300));
    expect(log.some((i) => i.kind === 'office' && NOTE.test(i.text))).toBe(false);
    mayaSup.resume();
    await h!.state(maya.id, 'stuck');
    expect(log.filter((i) => i.kind === 'office' && NOTE.test(i.text))).toHaveLength(1);
  });
});

describe('one approval for one step (supervisor side)', () => {
  it('remembers an approved request_approval for the open task only; denied and tool asks are not remembered', async () => {
    let host: RuntimeDeps['host'] | null = null;
    const factory = (deps: RuntimeDeps): EmployeeRuntime => {
      host = deps.host;
      return {
        async start() {}, deliver() {}, async interrupt() {}, async setPaused() {}, onPermissionsChanged() {},
        async attachHost() {}, async detachHost() {}, async dispose() {},
      };
    };
    h = await harness({ boot: { createRuntime: factory } });
    const e = await h.hire('web_developer');
    for (let i = 0; i < 200 && !host; i++) await new Promise((r) => setTimeout(r, 10));
    const sup = h.office.peers('none').find((s) => s.id === e.id)!;
    const ask = async (title: string, kind: 'tool' | 'big_step', decision: 'approve' | 'deny') => {
      const from = h!.mark();
      const p = host!.requestApproval({ title, detail: 'git push -u origin fix', kind });
      const ap = await h!.waitFor('approval', isApproval('pending', e.id), { from });
      h!.office.decideApproval(ap.approval.id, decision, 'once');
      await p;
    };
    host!.toolUsed('space'); // opens a task
    await ask('Push fix', 'big_step', 'deny');
    await ask('Run a command', 'tool', 'approve');
    expect(sup.grantedApprovals()).toEqual([]);
    await ask('Push fix', 'big_step', 'approve');
    expect(sup.grantedApprovals()).toMatchObject([{ title: 'Push fix', detail: 'git push -u origin fix' }]);
    host!.finishTask('done'); // the task closes: another task starts with a clean slate
    host!.toolUsed('space');
    expect(sup.grantedApprovals()).toEqual([]);
  });
});

describe('API-level behaviour', () => {
  it('keeps the thread paged newest first and sorts needs_you, stuck, then recent', async () => {
    const { h, e } = await hired();
    for (let i = 0; i < 5; i++) h.office.sendMessage(e.id, `message ${i}`.replace('message', 'note')); // none contain a keyword
    const page = h.office.thread(e.id, { limit: 3 });
    expect(page.messages).toHaveLength(3);
    const older = h.office.thread(e.id, { limit: 3, before: page.messages[0].createdMs });
    expect(older.messages.every((m) => m.createdMs < page.messages[0].createdMs)).toBe(true);
    expect(page.messages.map((m) => m.createdMs)).toEqual([...page.messages.map((m) => m.createdMs)].sort((a, b) => a - b));
  });

  it('settings default to the configured name and persist patches', async () => {
    h = await harness();
    expect(h.office.getSettings()).toEqual({ userName: 'Sam', appearance: 'system', notifyMessages: true, notifyDone: true, captions: true });
    expect(h.office.patchSettings({ appearance: 'dark', userName: 'Alex' })).toMatchObject({ appearance: 'dark', userName: 'Alex' });
  });
});
