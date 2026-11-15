import { describe, expect, it } from 'vitest';
import type { Permissions } from '../../shared/index.ts';
import { PermissionGate, type Decision } from './gate.ts';
import { FakeHost, makeEmployee } from './testHost.ts';

function rig(perms: Partial<Permissions> = {}, grant = false) {
  const host = new FakeHost(makeEmployee({ permissions: perms, screenGrant: grant ? { untilMs: null } : null }));
  const gate = new PermissionGate(host);
  const set = (p: Partial<Permissions>) => (host.emp = { ...host.emp, permissions: { ...host.emp.permissions, ...p } });
  return { host, gate, set };
}
const d = (gate: PermissionGate, tool: string, input: Record<string, unknown> = {}): Decision => gate.decide(tool, input);
const kind = (x: Decision) => x.kind;

describe('gate order, row by row', () => {
  describe('1. office tools', () => {
    it.each(['asks_first', 'asks_big_steps', 'independent'] as const)('are allowed at level %s', (level) => {
      const { gate } = rig({ level });
      for (const t of ['message_user', 'ask_user', 'request_approval', 'finish_task', 'report_stuck', 'set_activity', 'message_colleague', 'list_colleagues', 'save_note', 'request_screen', 'release_screen']) {
        expect(kind(d(gate, `mcp__office__${t}`))).toBe('allow');
      }
    });
    it('are allowed even with commands and internet switched off', () => {
      const { gate } = rig({ commands: false, internet: false, level: 'asks_first' });
      expect(kind(d(gate, 'mcp__office__finish_task'))).toBe('allow');
    });
  });

  describe('2. admin and unknown tools never run', () => {
    it.each(['asks_first', 'asks_big_steps', 'independent'] as const)('denies them at level %s', (level) => {
      const { gate } = rig({ level });
      for (const t of [
        'mcp__desktop__set_config', 'mcp__desktop__install_extension', 'mcp__desktop__check_for_update', 'mcp__desktop__start_recording',
        'mcp__desktop__create_space', 'mcp__desktop__space_bash', 'mcp__desktop__share_tcp_port', 'mcp__desktop__browser_navigate',
        'mcp__desktop__set_agent_cursor_theme', 'mcp__desktop__debug_window_info', 'mcp__nope__anything', 'Bash', 'Read', 'Write', 'Edit', 'Task',
        'mcp__space__delete_everything',
      ]) {
        const x = d(gate, t);
        expect(x, t).toMatchObject({ kind: 'deny' });
      }
    });
  });

  describe('3. host tools only while a screen grant is live', () => {
    it.each(['asks_first', 'asks_big_steps', 'independent'] as const)('denies them without a grant at level %s', (level) => {
      const { gate } = rig({ level });
      expect(d(gate, 'mcp__host__click')).toEqual({
        kind: 'deny',
        message: "You do not have your manager's screen. Use request_screen if you are allowed to.",
      });
    });
    it('allows the allow-listed ones with a grant, and still denies admin ones', () => {
      const { gate } = rig({ level: 'asks_first' }, true);
      expect(kind(d(gate, 'mcp__host__click'))).toBe('allow');
      expect(kind(d(gate, 'mcp__host__get_window_state'))).toBe('allow');
      expect(kind(d(gate, 'mcp__host__set_config'))).toBe('deny');
      expect(kind(d(gate, 'mcp__host__read_window'))).toBe('allow'); // the mock Mac's one tool
    });
    it('closes again when the grant ends', () => {
      const { gate, host } = rig({}, true);
      expect(kind(d(gate, 'mcp__host__click'))).toBe('allow');
      host.emp = { ...host.emp, screenGrant: null };
      expect(kind(d(gate, 'mcp__host__click'))).toBe('deny');
    });
  });

  describe('4. commands switch', () => {
    it.each(['asks_first', 'asks_big_steps', 'independent'] as const)('denies shell at level %s when off, with the sentence', (level) => {
      const { gate } = rig({ level, commands: false });
      expect(d(gate, 'mcp__space__shell', { command: 'ls' })).toEqual({ kind: 'deny', message: 'Running commands is switched off for you.' });
    });
    it('does not stop file tools', () => {
      const { gate } = rig({ level: 'independent', commands: false });
      expect(kind(d(gate, 'mcp__space__read_file', { path: '~/x' }))).toBe('allow');
      expect(kind(d(gate, 'mcp__space__write_file', { path: '~/x', content: '' }))).toBe('allow');
    });
  });

  describe('5. internet switch', () => {
    it.each(['asks_first', 'asks_big_steps', 'independent'] as const)('denies web tools at level %s when off', (level) => {
      const { gate } = rig({ level, internet: false });
      for (const t of ['WebSearch', 'WebFetch']) {
        expect(d(gate, t, { query: 'x', url: 'https://x.com' })).toEqual({ kind: 'deny', message: 'Internet access is switched off for you.' });
      }
    });
    it('also stops browser_navigate (should it ever reach the gate it is not allow-listed and is denied anyway)', () => {
      const { gate } = rig({ level: 'independent', internet: false });
      expect(kind(d(gate, 'mcp__desktop__browser_navigate', { url: 'https://x.com' }))).toBe('deny');
    });
    it('does not stop shell or desktop tools', () => {
      const { gate } = rig({ level: 'independent', internet: false });
      expect(kind(d(gate, 'mcp__space__shell', { command: 'ls' }))).toBe('allow');
      expect(kind(d(gate, 'mcp__desktop__click'))).toBe('allow');
    });
  });

  describe('6. works independently', () => {
    it('allows everything that survived the earlier rows, even risky ones', () => {
      const { gate } = rig({ level: 'independent' });
      expect(kind(d(gate, 'mcp__desktop__kill_app'))).toBe('allow');
      expect(kind(d(gate, 'mcp__desktop__run_script'))).toBe('allow');
      expect(kind(d(gate, 'mcp__space__shell', { command: 'rm -rf build && git push' }))).toBe('allow');
      expect(kind(d(gate, 'mcp__desktop__click'))).toBe('allow');
      expect(kind(d(gate, 'WebSearch', { query: 'x' }))).toBe('allow');
      expect(kind(d(gate, 'TodoWrite', { todos: [] }))).toBe('allow');
    });
  });

  describe('7. asks before big steps', () => {
    it('allows ordinary work', () => {
      const { gate } = rig({ level: 'asks_big_steps' });
      for (const [t, i] of [
        ['mcp__desktop__click', {}], ['mcp__desktop__type_text', { text: 'x' }], ['mcp__desktop__get_window_state', {}],
        ['mcp__space__shell', { command: 'npm test' }], ['mcp__space__write_file', { path: '~/work/a', content: '' }],
        ['mcp__space__read_file', { path: '~/work/a' }], ['WebSearch', { query: 'x' }], ['WebFetch', { url: 'https://x.com' }], ['TodoWrite', { todos: [] }],
      ] as const) {
        expect(kind(d(gate, t, i as Record<string, unknown>)), t).toBe('allow');
      }
    });
    it('asks for RISKY desktop tools, with the spec text', () => {
      const { gate } = rig({ level: 'asks_big_steps' });
      expect(d(gate, 'mcp__desktop__kill_app')).toEqual({ kind: 'ask', family: null, title: 'Quit an app', detail: "Force-quits an app on Maya's desktop" });
      expect(d(gate, 'mcp__desktop__run_script')).toMatchObject({ kind: 'ask', family: null });
    });
    it('asks for a risky shell command and shows it, cut to 120 characters', () => {
      const { gate } = rig({ level: 'asks_big_steps' });
      const long = `git push origin main ${'x'.repeat(200)}`;
      const x = d(gate, 'mcp__space__shell', { command: long });
      expect(x).toMatchObject({ kind: 'ask', family: null, title: 'Publish with git push' });
      expect((x as { detail: string }).detail.length).toBe(120);
      expect((x as { detail: string }).detail.startsWith('git push origin main')).toBe(true);
    });
    it('names the big step in a long chain and shows that part, not the first command', () => {
      const { gate } = rig({ level: 'asks_big_steps' });
      const chain = "cd ~/work/site && sed -i 's/a/b/' index.html && git add -A && git commit -m site && git push ~/remote.git main";
      expect(d(gate, 'mcp__space__shell', { command: chain })).toEqual({ kind: 'ask', family: null, title: 'Publish with git push', detail: 'git push ~/remote.git main' });
      expect(d(gate, 'mcp__space__shell', { command: 'cd /tmp; rm -rf build' })).toMatchObject({ title: 'Delete files', detail: 'rm -rf build' });
    });
  });

  describe('8. asks first', () => {
    it('allows OBSERVE tools, TodoWrite, read_file, WebSearch and WebFetch', () => {
      const { gate } = rig({ level: 'asks_first' });
      for (const t of ['list_apps', 'list_windows', 'get_window_state', 'get_desktop_state', 'get_screen_size', 'get_cursor_position', 'zoom', 'verify_state', 'get_guide']) {
        expect(kind(d(gate, `mcp__desktop__${t}`)), t).toBe('allow');
      }
      expect(kind(d(gate, 'TodoWrite', { todos: [] }))).toBe('allow');
      expect(kind(d(gate, 'mcp__space__read_file', { path: '~/x' }))).toBe('allow');
      expect(kind(d(gate, 'WebSearch', { query: 'x' }))).toBe('allow');
      expect(kind(d(gate, 'WebFetch', { url: 'https://x.com' }))).toBe('allow');
    });
    it('asks for every ACT tool, as one desktop family', () => {
      const { gate } = rig({ level: 'asks_first' });
      for (const t of ['launch_app', 'click', 'type_text', 'hotkey', 'run_steps', 'scroll', 'clipboard_write', 'set_value']) {
        expect(d(gate, `mcp__desktop__${t}`), t).toEqual({
          kind: 'ask', family: 'desktop', title: 'Use the desktop', detail: "Click, type and browse on Maya's desktop for this task",
        });
      }
    });
    it('asks for shell (family shell) and write_file (family files)', () => {
      const { gate } = rig({ level: 'asks_first' });
      expect(d(gate, 'mcp__space__shell', { command: 'ls ~/work' })).toEqual({ kind: 'ask', family: 'shell', title: 'Run a command', detail: 'ls ~/work' });
      expect(d(gate, 'mcp__space__write_file', { path: '~/work/hello.txt', content: 'x' })).toEqual({
        kind: 'ask', family: 'files', title: 'Save a file', detail: '~/work/hello.txt',
      });
    });
    it('puts a risky shell command in no family', () => {
      const { gate } = rig({ level: 'asks_first' });
      expect(d(gate, 'mcp__space__shell', { command: 'sudo reboot' })).toMatchObject({ kind: 'ask', family: null });
    });
  });

  it('reads the permission row live: a change is in force on the very next call', () => {
    const { gate, set } = rig({ level: 'asks_first' });
    expect(kind(d(gate, 'mcp__desktop__click'))).toBe('ask');
    set({ level: 'independent' });
    expect(kind(d(gate, 'mcp__desktop__click'))).toBe('allow');
    set({ commands: false });
    expect(kind(d(gate, 'mcp__space__shell', { command: 'ls' }))).toBe('deny');
    set({ commands: true, level: 'asks_big_steps' });
    expect(kind(d(gate, 'mcp__space__shell', { command: 'ls' }))).toBe('allow');
  });
});

describe('approval round trip (canUseTool)', () => {
  it('allow: waits for the answer, then lets the call run', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    const p = gate.canUseTool('mcp__space__shell', { command: 'ls' });
    await host.answer(0, { approved: true });
    expect(await p).toMatchObject({ behavior: 'allow' });
    expect(host.approvals[0]).toMatchObject({ title: 'Run a command', detail: 'ls', kind: 'tool' });
  });

  it('deny: says no in words the model can act on, with the manager note', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    const p = gate.canUseTool('mcp__space__write_file', { path: '~/a', content: '' });
    await host.answer(0, { approved: false, note: 'use the other folder' });
    const r = await p;
    expect(r.behavior).toBe('deny');
    expect((r as { message: string }).message).toContain('use the other folder');
    expect((r as { message: string }).message).toMatch(/do not retry/i);
  });

  it('deny without a note still gives a readable message', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    const p = gate.canUseTool('mcp__desktop__click', {});
    await host.answer(0, { approved: false });
    expect(((await p) as { message: string }).message).toMatch(/said no\./);
  });

  it('scope task: remembered per family, never for risky, cleared when the task closes', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    let p = gate.canUseTool('mcp__desktop__click', {});
    await host.answer(0, { approved: true, scope: 'task' });
    await p;
    expect(gate.rememberedFamilies()).toEqual(['desktop']);
    // every ACT tool is the one desktop family: no second question
    expect((await gate.canUseTool('mcp__desktop__type_text', { text: 'x' })).behavior).toBe('allow');
    expect((await gate.canUseTool('mcp__desktop__launch_app', { name: 'firefox' })).behavior).toBe('allow');
    expect(host.approvals).toHaveLength(1);
    // another family still asks
    p = gate.canUseTool('mcp__space__shell', { command: 'ls' });
    await host.answer(1, { approved: true, scope: 'once' });
    await p;
    p = gate.canUseTool('mcp__space__shell', { command: 'ls' });
    await host.answer(2, { approved: true, scope: 'task' });
    await p;
    expect(gate.rememberedFamilies().sort()).toEqual(['desktop', 'shell']);
    expect(host.approvals).toHaveLength(3);
    // risky shell is never covered by the shell family
    p = gate.canUseTool('mcp__space__shell', { command: 'git push' });
    await host.answer(3, { approved: true, scope: 'task' });
    await p;
    p = gate.canUseTool('mcp__space__shell', { command: 'git push' });
    await host.answer(4, { approved: true, scope: 'once' });
    await p;
    expect(host.approvals).toHaveLength(5);
    // the task closes
    gate.clearTaskMemory();
    expect(gate.rememberedFamilies()).toEqual([]);
    p = gate.canUseTool('mcp__desktop__click', {});
    await host.answer(5, { approved: true });
    await p;
    expect(host.approvals).toHaveLength(6);
  });

  it('scope once is not remembered', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    const p = gate.canUseTool('mcp__desktop__click', {});
    await host.answer(0, { approved: true, scope: 'once' });
    await p;
    expect(gate.rememberedFamilies()).toEqual([]);
  });

  it('a denied "for this task" answer is not remembered either', async () => {
    const { gate, host } = rig({ level: 'asks_first' });
    const p = gate.canUseTool('mcp__desktop__click', {});
    await host.answer(0, { approved: false, scope: 'task' });
    await p;
    expect(gate.rememberedFamilies()).toEqual([]);
  });

  it('asks every time for risky tools at the big-steps level', async () => {
    const { gate, host } = rig({ level: 'asks_big_steps' });
    for (let i = 0; i < 2; i++) {
      const p = gate.canUseTool('mcp__desktop__kill_app', { pid: 1 });
      await host.answer(i, { approved: true, scope: 'task' });
      expect((await p).behavior).toBe('allow');
    }
    expect(host.approvals).toHaveLength(2);
  });
});
