import { describe, expect, it } from 'vitest';
import { clipSentence, hostnameOf, mapToolCall } from './activityMapper.ts';

const step = (n: string, i: Record<string, unknown> = {}) => mapToolCall(n, i).step;

describe('activity mapper (employee-runtime.md 4.4)', () => {
  it('office.set_activity: the office tool records its own step', () => {
    expect(mapToolCall('mcp__office__set_activity', { sentence: 'Fixing the cart total' })).toMatchObject({ step: null, recordedByOffice: true });
  });

  it('desktop.launch_app: "Opened {app name}" or the host when an address is opened', () => {
    expect(step('mcp__desktop__launch_app', { name: 'firefox' })).toBe('Opened Firefox');
    expect(step('mcp__desktop__launch_app', { launch_path: '/usr/bin/xfce4-terminal' })).toBe('Opened Xfce4 terminal');
    expect(step('mcp__desktop__launch_app', { bundle_id: 'org.mozilla.firefox' })).toBe('Opened Firefox');
    expect(step('mcp__desktop__launch_app', { name: 'firefox', urls: ['https://www.example.com/path?q=1'] })).toBe('Opened example.com');
    expect(step('mcp__desktop__launch_app', {})).toBe('Opened an app');
    expect(mapToolCall('mcp__desktop__launch_app', { name: 'firefox' }).failed).toBe("Couldn't open Firefox");
  });

  it('desktop.browser_navigate: "Opened {hostname without www}"', () => {
    expect(step('mcp__desktop__browser_navigate', { url: 'https://www.example.org/a' })).toBe('Opened example.org');
    expect(step('mcp__desktop__browser_navigate', { url: 'example.org' })).toBe('Opened example.org');
  });

  it('space.shell, space.write_file', () => {
    expect(step('mcp__space__shell', { command: 'rm -rf /secret && git push' })).toBe('Ran a command');
    expect(step('mcp__space__write_file', { path: '~/work/site/index.html', content: 'x' })).toBe('Saved index.html');
    expect(mapToolCall('mcp__space__write_file', { path: '/a/b/notes.txt' }).failed).toBe("Couldn't save notes.txt");
    expect(mapToolCall('mcp__space__shell', { command: 'x' }).failed).toBe("Couldn't run a command");
    expect(step('mcp__space__read_file', { path: '~/x' })).toBeNull();
  });

  it('WebSearch and WebFetch', () => {
    expect(step('WebSearch', { query: 'secret plans' })).toBe('Searched the web');
    expect(step('WebFetch', { url: 'https://docs.python.org/3/' })).toBe('Read docs.python.org');
    expect(mapToolCall('WebFetch', { url: 'https://docs.python.org/3/' }).failed).toBe("Couldn't read docs.python.org");
    expect(mapToolCall('WebSearch', { query: 'x' }).family).toBe('web');
  });

  it('office.message_colleague: "Messaged {first name}" with a peer (the supervisor records it)', () => {
    const m = mapToolCall('mcp__office__message_colleague', { to: 'Ines', text: 'Where is the logo?' });
    expect(m.step).toBe('Messaged Ines');
    expect(m.peer).toMatchObject({ direction: 'to', text: 'Where is the logo?' });
    expect(m.recordedByOffice).toBe(true);
  });

  it('gives no step for everything in OBSERVE and for individual clicks, keys and scrolls', () => {
    for (const t of ['list_apps', 'list_windows', 'get_window_state', 'get_desktop_state', 'get_screen_size', 'get_cursor_position', 'zoom', 'verify_state', 'get_guide', 'click', 'double_click', 'right_click', 'drag', 'scroll', 'type_text', 'press_key', 'hotkey', 'set_value', 'run_steps', 'move_cursor']) {
      const m = mapToolCall(`mcp__desktop__${t}`, { text: 'x' });
      expect(m.step, t).toBeNull();
      expect(m.family, t).toBe('desktop');
    }
  });

  it('classifies the tool family for opening a task', () => {
    expect(mapToolCall('mcp__space__shell').family).toBe('space');
    expect(mapToolCall('mcp__space__read_file').family).toBe('space');
    expect(mapToolCall('mcp__office__message_user').family).toBeNull();
    expect(mapToolCall('mcp__host__click').family).toBe('desktop');
  });

  it('maps TodoWrite to the plan (completed becomes done)', () => {
    const m = mapToolCall('TodoWrite', {
      todos: [
        { content: 'Read the brief', status: 'completed', activeForm: 'Reading' },
        { content: 'Write the page', status: 'in_progress', activeForm: 'Writing' },
        { content: 'Check it', status: 'pending', activeForm: 'Checking' },
      ],
    });
    expect(m.plan).toEqual([
      { title: 'Read the brief', status: 'done' },
      { title: 'Write the page', status: 'in_progress' },
      { title: 'Check it', status: 'pending' },
    ]);
    expect(m.step).toBeNull();
    expect(m.family).toBeNull();
  });

  it('keeps every sentence to 40 characters with no path, id or tool name', () => {
    const long = step('mcp__desktop__launch_app', { name: 'a-very-long-application-name-that-goes-on-and-on' })!;
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
    const f = step('mcp__space__write_file', { path: `~/work/${'x'.repeat(80)}.txt` })!;
    expect(f.length).toBeLessThanOrEqual(40);
    for (const s of [step('mcp__space__write_file', { path: '/etc/passwd' }), step('mcp__desktop__launch_app', { launch_path: '/usr/bin/firefox' })]) {
      expect(s).not.toMatch(/\/|mcp__|~/);
    }
  });

  it('unknown tools make no step', () => {
    expect(mapToolCall('mcp__nope__x')).toEqual({ family: null, step: null, failed: null });
    expect(mapToolCall('Bash').step).toBeNull();
  });

  it('helpers', () => {
    expect(hostnameOf('https://www.a.com/x')).toBe('a.com');
    expect(hostnameOf('')).toBe('');
    expect(clipSentence('  hello   world ')).toBe('hello world');
  });
});
