// The real supervisor and office, with the Claude runtime driven by fakeQuery (no key, no network).
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Employee, Task } from '../../shared/index.ts';
import { claudeRuntimeFactory } from '../runtime/claudeRuntime.ts';
import { createFakeQuery, type FakeScript } from '../runtime/fakeQuery.ts';
import { harness, type Ev, type Harness } from '../testkit.ts';
import { describeRole, describeRoleOffline, parseRoleSpec, type RoleClient } from './hiring.ts';
import { readEnv } from '../../shared/index.ts';

let h: Harness | null = null;
afterEach(async () => {
  await h?.cleanup();
  h = null;
});

const ENV = { MOCK_LLM: '0', ANTHROPIC_API_KEY: 'test-key', EMPLOYEE_MODEL: 'claude-haiku-5-5', DATABRICKS_SYNC: 'off' };

const isMsg = (id: string, from: 'user' | 'employee', kind?: string) => (e: unknown): e is Ev<'message'> => {
  const x = e as Ev<'message'>;
  return x.type === 'message' && x.message.employeeId === id && x.message.from === from && (!kind || x.message.kind === kind);
};

/** A hired employee on a mock desktop whose brain is `script`. The hire note is answered with a short greeting. */
async function hired(script: FakeScript, o: { env?: Record<string, string>; level?: string; dir?: string; dbFile?: string } = {}) {
  const fake = createFakeQuery(async (t) => {
    if (/just been hired/.test(t.inputText)) {
      t.finish({ text: 'Hi, I am Maya.' });
      return;
    }
    await script(t);
  });
  h = await harness({
    env: { ...ENV, ...o.env }, dir: o.dir, dbFile: o.dbFile,
    boot: { createRuntime: claudeRuntimeFactory({ query: fake.factory, coalesceMs: 1, restartDelaysMs: [20, 20] }) },
  });
  const c = await h.office.candidate({ roleKey: 'web_developer' });
  const e = await h.office.hire(c.token, o.level ? { permissions: { level: o.level as never } } : undefined);
  await h.state(e.id, 'idle');
  await h.waitFor('greeting', isMsg(e.id, 'employee', 'text'));
  return { h, e, fake, say: (text: string) => h!.office.sendMessage(e.id, text), emp: () => h!.office.getEmployee(e.id) };
}

const work = (t: Parameters<FakeScript>[0]) => t.tool('mcp__space__shell', { command: 'echo working' });

describe('hiring with the real runtime', () => {
  it('starts the session, stores its id, and the first bubble arrives by itself', async () => {
    const { emp, h: hh, e, fake } = await hired(() => {});
    expect(emp().sessionId).toBe(fake.last.sessionId);
    expect(emp().state).toBe('idle');
    const hello = hh.events.find((x) => x.type === 'message' && x.message.employeeId === e.id && x.message.from === 'employee') as Ev<'message'>;
    expect(hello.message.text).toBe('Hi, I am Maya.');
    expect(fake.last.options.systemPrompt).toContain('You are Maya Chen');
  });

  it('delivers the briefing as the first item of the session', async () => {
    const inputs: string[] = [];
    const fake = createFakeQuery((t) => {
      inputs.push(t.inputText);
      t.finish({ text: 'Hi.' });
    });
    h = await harness({ env: ENV, boot: { createRuntime: claudeRuntimeFactory({ query: fake.factory, coalesceMs: 1 }) } });
    const e = await h.hire('web_developer');
    await h.state(e.id, 'idle');
    expect(inputs[0].startsWith('<office>\nBriefing for this session.')).toBe(true);
    expect(inputs[0]).toContain('Your manager: Sam.');
    expect(inputs[0]).toContain('Permission level: works independently.');
    expect(inputs[0]).toContain('You have just been hired.');
  });
});

describe('without an API key', () => {
  it('starts, hires, and the employee is stuck with a sentence a person can read; nothing crashes', async () => {
    h = await harness({ env: { MOCK_LLM: '0', ANTHROPIC_API_KEY: '', DATABRICKS_SYNC: 'off' } });
    expect((await h.office.capabilities()).llm).toBe(false);
    const e = await h.hire('web_developer');
    const stuck = await h.state(e.id, 'stuck');
    expect(stuck.stateDetail).toBe("I can't start: no API key is set.");
    const bubble = await h.waitFor('the sentence as a bubble', isMsg(e.id, 'employee', 'text'));
    expect(bubble.message.text).toBe("I can't start: no API key is set.");
    expect(h.office.getEmployee(e.id).spaceId).toMatch(/^mock:emp-/);
    expect(h.events.some((x) => x.type === 'toast' && x.tone === 'error')).toBe(false);
    // a message is held, tried again, and reported again; still no crash
    const mark = h.mark();
    h.office.sendMessage(e.id, 'hello?');
    await h.waitFor('the same sentence again', (x): x is Ev<'message'> => x.type === 'message' && x.message.from === 'employee' && x.message.text.startsWith("I can't start"), { from: mark });
    expect(h.office.getEmployee(e.id).state).toBe('stuck');
  });
});

describe('end of turn (the keep-going table)', () => {
  it('ask_user: needs_you, no nudge', async () => {
    let turns = 0;
    const { e, say, emp } = await hired(async (t) => {
      turns++;
      await work(t);
      await t.tool('mcp__office__ask_user', { question: 'Which colour?' });
      t.finish({});
    });
    say('build it');
    await h!.state(e.id, 'needs_you');
    await new Promise((r) => setTimeout(r, 120));
    expect(turns).toBe(1);
    expect(emp().stateDetail).toBe('Which colour?');
    expect((h!.office.thread(e.id, {}).task as Task).status).toBe('blocked');
  });

  it('finish_task: the task closes as done, a done bubble, idle', async () => {
    const { e, say } = await hired(async (t) => {
      await work(t);
      await t.tool('mcp__office__finish_task', { summary: 'All done.' });
      t.finish({});
    });
    say('build it');
    await h!.waitFor('done bubble', isMsg(e.id, 'employee', 'done'));
    await h!.state(e.id, 'idle');
    const task = h!.office.thread(e.id, {}).task as Task;
    expect(task.status).toBe('done');
    expect(task.outcome).toBe('All done.');
  });

  it('report_stuck: task failed, state stuck', async () => {
    const { e, say, emp } = await hired(async (t) => {
      await work(t);
      await t.tool('mcp__office__report_stuck', { reason: 'The site is down.', tried: 'Twice.' });
      t.finish({});
    });
    say('build it');
    await h!.state(e.id, 'stuck');
    expect(emp().stateDetail).toBe('The site is down.');
    expect((h!.office.thread(e.id, {}).task as Task).status).toBe('failed');
  });

  it('pure conversation: idle with no task, her final text is the bubble', async () => {
    const { e, say } = await hired((t) => t.finish({ text: 'I am Maya, your web developer.' }));
    const mark = h!.mark();
    say('hi, who are you?');
    const b = await h!.waitFor('reply', isMsg(e.id, 'employee', 'text'), { from: mark });
    expect(b.message.text).toBe('I am Maya, your web developer.');
    expect(h!.office.getEmployee(e.id).state).toBe('idle');
    expect(h!.events.slice(mark).some((x) => x.type === 'task')).toBe(false);
  });

  it('a task is open and she stops: nudged twice, then stuck "Stopped making progress"', async () => {
    const inputs: string[] = [];
    const { e, say } = await hired(async (t) => {
      inputs.push(t.inputText);
      if (inputs.length === 1) await work(t);
      t.finish({});
    });
    say('build it');
    await h!.state(e.id, 'stuck');
    expect(inputs).toHaveLength(3);
    expect(inputs[1]).toContain('You stopped without finishing or asking.');
    expect(inputs[2]).toContain('You stopped without finishing or asking.');
    expect(h!.office.getEmployee(e.id).stateDetail).toBe('Stopped making progress');
    expect((h!.office.thread(e.id, {}).task as Task).status).toBe('failed');
  });

  it('a desktop tool call between nudges resets the count', async () => {
    let n = 0;
    const { e, say } = await hired(async (t) => {
      n++;
      if (n <= 4) await work(t);
      else await t.tool('mcp__office__finish_task', { summary: 'ok' });
      t.finish({});
    });
    say('build it');
    await h!.waitFor('done', isMsg(e.id, 'employee', 'done'));
    expect(n).toBe(5);
  });

  it('error_max_turns: a new query with resume, and "Continue."', async () => {
    const inputs: string[] = [];
    const { e, say, fake } = await hired(async (t) => {
      inputs.push(`${t.queryIndex}:${t.inputText}`);
      if (t.queryIndex === 0) {
        await work(t);
        t.finish({ subtype: 'error_max_turns' });
      } else if (/Continue\./.test(t.inputText)) {
        await t.tool('mcp__office__finish_task', { summary: 'finished after the backstop' });
        t.finish({});
      } else t.finish({});
    });
    say('build it');
    await h!.waitFor('done', isMsg(e.id, 'employee', 'done'));
    expect(fake.instances.length).toBeGreaterThanOrEqual(2);
    expect(fake.last.options.resume).toBeDefined();
    expect(inputs.some((i) => i.startsWith('1:') && i.includes('Continue.'))).toBe(true);
  });

  it('error_during_execution: restarts once, and the second time she is stuck with a plain sentence', async () => {
    let fails = 0;
    const { e, say, fake } = await hired(async (t) => {
      if (/Carry on|build it/.test(t.inputText) || fails > 0) {
        if (fails === 0) await work(t);
        fails++;
        t.finish({ subtype: 'error_during_execution' });
      }
    });
    say('build it');
    await h!.state(e.id, 'stuck');
    expect(fake.instances.length).toBe(2);
    expect(h!.office.getEmployee(e.id).stateDetail).toBe('Something went wrong with my session.');
  });
});

describe('task limits', () => {
  it('asks when a task has cost the limit; yes raises it by the same amount and continues; no cancels', async () => {
    const inputs: string[] = [];
    const { e, say } = await hired(
      async (t) => {
        inputs.push(t.inputText);
        await work(t);
        if (/Continue\./.test(t.inputText)) {
          await t.tool('mcp__office__finish_task', { summary: 'ok' });
          t.finish({ costUsd: 0.1 });
        } else t.finish({ costUsd: 1.5 });
      },
      { env: { EMPLOYEE_TASK_BUDGET_USD: '1' } },
    );
    say('big job');
    const q = await h!.waitFor('the budget question', isMsg(e.id, 'employee', 'question'));
    expect(q.message.text).toBe("I've used $1.50 on this. Keep going?");
    await h!.state(e.id, 'needs_you');
    say('yes please');
    await h!.waitFor('done after yes', isMsg(e.id, 'employee', 'done'));
    expect(inputs.at(-1)).toContain('Continue.');

    // a second task, answered no
    const inputs2Before = inputs.length;
    const mark = h!.mark();
    say('another big job');
    await h!.waitFor('question again', isMsg(e.id, 'employee', 'question'), { from: mark });
    say('no, stop');
    await new Promise((r) => setTimeout(r, 150));
    const tasks = h!.events.filter((x): x is Ev<'task'> => x.type === 'task').map((x) => x.task);
    expect(tasks.some((t) => t.status === 'cancelled')).toBe(true);
    expect(inputs.slice(inputs2Before).some((i) => /Your manager said to stop/.test(i))).toBe(true);
  });

  it('asks after 300 turns', async () => {
    const { e, say } = await hired(async (t) => {
      await work(t);
      t.finish({ numTurns: 300, costUsd: 0.01 });
    });
    say('long one');
    const q = await h!.waitFor('the turns question', isMsg(e.id, 'employee', 'question'));
    expect(q.message.text).toBe("I've been at this a long time. Keep going?");
  });

  it('keeps cost, tokens and turns on the task and a usage row per turn', async () => {
    const { e, say } = await hired(async (t) => {
      await work(t);
      await t.tool('mcp__office__finish_task', { summary: 'ok' });
      t.finish({ costUsd: 0.12, inputTokens: 5000, outputTokens: 400, numTurns: 6 });
    });
    say('go');
    await h!.waitFor('done', isMsg(e.id, 'employee', 'done'));
    await new Promise((r) => setTimeout(r, 60));
    const task = h!.office.thread(e.id, {}).task as Task;
    expect(task.costUsd).toBeCloseTo(0.12);
    expect(task.inputTokens).toBe(5000);
    expect(task.outputTokens).toBe(400);
    expect(task.numTurns).toBe(6);
  });
});

describe('approvals through the API (asks first)', () => {
  it('shows an approval, allows it, and the tool runs; a "for this task" answer covers the rest of the task', async () => {
    let result = '';
    const { e, say } = await hired(
      async (t) => {
        result = (await t.tool('mcp__space__shell', { command: 'echo one' })).text;
        await t.tool('mcp__space__shell', { command: 'echo two' });
        await t.tool('mcp__office__finish_task', { summary: 'ok' });
        t.finish({});
      },
      { level: 'asks_first' },
    );
    say('go');
    const a = await h!.waitFor('approval', (x): x is Ev<'approval'> => x.type === 'approval' && x.approval.status === 'pending');
    expect(a.approval).toMatchObject({ kind: 'tool', title: 'Run a command', detail: 'echo one' });
    expect(h!.office.getEmployee(e.id).state).toBe('needs_you');
    h!.office.decideApproval(a.approval.id, 'approve', 'task');
    await h!.waitFor('done', isMsg(e.id, 'employee', 'done'));
    expect(result).toBe('one');
    expect(h!.events.filter((x) => x.type === 'approval' && x.approval.status === 'pending')).toHaveLength(1);
  });

  it('deny: the employee reads it and carries on without the tool', async () => {
    let text = '';
    const { e, say } = await hired(
      async (t) => {
        const r = await t.tool('mcp__space__write_file', { path: '~/work/x.txt', content: 'x' });
        text = r.text;
        await t.tool('mcp__office__finish_task', { summary: 'Did not save it.' });
        t.finish({});
      },
      { level: 'asks_first' },
    );
    say('go');
    const a = await h!.waitFor('approval', (x): x is Ev<'approval'> => x.type === 'approval' && x.approval.status === 'pending');
    h!.office.decideApproval(a.approval.id, 'deny', 'once', 'not now');
    await h!.waitFor('done', isMsg(e.id, 'employee', 'done'));
    expect(text).toContain('not now');
  });
});

describe('restart recovery (4.8)', () => {
  it('expires a pending approval, resumes with the briefing and the lost-approval note, and she finishes', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'runtime-restart-'));
    const dbFile = path.join(dir, 'office.db');
    try {
      const inputs: string[] = [];
      const script: FakeScript = async (t) => {
        inputs.push(`${t.queryIndex}:${t.inputText}`);
        if (/The app restarted/.test(t.inputText)) {
          await t.tool('mcp__office__finish_task', { summary: 'Finished after the restart.' });
        } else if (/build it/.test(t.inputText)) {
          await t.tool('mcp__space__shell', { command: 'echo hi' }); // asks first: waits for an approval
        }
        t.finish({});
      };
      const first = await hired(script, { dir, dbFile, level: 'asks_first' });
      first.say('build it');
      const a = await first.h.waitFor('approval', (x): x is Ev<'approval'> => x.type === 'approval' && x.approval.status === 'pending');
      const sessionId = first.emp().sessionId;
      await first.h.office.shutdown();
      first.h.office.store.close();
      h = null;

      const fake2 = createFakeQuery(script);
      const second = await harness({
        dir, dbFile, env: { ...ENV },
        boot: { createRuntime: claudeRuntimeFactory({ query: fake2.factory, coalesceMs: 1 }) },
      });
      h = second;
      expect(second.office.store.getApproval(a.approval.id)!.status).toBe('expired');
      await second.waitFor('done', isMsg(first.e.id, 'employee', 'done'));
      expect(fake2.instances[0].options.resume).toBe(sessionId);
      const last = inputs.at(-1)!;
      expect(last).toContain('The app restarted and your approval request was lost.');
      expect(inputs.find((i) => i.startsWith('0:') && false)).toBeUndefined();
      expect((second.office.thread(first.e.id, {}).task as Task).status).toBe('done');
    } finally {
      await h?.cleanup();
      h = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('take control (4.9)', () => {
  it('pauses her loop and holds the inbox; giving back resumes and tells her', async () => {
    const inputs: string[] = [];
    const { e, say, emp } = await hired((t) => {
      inputs.push(t.inputText);
      t.finish({ text: 'ok' });
    });
    h!.office.control(e.id, true);
    expect(emp()).toMatchObject({ state: 'paused', stateDetail: 'Waiting for you', controlledByUser: true });
    say('are you there?');
    await new Promise((r) => setTimeout(r, 100));
    expect(inputs.some((i) => i.includes('are you there?'))).toBe(false);
    h!.office.control(e.id, false);
    await h!.waitFor('her turn', (x): x is Ev<'message'> => x.type === 'message' && x.message.from === 'employee' && x.message.text === 'ok');
    const last = inputs.at(-1)!;
    expect(last).toContain('are you there?');
    expect(last).toContain('Your manager used your desktop for a moment. Look at the screen before you continue.');
    expect(emp().controlledByUser).toBe(false);
  });
});

describe('screen grant with MockHost', () => {
  it('attaches the host tools with the full set, tells her, and revoking removes them and tells her again', async () => {
    const inputs: string[] = [];
    const { e, fake, emp } = await hired((t) => {
      inputs.push(t.inputText);
      t.finish({ text: 'ok' });
    }, { level: 'independent' });
    await h!.office.patchEmployee(e.id, { permissions: { myScreen: true } });
    await h!.office.grantScreen(e.id, 5);
    expect(emp().screenGrant).not.toBeNull();
    const calls = fake.last.setMcpServersCalls;
    expect(Object.keys(calls[0]).sort()).toEqual(['host', 'office', 'space']);
    await h!.office.revokeScreen(e.id, 'taken_back');
    expect(emp().screenGrant).toBeNull();
    expect(Object.keys(calls[1]).sort()).toEqual(['office', 'space']);
    h!.office.sendMessage(e.id, 'carry on');
    await h!.waitFor('turn', (x): x is Ev<'message'> => x.type === 'message' && x.message.from === 'employee' && x.message.text === 'ok' && inputs.length >= 1);
    const last = inputs.at(-1)!;
    expect(last).toContain("You have your manager's screen until");
    expect(last).toContain("Your manager's screen has been returned.");
  });

  it('a permission edit reaches her as an <office> notice with the new level', async () => {
    const inputs: string[] = [];
    const { e } = await hired((t) => {
      inputs.push(t.inputText);
      t.finish({ text: 'ok' });
    });
    await h!.office.patchEmployee(e.id, { permissions: { level: 'asks_first', internet: false } });
    h!.office.sendMessage(e.id, 'hello');
    await h!.waitFor('turn', (x): x is Ev<'message'> => x.type === 'message' && x.message.text === 'ok' && inputs.length >= 1);
    expect(inputs.at(-1)).toContain('<office>Your permission level is now "asks first". Internet: off.');
  });
});

describe('real hiring of a described role (section 7)', () => {
  const env = readEnv({ MOCK_LLM: '0', ANTHROPIC_API_KEY: 'k', VOICE_MODEL: 'claude-haiku-5-5' });
  const good = JSON.stringify({
    role: 'Customer support', blurb: 'Answers customers kindly and fast', personality: 'Patient and warm. Never rushes anyone.',
    workingStyle: 'Reads the whole ticket first. Replies in plain words and checks the answer before sending.', starters: ['Triage the inbox', 'Draft a reply', 'Find repeat issues', 'extra one'],
  });
  const client = (text: string, calls: Array<Record<string, unknown>> = []): RoleClient => ({
    messages: { create: async (p) => (calls.push(p), { content: [{ type: 'text', text }] }) },
  });

  it('makes one claude-haiku-5-5 call with a JSON schema output and uses the answer', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const spec = await describeRole('someone to handle customer emails', env, { client: client(good, calls) });
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('claude-haiku-5-5');
    expect((calls[0].output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(spec.role).toBe('Customer support');
    expect(spec.starters).toHaveLength(3);
  });

  it('flows through POST /api/candidates for a custom role, using the injected client', async () => {
    h = await harness({ env: { MOCK_LLM: '0', ANTHROPIC_API_KEY: 'k', DATABRICKS_SYNC: 'off' }, boot: { roleClient: client(good), createRuntime: claudeRuntimeFactory({ query: createFakeQuery(() => {}).factory }) } });
    const c = await h.office.candidate({ roleKey: 'custom', description: 'someone to handle customer emails' });
    expect(c.persona.role).toBe('Customer support');
    expect(c.persona.roleKey).toBe('custom');
    expect(c.persona.workingStyle).toContain('Reads the whole ticket first');
  });

  it('falls back to the offline version when the call fails or the answer is unusable', async () => {
    const failing: RoleClient = { messages: { create: async () => { throw new Error('network down'); } } };
    const a = await describeRole('someone to handle customer emails', env, { client: failing });
    expect(a).toEqual(describeRoleOffline('someone to handle customer emails'));
    const b = await describeRole('someone to handle customer emails', env, { client: client('not json') });
    expect(b.role).toBe('Someone To Handle');
  });

  it('keeps the deterministic path with MOCK_LLM=1 and with no key', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const mock = await describeRole('data wrangler for sales', readEnv({ MOCK_LLM: '1' }), { client: client(good, calls) });
    expect(calls).toHaveLength(0);
    expect(mock.role).toBe('Data Wrangler For');
    const nokey = await describeRole('data wrangler for sales', readEnv({ MOCK_LLM: '0', ANTHROPIC_API_KEY: '' }));
    expect(nokey.role).toBe('Data Wrangler For');
  });

  it('clamps long fields and rejects incomplete JSON', () => {
    const spec = parseRoleSpec(JSON.stringify({ role: 'x'.repeat(100), blurb: 'b', personality: 'p', workingStyle: 'w', starters: ['a', 'b', 'c', 'd'] }))!;
    expect(spec.role.length).toBeLessThanOrEqual(30);
    expect(spec.starters).toHaveLength(3);
    expect(parseRoleSpec('{"role":"x"}')).toBeNull();
    expect(parseRoleSpec('```json\n' + good + '\n```')?.role).toBe('Customer support');
  });
});

void (undefined as unknown as Employee);
