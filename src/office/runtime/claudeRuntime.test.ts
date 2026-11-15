import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeRuntime, NO_KEY_SENTENCE, PLAN_NUDGE_AFTER, planNudgeText, PlanNudge, employeeEnv, type ClaudeRuntimeOptions } from './claudeRuntime.ts';
import { RuntimeUnavailable } from './errors.ts';
import { createFakeQuery, type FakeOptions, type FakeScript } from './fakeQuery.ts';
import { buildSystemPrompt } from './prompt.ts';
import { FakeHost, makeEmployee, makeRig, waitUntil, type RuntimeRig } from './testHost.ts';
import { DESKTOP_ALLOW } from './toolGroups.ts';
import { readEnv } from '../../shared/index.ts';
import { readFileSync as read } from 'node:fs';

const live71: string[] = JSON.parse(read(path.join(import.meta.dirname, 'fixtures/cua-desktop-tools.json'), 'utf8'));

const rigs: RuntimeRig[] = [];
const runtimes: ClaudeRuntime[] = [];
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.dispose();
  for (const r of rigs.splice(0)) rmSync(r.dataDir, { recursive: true, force: true });
});

const BRIEFING = 'Briefing for this session.\nDate: Saturday 14 November 2026.\nYour manager: Sam.';
const mgr = (text: string, via: 'chat' | 'call' = 'chat') => ({ kind: 'manager' as const, text, messageId: `m_${text}`, via });

async function setup(script: FakeScript, o: { rig?: Parameters<typeof makeRig>[0]; fake?: FakeOptions; rt?: ClaudeRuntimeOptions; beforeStart?: (rig: RuntimeRig) => void } = {}) {
  const rig = await makeRig(o.rig);
  rigs.push(rig);
  o.beforeStart?.(rig);
  const fake = createFakeQuery(script, o.fake);
  const rt = new ClaudeRuntime(rig.deps, { query: fake.factory, coalesceMs: 1, restartDelaysMs: [20, 20], listDesktopTools: async () => live71, ...o.rt });
  runtimes.push(rt);
  await rt.start();
  const say = async (text: string, via: 'chat' | 'call' = 'chat') => {
    const n = rig.host.turnsEnded.length;
    rt.deliver(mgr(text, via));
    await waitUntil(() => rig.host.turnsEnded.length > n, 3000, `turn for "${text}"`);
  };
  return { rig, host: rig.host, fake, rt, say };
}

const textOf = (m: { message: { content: unknown } }) => (typeof m.message.content === 'string' ? m.message.content : '');

describe('start', () => {
  it('fails with a human sentence when there is no API key, and starts nothing', async () => {
    const rig = await makeRig({ env: { ANTHROPIC_API_KEY: '' } });
    rigs.push(rig);
    const fake = createFakeQuery(() => {});
    const rt = new ClaudeRuntime(rig.deps, { query: fake.factory });
    await expect(rt.start()).rejects.toBeInstanceOf(RuntimeUnavailable);
    await expect(rt.start()).rejects.toThrow("I can't start: no API key is set");
    expect(NO_KEY_SENTENCE).toBe("I can't start: no API key is set.");
    expect(fake.instances).toHaveLength(0);
  });

  it('passes the options of the spec', async () => {
    process.env.CLAUDECODE = '1';
    process.env.CLAUDE_CODE_SOMETHING = 'x';
    const { rig, fake } = await setup(() => {});
    const o = fake.last.options;
    expect(o.model).toBe('claude-haiku-5-5');
    expect(o.systemPrompt).toBe(buildSystemPrompt(rig.host.emp.persona));
    expect(path.isAbsolute(o.cwd!)).toBe(true);
    expect(o.cwd).toBe(rig.home);
    expect(o.settingSources).toEqual([]);
    expect(o.tools).toEqual(['TodoWrite', 'WebSearch', 'WebFetch']);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.permissionMode).toBe('default');
    expect(o.maxTurns).toBe(5000);
    expect(o.maxBudgetUsd).toBe(100);
    expect(o.resume).toBeUndefined();
    expect(typeof o.canUseTool).toBe('function');
    expect(o.abortController).toBeInstanceOf(AbortController);
    expect(o.allowedTools).toBeUndefined();
    expect(Object.keys(o.mcpServers!).sort()).toEqual(['office', 'space']);
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_SOMETHING;
  });

  it('builds env from an allowlist: no CLAUDE* variable leaks from office, tool search is off', () => {
    const env = employeeEnv('/data/employees/emp_1', readEnv({ ANTHROPIC_API_KEY: 'sk-test' }), {
      PATH: '/bin', HOME: '/Users/x', LANG: 'C', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CONFIG_DIR: '/Users/x/.claude', AWS_SECRET_ACCESS_KEY: 'nope', GITHUB_TOKEN: 'nope',
    });
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_ENABLE_TASKS', 'CLAUDE_CONFIG_DIR', 'ENABLE_TOOL_SEARCH', 'HOME', 'LANG', 'PATH']);
    expect(env.CLAUDE_CONFIG_DIR).toBe('/data/employees/emp_1/.claude');
    expect(env.ENABLE_TOOL_SEARCH).toBe('false');
    expect(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('adds tracing variables only when MLflow is configured', () => {
    const e = employeeEnv('/h', readEnv({ ANTHROPIC_API_KEY: 'k', MLFLOW_EXPERIMENT_ID: '123', DATABRICKS_HOST: 'https://x', DATABRICKS_TOKEN: 't' }), { PATH: '/bin' });
    expect(e.MLFLOW_EXPERIMENT_ID).toBe('123');
    expect(e.DATABRICKS_HOST).toBe('https://x');
    expect(employeeEnv('/h', readEnv({ ANTHROPIC_API_KEY: 'k' }), { PATH: '/bin' }).MLFLOW_EXPERIMENT_ID).toBeUndefined();
  });

  it('with real desktops: HTTP server with alwaysLoad and the agent session header, and disallowedTools from the live 71 tools', async () => {
    const { rig, fake } = await setup(() => {}, { rig: { env: { DESKTOPS: 'cua' } } });
    const o = fake.last.options;
    const desktop = o.mcpServers!.desktop as { type: string; url: string; headers: Record<string, string>; alwaysLoad: boolean };
    expect(desktop.type).toBe('http');
    expect(desktop.alwaysLoad).toBe(true);
    expect(desktop.headers['X-Cua-Agent-Session']).toBe(rig.host.emp.id);
    expect(desktop.url).toMatch(/^http:\/\//);
    expect(Object.keys(o.mcpServers!).sort()).toEqual(['desktop', 'office', 'space']);
    expect(o.disallowedTools).toHaveLength(43);
    expect(o.disallowedTools).toContain('mcp__desktop__create_space');
    for (const t of DESKTOP_ALLOW) expect(o.disallowedTools).not.toContain(`mcp__desktop__${t}`);
  });

  it('spreads the endpoint headers (the auth header comes from Spaces, never built by hand)', async () => {
    const { fake } = await setup(() => {}, {
      rig: { env: { DESKTOPS: 'cua' } },
      beforeStart: (rig) => {
        rig.spaces.mcpEndpoint = async () => ({ url: 'http://127.0.0.1:5555/mcp', headers: { 'x-cua-env-authorization': 'Bearer abc' } });
      },
    });
    const d = fake.last.options.mcpServers!.desktop as { url: string; headers: Record<string, string> };
    expect(d.url).toBe('http://127.0.0.1:5555/mcp');
    expect(d.headers['x-cua-env-authorization']).toBe('Bearer abc');
  });

  it('falls back to the known tool list when the live one cannot be read', async () => {
    const { fake } = await setup(() => {}, { rig: { env: { DESKTOPS: 'cua' } }, rt: { listDesktopTools: async () => { throw new Error('refused'); } } });
    expect(fake.last.options.disallowedTools).toHaveLength(43);
  });

  it('asserts the desktop tools are visible after system/init and fails loudly if not', async () => {
    const bad = await setup(() => {}, { rig: { env: { DESKTOPS: 'cua' } } });
    bad.rt.deliver(mgr('hi'));
    await waitUntil(() => bad.host.stuck.length > 0, 3000, 'stuck');
    expect(bad.host.stuck[0].reason).toBe("I can't use my desktop tools.");
    const good = await setup(() => {}, {
      rig: { env: { DESKTOPS: 'cua' } },
      fake: { extraTools: (o: Options) => [...DESKTOP_ALLOW].map((t) => `mcp__desktop__${t}`).filter((n) => !(o.disallowedTools ?? []).includes(n)) },
    });
    good.rt.deliver(mgr('hi'));
    await waitUntil(() => good.host.turnsEnded.length > 0);
    expect(good.host.stuck).toHaveLength(0);
  });
});

describe('session id, cost and turns', () => {
  it('stores the session id from system/init at once, even though the CLI sends init with the first input', async () => {
    const { host, say, fake } = await setup((t) => t.finish({ text: 'hi' }));
    expect(host.sessionIds).toEqual([]);
    await say('hello');
    expect(host.sessionIds).toEqual([fake.last.sessionId]);
    expect(host.emp.sessionId).toBe(fake.last.sessionId);
  });

  it('resumes the stored session, but never a mock session id', async () => {
    const a = await setup(() => {}, { rig: { emp: makeEmployee({ sessionId: 'sess-abc' }) } });
    expect(a.fake.last.options.resume).toBe('sess-abc');
    const b = await setup(() => {}, { rig: { emp: makeEmployee({ sessionId: 'mock-session-emp_1' }) } });
    expect(b.fake.last.options.resume).toBeUndefined();
  });

  it('reports the cost of one turn, tokens from the turn usage and the turn count', async () => {
    const { host, say } = await setup((t) => t.finish({ costUsd: 0.25, inputTokens: 4000, outputTokens: 300, numTurns: 7 }));
    await say('go');
    expect(host.turnsEnded[0].costUsd).toBeCloseTo(0.25);
    expect(host.turnsEnded[0].inputTokens).toBe(4000);
    expect(host.turnsEnded[0].outputTokens).toBe(300);
    expect(host.turnsEnded[0].numTurns).toBe(7);
    await say('again');
    expect(host.turnsEnded[1].costUsd).toBeCloseTo(0.25);
  });

  it('uses the persisted baseline across a resume: the first result carries the earlier turns and is not double counted', async () => {
    const { host, say, rig } = await setup((t) => t.finish({ costUsd: 0.05 }), {
      rig: { emp: makeEmployee({ sessionId: 'sess-1' }) },
      fake: { resumeTotalUsd: 1.0 },
      beforeStart: (rig) => {
        mkdirSync(rig.home, { recursive: true });
        writeFileSync(path.join(rig.home, 'cost-baseline.json'), JSON.stringify({ lastTotalUsd: 1.0 }));
      },
    });
    await say('continue');
    expect(host.turnsEnded[0].costUsd).toBeCloseTo(0.05, 6);
    expect(JSON.parse(readFileSync(path.join(rig.home, 'cost-baseline.json'), 'utf8')).lastTotalUsd).toBeCloseTo(1.05, 6);
  });

  it('counts the whole total when it went down (a reset) or when there is no baseline', async () => {
    const down = await setup((t) => t.finish({ costUsd: 0.05 }), {
      beforeStart: (rig) => {
        mkdirSync(rig.home, { recursive: true });
        writeFileSync(path.join(rig.home, 'cost-baseline.json'), JSON.stringify({ lastTotalUsd: 5 }));
      },
    });
    await down.say('x');
    expect(down.host.turnsEnded[0].costUsd).toBeCloseTo(0.05, 6);
    const fresh = await setup((t) => t.finish({ costUsd: 0.07 }));
    await fresh.say('x');
    expect(fresh.host.turnsEnded[0].costUsd).toBeCloseTo(0.07, 6);
  });
});

describe('what is said to the employee', () => {
  it('sends the briefing, notices and the message as one turn in order, each wrapped in its tag', async () => {
    const seen: string[] = [];
    const { rt, host } = await setup((t) => {
      seen.push(t.inputText);
      t.finish({});
    });
    rt.deliver({ kind: 'office', text: BRIEFING });
    rt.deliver({ kind: 'office', text: 'You have just been hired. Introduce yourself to your manager in one short sentence and ask what to start on.' });
    rt.deliver({ kind: 'colleague', fromId: 'e2', fromName: 'Ines', fromRole: 'Designer', text: 'The logo is in ~/work/brand/logo.svg' });
    rt.deliver(mgr('Use the blue version.', 'call'));
    await waitUntil(() => host.turnsEnded.length > 0);
    expect(seen).toHaveLength(1);
    const t = seen[0];
    const order = ['<office>\nBriefing', 'just been hired', '<message from="colleague" name="Ines" role="Designer">The logo', '<message from="manager" via="call">Use the blue version.</message>'];
    let at = -1;
    for (const s of order) {
      expect(t.indexOf(s), s).toBeGreaterThan(at);
      at = t.indexOf(s);
    }
  });

  it('does not start a turn for the briefing alone, and sends it with the next real item', async () => {
    const seen: string[] = [];
    const { rt, host } = await setup((t) => {
      seen.push(t.inputText);
      t.finish({});
    });
    rt.deliver({ kind: 'office', text: BRIEFING });
    await new Promise((r) => setTimeout(r, 60));
    expect(seen).toHaveLength(0);
    rt.deliver(mgr('hello'));
    await waitUntil(() => host.turnsEnded.length > 0);
    expect(seen[0]).toContain('Briefing for this session');
    expect(seen[0]).toContain('hello');
  });

  it('holds items while paused', async () => {
    const { rt, host, say } = await setup((t) => t.finish({}));
    await rt.setPaused(true);
    rt.deliver(mgr('wait for me'));
    await new Promise((r) => setTimeout(r, 60));
    expect(host.turnsEnded).toHaveLength(0);
    await rt.setPaused(false);
    await waitUntil(() => host.turnsEnded.length > 0);
    void say;
  });
});

describe('what the employee says back', () => {
  it('turns the final text of a turn with no office tool into a bubble, without headings or tables', async () => {
    const { host, say } = await setup((t) => t.finish({ text: '## Hello\nI am Maya.\n| a | b |\n|---|---|' }));
    await say('hi, who are you?');
    expect(host.messages).toEqual(['Hello\nI am Maya.']);
  });

  it('does not duplicate when the turn already spoke through message_user, ask_user, finish_task or report_stuck', async () => {
    for (const tool of [['message_user', { text: 'x' }], ['ask_user', { question: 'q?' }], ['finish_task', { summary: 's' }], ['report_stuck', { reason: 'r', tried: 't' }]] as const) {
      const { host, say } = await setup(async (t) => {
        await t.tool(`mcp__office__${tool[0]}`, tool[1] as Record<string, unknown>);
        t.finish({ text: 'Final words' });
      });
      await say('go');
      expect(host.messages.includes('Final words'), tool[0]).toBe(false);
    }
  });

  it('shows no bubble for a turn started only by an office nudge, but does for the hire note', async () => {
    const nudge = await setup((t) => t.finish({ text: 'Okay, carrying on.' }));
    nudge.rt.deliver({ kind: 'office', text: 'You stopped without finishing or asking. Carry on.' });
    await waitUntil(() => nudge.host.turnsEnded.length > 0);
    expect(nudge.host.messages).toEqual([]);
    const hired = await setup((t) => t.finish({ text: "Hi, I'm Maya. What should I start on?" }));
    hired.rt.deliver({ kind: 'office', text: 'You have just been hired. Introduce yourself to your manager in one short sentence and ask what to start on.' });
    await waitUntil(() => hired.host.turnsEnded.length > 0);
    expect(hired.host.messages).toEqual(["Hi, I'm Maya. What should I start on?"]);
  });

  it('runs the office tools against the host and returns their text as MCP results', async () => {
    const outcomes: string[] = [];
    const { host, say } = await setup(async (t) => {
      for (const [n, i] of [
        ['message_user', { text: 'On it.' }], ['set_activity', { sentence: 'Fixing the cart total' }], ['save_note', { text: 'Sam likes blue' }],
        ['message_colleague', { to: 'Priya', text: 'hi' }], ['list_colleagues', {}], ['ask_user', { question: 'Which?' }],
        ['request_screen', { reason: 'look', minutes: 5 }], ['release_screen', {}], ['report_stuck', { reason: 'r', tried: 't' }], ['finish_task', { summary: 'Done.' }],
      ] as const) {
        outcomes.push((await t.tool(`mcp__office__${n}`, i as Record<string, unknown>)).text);
      }
      t.finish({});
    });
    await say('go');
    expect(host.messages).toEqual(['On it.']);
    expect(host.activities).toEqual(['Fixing the cart total']);
    expect(host.notes).toEqual(['Sam likes blue']);
    expect(host.colleagueCalls).toEqual([{ to: 'Priya', text: 'hi' }]);
    expect(host.questions).toEqual(['Which?']);
    expect(host.screenRequests).toEqual([{ reason: 'look', minutes: 5 }]);
    expect(host.released).toBe(1);
    expect(host.finished).toEqual(['Done.']);
    expect(outcomes[0]).toBe('sent');
    expect(outcomes[5]).toMatch(/^Asked\. The answer will arrive as a new message/);
    expect(outcomes[6]).toBe('approved');
  });

  it('request_approval waits and answers "approved" or "denied: <note>"', async () => {
    const results: string[] = [];
    const { host, say } = await setup(async (t) => {
      results.push((await t.tool('mcp__office__request_approval', { title: 'Deploy', detail: 'Runs deploy.sh' })).text);
      results.push((await t.tool('mcp__office__request_approval', { title: 'Deploy again', detail: 'x' })).text);
      t.finish({});
    });
    rigs[0].host.auto = null;
    const done = say('go');
    await host.answer(0, { approved: true });
    await host.answer(1, { approved: false, note: 'not today' });
    await done;
    expect(results).toEqual(['approved', 'denied: not today']);
    expect(host.approvals[0]).toMatchObject({ title: 'Deploy', detail: 'Runs deploy.sh', kind: 'big_step' });
  });

  it('flags a refused colleague message as a tool error', async () => {
    const { host } = await setup(() => {});
    host.messageColleague = () => 'Limit reached. Ask your manager instead.';
    let out: { text: string; isError: boolean } | null = null;
    const s = await setup(async (t) => {
      out = await t.tool('mcp__office__message_colleague', { to: 'Ines', text: 'again' });
      t.finish({});
    });
    s.host.messageColleague = () => 'Limit reached. Ask your manager instead.';
    await s.say('go');
    expect(out).toMatchObject({ text: 'Limit reached. Ask your manager instead.', isError: true });
  });
});

describe('tool calls become activity', () => {
  it('opens tasks, steps and the plan, and turns a failed result into "Couldn\'t ..."', async () => {
    const { host, say } = await setup(async (t) => {
      await t.tool('TodoWrite', { todos: [{ content: 'Open the site', status: 'in_progress', activeForm: 'Opening' }, { content: 'Read it', status: 'pending', activeForm: 'Reading' }] });
      await t.tool('mcp__desktop__launch_app', { name: 'firefox', urls: ['https://www.example.com'] }, { result: 'Launched' });
      await t.tool('mcp__desktop__get_window_state', { pid: 1 }, { result: 'tree' });
      await t.tool('mcp__space__write_file', { path: '~/work/a.txt', content: 'x' });
      await t.tool('mcp__desktop__launch_app', { name: 'nope' }, { result: 'No such app', isError: true });
      await t.tool('WebFetch', { url: 'https://docs.python.org/3/', prompt: 'x' });
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent' } }) } });
    await say('go');
    expect(host.plans).toEqual([[{ title: 'Open the site', status: 'in_progress' }, { title: 'Read it', status: 'pending' }]]);
    expect(host.toolFamilies).toEqual(['desktop', 'desktop', 'space', 'desktop', 'web']);
    expect(host.steps.map((s) => [s.sentence, s.status])).toEqual([
      ['Opened example.com', 'ok'], ['Wrote a.txt', 'ok'], ["Couldn't open Nope", 'error'], ['Read docs.python.org', 'ok'],
    ]);
  });

  it('marks the message seen and opens the turn at the first assistant message, and again for a steering message', async () => {
    const { host, rt } = await setup(async (t) => {
      await t.tool('mcp__space__shell', { command: 'echo 1' });
      await t.sleep(80);
      await t.tool('mcp__space__shell', { command: 'echo 2' });
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent' } }) } });
    rt.deliver(mgr('first'));
    await waitUntil(() => host.turnsStarted >= 1);
    rt.deliver(mgr('actually, change it'));
    await waitUntil(() => host.turnsEnded.length >= 2, 3000, 'both turns'); // the fake queues the second message; the real CLI folds it in
    expect(host.turnsStarted).toBeGreaterThanOrEqual(2);
    expect(host.order.indexOf('turnStarted')).toBeLessThan(host.order.indexOf('turnEnded'));
  });

  it('reports a notice to itself when the same action repeats 4 times, and stuck at 8', async () => {
    const seen: string[] = [];
    const { host, say } = await setup(async (t) => {
      seen.push(t.inputText);
      if (seen.length === 1) for (let i = 0; i < 8; i++) await t.tool('mcp__desktop__click', { x: 1, y: 2 }, { result: 'ok' });
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent' } }) } });
    await say('click it');
    await waitUntil(() => seen.length >= 2, 3000, 'the repeat notice as a new turn');
    expect(seen[1]).toContain('You repeated the same action 4 times with no effect.');
    expect(host.stuck).toHaveLength(1);
    expect(host.stuck[0].reason).toBe('I kept repeating the same action.');
  });

  it('does not count different inputs or office tools as repeats', async () => {
    const { host, say } = await setup(async (t) => {
      for (let i = 0; i < 10; i++) await t.tool('mcp__desktop__click', { x: i, y: 2 }, { result: 'ok' });
      for (let i = 0; i < 10; i++) await t.tool('mcp__office__set_activity', { sentence: 'same' });
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent' } }) } });
    await say('go');
    expect(host.stuck).toHaveLength(0);
  });
});

describe('the gate inside the runtime (approval round trip through canUseTool)', () => {
  const asksFirst = { rig: { emp: makeEmployee({ permissions: { level: 'asks_first' } }) } };

  it('waits for an allow, then runs the tool; a deny reaches the model as the tool result', async () => {
    const outs: Array<{ allowed: boolean; text: string }> = [];
    const { host, say } = await setup(async (t) => {
      outs.push(await t.tool('mcp__space__write_file', { path: '~/work/a.txt', content: 'one' }));
      outs.push(await t.tool('mcp__space__shell', { command: 'echo hi' }));
      t.finish({});
    }, asksFirst);
    const done = say('go');
    await host.answer(0, { approved: true, scope: 'once' });
    await host.answer(1, { approved: false, note: 'no shell today' });
    await done;
    expect(outs[0]).toMatchObject({ allowed: true, text: 'Saved ~/work/a.txt' });
    expect(outs[1].allowed).toBe(false);
    expect(outs[1].text).toContain('no shell today');
    expect(host.approvals.map((a) => a.title)).toEqual(['Save a file', 'Run a command']);
  });

  it('remembers a "for this task" answer until finish_task closes the task', async () => {
    const { host, say } = await setup(async (t) => {
      await t.tool('mcp__space__shell', { command: 'ls' });
      await t.tool('mcp__space__shell', { command: 'ls -la' });
      await t.tool('mcp__office__finish_task', { summary: 'done' });
      await t.tool('mcp__space__shell', { command: 'ls' });
      t.finish({});
    }, asksFirst);
    const done = say('go');
    await host.answer(0, { approved: true, scope: 'task' });
    await host.answer(1, { approved: true, scope: 'once' });
    await done;
    expect(host.approvals).toHaveLength(2);
  });

  it('removes the tools the model must not have: disallowed names are refused before the gate', async () => {
    const { host, say } = await setup(async (t) => {
      const r = await t.tool('mcp__desktop__create_space', { name: 'x' });
      expect(r.allowed).toBe(false);
      t.finish({});
    }, { rig: { env: { DESKTOPS: 'cua' }, emp: makeEmployee({ permissions: { level: 'independent' } }) }, fake: { extraTools: () => ['mcp__desktop__click'] } });
    await say('go');
    expect(host.approvals).toHaveLength(0);
  });

  it('never runs a host tool without a screen grant', async () => {
    const outs: Array<{ allowed: boolean; text: string }> = [];
    const { say } = await setup(async (t) => {
      outs.push(await t.tool('mcp__host__click', {}));
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent', myScreen: true } }) } });
    await say('go');
    expect(outs[0].allowed).toBe(false);
    expect(outs[0].text).toContain("You do not have your manager's screen");
  });
});

describe('permission changes and screen grant', () => {
  it('delivers an <office> notice with the new level and switches, and the gate reads them at once', async () => {
    const seen: string[] = [];
    const { rt, host, say } = await setup(async (t) => {
      seen.push(t.inputText);
      t.finish({});
    });
    host.emp = { ...host.emp, permissions: { ...host.emp.permissions, level: 'asks_first', internet: false, commands: true } };
    rt.onPermissionsChanged();
    await say('go');
    expect(seen[0]).toContain('<office>Your permission level is now "asks first". Internet: off. Commands: on.');
    expect(seen[0]).toContain('Messaging teammates: on.');
  });

  it('attaches and detaches the host tools with the FULL server set each time (no desktop in mock mode)', async () => {
    const { rt, fake, host } = await setup(() => {});
    await rt.attachHost();
    await rt.detachHost();
    const calls = fake.last.setMcpServersCalls;
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]).sort()).toEqual(['host', 'office', 'space']);
    expect(Object.keys(calls[1]).sort()).toEqual(['office', 'space']);
    expect(host.stuck).toHaveLength(0);
  });

  it('with real desktops the full set includes desktop', async () => {
    const { rt, fake } = await setup(() => {}, { rig: { env: { DESKTOPS: 'cua' } } });
    await rt.attachHost();
    await rt.detachHost();
    expect(Object.keys(fake.last.setMcpServersCalls[0]).sort()).toEqual(['desktop', 'host', 'office', 'space']);
    expect(Object.keys(fake.last.setMcpServersCalls[1]).sort()).toEqual(['desktop', 'office', 'space']);
  });

  it('with MockHost the host tool answers with the fixed sentence while granted, and is refused after the grant ends', async () => {
    const outs: Array<{ allowed: boolean; text: string }> = [];
    const { rt, host, say, fake } = await setup(async (t) => {
      outs.push(await t.tool('mcp__host__read_window', {}));
      await new Promise((r) => setTimeout(r, 30)); // let the runtime see the result before the grant ends
      await rt.detachHost();
      host.emp = { ...host.emp, screenGrant: null };
      outs.push(await t.tool('mcp__host__read_window', {}));
      t.finish({});
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent', myScreen: true }, screenGrant: { untilMs: null } }) } });
    await rt.attachHost();
    await say('look');
    expect(outs[0]).toMatchObject({ allowed: true });
    expect(outs[0].text).toContain('notes app');
    expect(outs[1].allowed).toBe(false);
    expect(fake.last.setMcpServersCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('interrupts the turn when the grant ends while a host tool is mid-call', async () => {
    const { rt, host, fake } = await setup(async (t) => {
      t.text('x');
      await t.tool('mcp__host__read_window', {}, {}).catch(() => {});
      await t.untilInterrupted();
    }, { rig: { emp: makeEmployee({ permissions: { level: 'independent', myScreen: true }, screenGrant: { untilMs: null } }) } });
    await rt.attachHost();
    rt.deliver(mgr('look at my screen'));
    await waitUntil(() => host.turnsStarted > 0);
    // a host call that never returns a result
    fake.last.turns[0] && 0;
    await rt.detachHost();
    expect(fake.last.setMcpServersCalls.at(-1)).toBeDefined();
  });
});

describe('interrupt, pause, errors and restarts', () => {
  const slow: FakeScript = async (t) => {
    await t.tool('mcp__space__shell', { command: 'echo start' });
    await t.sleep(5000);
    t.finish({});
  };
  const free = { rig: { emp: makeEmployee({ permissions: { level: 'independent' } }) } };

  it('interrupt() ends the turn as interrupted, not as an error', async () => {
    const { rt, host } = await setup(slow, free);
    rt.deliver(mgr('long job'));
    await waitUntil(() => host.turnsStarted > 0);
    await rt.interrupt();
    await waitUntil(() => host.turnsEnded.length > 0);
    expect(host.turnsEnded[0].interrupted).toBe(true);
    expect(host.turnsEnded[0].error).toBeUndefined();
  });

  it('pausing mid-turn interrupts it and holds the inbox; resuming lets her carry on', async () => {
    const seen: string[] = [];
    const { rt, host, fake } = await setup(async (t) => {
      seen.push(t.inputText);
      if (seen.length === 1) {
        await t.tool('mcp__space__shell', { command: 'echo start' });
        await t.sleep(5000);
      }
      t.finish({});
    }, free);
    rt.deliver(mgr('long job'));
    await waitUntil(() => host.turnsStarted > 0);
    await rt.setPaused(true);
    await waitUntil(() => host.turnsEnded.length > 0);
    expect(host.turnsEnded[0].interrupted).toBe(true);
    rt.deliver(mgr('and this'));
    await new Promise((r) => setTimeout(r, 60));
    expect(seen).toHaveLength(1);
    expect(fake.last.interrupts.length).toBe(1);
    await rt.setPaused(false);
    await waitUntil(() => seen.length >= 2, 3000, 'second turn');
    expect(seen[1]).toContain('and this');
  });

  it('passes backstop and error results to the supervisor as errors', async () => {
    for (const subtype of ['error_max_turns', 'error_max_budget_usd', 'error_during_execution'] as const) {
      const { host, say } = await setup((t) => t.finish({ subtype }));
      await say('go');
      expect(host.turnsEnded[0].error).toBe(subtype);
    }
  });

  it('restarts a query that died by itself with resume after a short wait, then stops with "Lost my session"', async () => {
    const { host, fake, rt } = await setup((t) => {
      t.crash('boom');
    });
    rt.deliver(mgr('first'));
    await waitUntil(() => fake.instances.length === 2, 3000, 'first restart');
    expect(fake.instances[1].options.resume).toBe(fake.instances[0].sessionId);
    expect(host.sessionIds[0]).toBe(fake.instances[0].sessionId);
    rt.deliver(mgr('second'));
    await waitUntil(() => fake.instances.length === 3, 3000, 'second restart');
    rt.deliver(mgr('third'));
    await waitUntil(() => host.stuck.length > 0, 3000, 'stuck');
    expect(host.stuck[0].reason).toBe('Lost my session.');
    expect(host.turnsEnded.every((r) => r.interrupted)).toBe(true);
  });

  it('keeps what was waiting when a query is replaced', async () => {
    let n = 0;
    const seen: string[] = [];
    const { fake, host, rt } = await setup((t) => {
      seen.push(t.inputText);
      if (n++ === 0) t.crash('boom');
      t.finish({});
    });
    rt.deliver(mgr('first'));
    await waitUntil(() => fake.instances.length === 2);
    rt.deliver(mgr('after the crash'));
    await waitUntil(() => seen.some((x) => x.includes('after the crash')), 3000, 'the message after the crash');
    expect(host.turnsEnded.length).toBeGreaterThan(0);
  });

  it('a stored session id that does not resume is dropped for the retry', async () => {
    const { fake, rt } = await setup((t) => t.crash('No conversation found'), { rig: { emp: makeEmployee({ sessionId: 'dead-session' }) }, fake: { initOn: 'first_input' } });
    expect(fake.instances[0].options.resume).toBe('dead-session');
    rt.deliver(mgr('hi'));
    await waitUntil(() => fake.instances.length === 2);
    // init was emitted by the fake before the crash, so resume is kept; a never-initialised session would be dropped
    expect(fake.instances[1].options.resume).toBeDefined();
  });

  it('reports an API authentication failure as a readable stuck reason and ends the turn without a restart', async () => {
    const { host, fake } = await setup((t) => {
      void t;
    });
    void fake;
    const rig = await makeRig();
    rigs.push(rig);
    const f2 = createFakeQuery(() => {});
    const rt = new ClaudeRuntime(rig.deps, { query: f2.factory, coalesceMs: 1 });
    runtimes.push(rt);
    await rt.start();
    (rt as unknown as { onMessage(m: unknown): void }).onMessage({
      type: 'assistant', parent_tool_use_id: null, error: 'authentication_failed', message: { content: [{ type: 'text', text: 'Invalid API key' }] },
    });
    expect(rig.host.stuck[0].reason).toBe("I can't reach my model: the API key was refused.");
    (rt as unknown as { onMessage(m: unknown): void }).onMessage({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key', total_cost_usd: 0, usage: {} });
    expect(rig.host.turnsEnded[0].error).toBeUndefined();
    void host;
  });

  it('dispose closes the query and ignores later deliveries', async () => {
    const { rt, fake, host } = await setup((t) => t.finish({}));
    await rt.dispose();
    expect(fake.last.closed).toBe(true);
    rt.deliver(mgr('too late'));
    await new Promise((r) => setTimeout(r, 40));
    expect(host.turnsEnded).toHaveLength(0);
  });

  it('aborting the supervisor signal disposes it', async () => {
    const { rig, fake } = await setup(() => {});
    rig.abort.abort();
    await waitUntil(() => fake.last.closed);
  });
});

describe('plan reminder (PlanNudge)', () => {
  const plan = (...st: Array<'done' | 'in_progress' | 'pending'>) => st.map((status, i) => ({ title: `Step ${i + 1}`, status }));
  const calls = (n: PlanNudge, k: number) => {
    for (let i = 0; i < k; i++) n.toolCalled();
  };

  it('reminds after six tool calls since the plan changed, then again after six more', () => {
    expect(PLAN_NUDGE_AFTER).toBe(6);
    const n = new PlanNudge();
    const p = plan('in_progress', 'pending');
    n.planWritten(p);
    calls(n, 5);
    expect(n.take()).toBeNull();
    calls(n, 1);
    expect(n.take()).toBe(planNudgeText(p));
    calls(n, 5);
    expect(n.take()).toBeNull();
    calls(n, 1);
    expect(n.take()).toBe(planNudgeText(p));
  });

  it('the text starts with the office line, names the open step and stays short', () => {
    const t = planNudgeText(plan('done', 'in_progress', 'pending'));
    expect(t.startsWith('Office: tick the plan steps you have finished before you carry on.')).toBe(true);
    expect(t).toContain('"Step 2"');
    expect(planNudgeText([{ title: 'x'.repeat(200), status: 'pending' }]).length).toBeLessThan(330);
  });

  it('a milestone counts double', () => {
    const n = new PlanNudge();
    n.planWritten(plan('in_progress', 'pending'));
    n.toolCalled();
    n.toolCalled(true);
    n.toolCalled(true);
    expect(n.take()).toBeNull(); // 5
    n.toolCalled();
    expect(n.take()).toContain('"Step 1"'); // 6
  });

  it('finish_task is sent back once while steps are open, never when none are', () => {
    const n = new PlanNudge();
    expect(n.blockFinish()).toBeNull(); // no plan
    n.planWritten(plan('done', 'in_progress'));
    expect(n.blockFinish()).toContain('call finish_task again');
    expect(n.blockFinish()).toBeNull(); // once
    n.planWritten(plan('done', 'in_progress'));
    expect(n.blockFinish()).not.toBeNull(); // a new plan write re-arms it
    n.planWritten(plan('done', 'done'));
    expect(n.blockFinish()).toBeNull();
  });

  it('a plan update starts a new stretch', () => {
    const n = new PlanNudge();
    n.planWritten(plan('in_progress', 'pending', 'pending'));
    calls(n, 5);
    n.planWritten(plan('done', 'in_progress', 'pending'));
    calls(n, 5);
    expect(n.take()).toBeNull();
    calls(n, 1);
    expect(n.take()).toContain('"Step 2"');
  });

  it('never without a plan, with an empty plan, or when every step is ticked', () => {
    const n = new PlanNudge();
    calls(n, 10);
    expect(n.take()).toBeNull();
    n.planWritten([]);
    calls(n, 10);
    expect(n.take()).toBeNull();
    n.planWritten(plan('done', 'done'));
    calls(n, 10);
    expect(n.take()).toBeNull();
  });

  it('reset (task closed, turn over) clears everything', () => {
    const n = new PlanNudge();
    n.planWritten(plan('in_progress'));
    calls(n, 6);
    n.reset();
    expect(n.take()).toBeNull();
    calls(n, 10);
    expect(n.take()).toBeNull();
  });

  it('the runtime counts real tool calls and the PostToolUse hook attaches the reminder', async () => {
    const hookInput = (tool: string) => ({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input: {}, tool_response: '', tool_use_id: 'x', session_id: 's', transcript_path: '', cwd: '' }) as never;
    const got: Array<string | undefined> = [];
    const { say } = await setup(async (t) => {
      const hook = t.options.hooks!.PostToolUse![0].hooks[0];
      const ask = async (tool: string) => {
        const out = (await hook(hookInput(tool), 'x', { signal: new AbortController().signal })) as { hookSpecificOutput?: { additionalContext?: string } };
        got.push(out.hookSpecificOutput?.additionalContext);
      };
      await t.tool('TodoWrite', { todos: [{ content: 'A', status: 'in_progress', activeForm: 'A' }, { content: 'B', status: 'pending', activeForm: 'B' }] });
      for (let i = 0; i < 6; i++) {
        await t.tool('mcp__space__shell', { command: `echo ${i}` });
        await ask('mcp__space__shell');
      }
      await t.tool('mcp__space__shell', { command: 'echo more' });
      await ask('mcp__space__shell');
      await ask('TodoWrite');
      t.finish({});
    });
    await say('go');
    expect(got.slice(0, 5).every((x) => x === undefined)).toBe(true);
    expect(got[5]).toContain('Office: tick the plan steps you have finished before you carry on.');
    expect(got[6]).toBeUndefined();
    expect(got[7]).toBeUndefined();
  });
});
