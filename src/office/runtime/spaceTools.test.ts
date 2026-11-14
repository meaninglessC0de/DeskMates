import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { OUTPUT_CAP, cap, spaceToolSpecs } from './spaceTools.ts';
import { makeRig, type RuntimeRig } from './testHost.ts';

let rig: RuntimeRig | null = null;
afterEach(() => {
  if (rig) rmSync(rig.dataDir, { recursive: true, force: true });
  rig = null;
});

async function tools() {
  rig = await makeRig();
  const specs = spaceToolSpecs(rig.spaces, rig.host.emp.id);
  const by = Object.fromEntries(specs.map((s) => [s.name, s]));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await by[name].handler(args);
    return { text: r.content.map((c) => ('text' in c ? c.text : '')).join(''), isError: !!r.isError };
  };
  return { call, specs };
}

describe('space tools', () => {
  it('offers shell, read_file and write_file', async () => {
    const { specs } = await tools();
    expect(specs.map((s) => s.name)).toEqual(['shell', 'read_file', 'write_file']);
  });

  it('shell returns the output, as an MCP text result', async () => {
    const { call } = await tools();
    expect(await call('shell', { command: 'echo hello' })).toEqual({ text: 'hello', isError: false });
  });

  it('shell shows stderr and a non-zero exit in the text without calling it a tool error', async () => {
    const { call } = await tools();
    const r = await call('shell', { command: 'echo out; echo oops 1>&2; exit 3' });
    expect(r.text).toBe('out\n[stderr]\noops\n[exit 3]');
    expect(r.isError).toBe(false);
  });

  it('shell says so when there is no output', async () => {
    const { call } = await tools();
    expect((await call('shell', { command: 'true' })).text).toBe('(no output)');
  });

  it('shell times out and flags it', async () => {
    const { call } = await tools();
    const r = await call('shell', { command: 'sleep 5', timeout_ms: 1000 });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('[timed out after 1 s]');
  });

  it('caps output at 20,000 characters with a truncated marker', async () => {
    const { call } = await tools();
    const r = await call('shell', { command: 'head -c 50000 /dev/zero | tr "\\0" x' });
    expect(r.text.startsWith('x'.repeat(100))).toBe(true);
    expect(r.text.length).toBeLessThan(OUTPUT_CAP + 100);
    expect(r.text).toContain('[truncated');
    expect(cap('short')).toBe('short');
    expect(cap('y'.repeat(OUTPUT_CAP + 1))).toContain('[truncated: 1 more characters]');
  });

  it('writes and reads files under ~/work, and says plainly when something fails', async () => {
    const { call } = await tools();
    expect((await call('write_file', { path: '~/work/hi.txt', content: 'hello there' })).text).toBe('Saved ~/work/hi.txt');
    expect(await call('read_file', { path: '~/work/hi.txt' })).toEqual({ text: 'hello there', isError: false });
    expect((await call('shell', { command: 'cat hi.txt' })).text).toBe('hello there');
    const missing = await call('read_file', { path: '~/work/none.txt' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Could not read the file');
    const outside = await call('write_file', { path: '../../escape.txt', content: 'x' });
    expect(outside.isError).toBe(true);
  });

  it('truncates a huge file read', async () => {
    const { call } = await tools();
    await call('write_file', { path: '~/work/big.txt', content: 'z'.repeat(30_000) });
    const r = await call('read_file', { path: '~/work/big.txt' });
    expect(r.text).toContain('[truncated');
  });

  it('reports a stopped desktop as a tool error with a sentence', async () => {
    const { call } = await tools();
    await rig!.spaces.sleep(rig!.host.emp.id);
    const r = await call('shell', { command: 'ls' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('This desktop is off.');
  });
});
