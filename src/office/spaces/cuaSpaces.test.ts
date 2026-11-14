import { describe, expect, it } from 'vitest';
import type { Env } from '../../shared/index.ts';
import type { BackendEntry, BackendExec, BackendHandle, CuaBackend } from './cuaBackend.ts';
import { createCuaSpaces } from './cuaSpaces.ts';
import { errorText, flattenHeaders, isStaleError, planEnsure, resolveGuestPath, spaceNameFor } from './cuaPure.ts';
import { openCuaStream } from './stream.ts';

describe('pure helpers', () => {
  it('maps employee ids to Space names', () => {
    expect(spaceNameFor('emp_01JABCDEF')).toBe('emp-01jabcdef');
    expect(spaceNameFor('emp_01JABCDEF', 'test-w1-')).toBe('test-w1-01jabcdef');
    expect(spaceNameFor('01JXYZ')).toBe('emp-01jxyz');
  });

  it('flattens MCP headers from a list or a record', () => {
    expect(flattenHeaders([{ name: 'x-cua-env-authorization', value: 'Bearer t' }, { name: 'a', value: 'b' }])).toEqual({
      'x-cua-env-authorization': 'Bearer t',
      a: 'b',
    });
    expect(flattenHeaders({ a: 'b' })).toEqual({ a: 'b' });
    expect(flattenHeaders(undefined)).toEqual({});
  });

  it('detects the stale-instance error and reads tags', () => {
    expect(isStaleError(new Error('CuaError.Runtime: local runtime: instance emp-1 not found'))).toBe(true);
    expect(isStaleError(new Error('connection refused'))).toBe(false);
    const tagged = Object.assign(new Error(''), { tag: 'InvalidArgument' });
    expect(errorText(tagged)).toBe('InvalidArgument');
    expect(isStaleError(tagged)).toBe(false);
  });

  it('plans ensure from the registry entry', () => {
    expect(planEnsure(undefined)).toBe('create');
    expect(planEnsure({ powerState: 'running' })).toBe('check');
    expect(planEnsure({ powerState: 'suspended' })).toBe('wake');
    expect(planEnsure({ powerState: 'stopped' })).toBe('wake');
  });

  it('resolves guest paths inside home', () => {
    expect(resolveGuestPath('/home/cua', '~')).toBe('/home/cua');
    expect(resolveGuestPath('/home/cua', '~/a/b.txt')).toBe('/home/cua/a/b.txt');
    expect(resolveGuestPath('/home/cua', 'a.txt')).toBe('/home/cua/a.txt');
    expect(resolveGuestPath('/home/cua', '/tmp/x')).toBe('/tmp/x');
  });
});

class FakeSdk implements CuaBackend {
  entries: BackendEntry[] = [];
  creates = 0;
  deletes: string[] = [];
  starts: string[] = [];
  networks: Array<[string, boolean]> = [];
  /** ids whose runtime is gone: every call fails like a crashed VM. */
  dead = new Set<string>();
  createDelayMs = 20;
  streamFails = false;

  async list() {
    return this.entries.map((e) => ({ ...e }));
  }
  async create(req: Parameters<CuaBackend['create']>[0]) {
    this.creates++;
    req.onProgress('creating', '');
    await new Promise((r) => setTimeout(r, this.createDelayMs));
    req.onProgress('ready', '');
    this.entries.push({ id: `local:${req.name}`, name: req.name, powerState: 'running' });
  }
  async start(id: string) {
    this.starts.push(id);
    const e = this.entries.find((x) => x.id === id);
    if (e) e.powerState = 'running';
  }
  async suspend(id: string) {
    const e = this.entries.find((x) => x.id === id);
    if (e) e.powerState = 'suspended';
  }
  async delete(id: string) {
    this.deletes.push(id);
    this.entries = this.entries.filter((x) => x.id !== id);
    this.dead.delete(id);
  }
  async setNetwork(id: string, internet: boolean) {
    this.networks.push([id, internet]);
    return { applied: 'now' };
  }
  async mcpEndpoint() {
    return { url: 'http://127.0.0.1:1/mcp', headers: {} };
  }
  async handle(id: string): Promise<BackendHandle> {
    const dead = () => this.dead.has(id);
    const fail = () => new Error(`CuaError.Runtime: local runtime: instance ${id.replace('local:', '')} not found`);
    const ok: BackendExec = { stdout: '', stderr: '', exitCode: 0, timedOut: false };
    return {
      bash: async () => {
        if (dead()) throw fail();
        return ok;
      },
      write: async () => {},
      download: async () => Buffer.from('x'),
      home: async () => '/home/cua',
      screenshotJpeg: async () => Buffer.from([0xff, 0xd8]),
      thumbnailJpeg: async () => Buffer.from([0xff, 0xd8]),
      openStream: async () => {
        if (this.streamFails) throw new Error('nope');
        return { wsUrl: 'ws://127.0.0.1:1/media?ticket=t', ticket: 't', mediaSessionId: 'm' };
      },
    };
  }
}

const env = {} as Env;
const make = (sdk: FakeSdk) => createCuaSpaces({ dataDir: '/tmp/x', env, namePrefix: 'test-w1-', backend: sdk });

describe('ensure', () => {
  it('creates a missing Space once and is idempotent', async () => {
    const sdk = new FakeSdk();
    const spaces = make(sdk);
    const a = await spaces.ensure('emp_AAA', { internet: true });
    expect(a).toEqual({ id: 'local:test-w1-aaa', state: 'running' });
    await spaces.ensure('emp_AAA', { internet: true });
    expect(sdk.creates).toBe(1);
  });

  it('shares one create between concurrent calls and tells both about progress', async () => {
    const sdk = new FakeSdk();
    const spaces = make(sdk);
    const seen1: string[] = [];
    const seen2: string[] = [];
    const [a, b] = await Promise.all([
      spaces.ensure('emp_BBB', { internet: true, onProgress: (m) => seen1.push(m) }),
      spaces.ensure('emp_BBB', { internet: true, onProgress: (m) => seen2.push(m) }),
    ]);
    expect(a).toEqual(b);
    expect(sdk.creates).toBe(1);
    expect(seen1.at(-1)).toBe('Desktop is ready');
    expect(seen2.at(-1)).toBe('Desktop is ready');
  });

  it('wakes a sleeping Space without creating', async () => {
    const sdk = new FakeSdk();
    sdk.entries.push({ id: 'local:test-w1-ccc', name: 'test-w1-ccc', powerState: 'suspended' });
    const info = await make(sdk).ensure('emp_CCC', { internet: true });
    expect(info.state).toBe('running');
    expect(sdk.starts).toEqual(['local:test-w1-ccc']);
    expect(sdk.creates).toBe(0);
  });

  it('replaces a stale entry (listed running, calls fail with instance not found)', async () => {
    const sdk = new FakeSdk();
    sdk.entries.push({ id: 'local:test-w1-ddd', name: 'test-w1-ddd', powerState: 'running' });
    sdk.dead.add('local:test-w1-ddd');
    const spaces = make(sdk);
    expect(await spaces.healthy('emp_DDD')).toBe(false);
    const info = await spaces.ensure('emp_DDD', { internet: false });
    expect(info.state).toBe('running');
    expect(sdk.deletes).toEqual(['local:test-w1-ddd']);
    expect(sdk.creates).toBe(1);
    expect(await spaces.healthy('emp_DDD')).toBe(true);
  });

  it('replaces a Space that is asleep and cannot be woken healthy', async () => {
    const sdk = new FakeSdk();
    sdk.entries.push({ id: 'local:test-w1-eee', name: 'test-w1-eee', powerState: 'suspended' });
    sdk.dead.add('local:test-w1-eee');
    sdk.start = async (id: string) => {
      sdk.starts.push(id);
      sdk.entries[0]!.powerState = 'running';
    };
    const info = await make(sdk).ensure('emp_EEE', { internet: true });
    expect(info.state).toBe('running');
    expect(sdk.deletes).toEqual(['local:test-w1-eee']);
    expect(sdk.creates).toBe(1);
  }, 20_000);
});

describe('lifecycle', () => {
  it('reports state, sleeps, wakes, resets and removes', async () => {
    const sdk = new FakeSdk();
    const spaces = make(sdk);
    expect(await spaces.state('emp_FFF')).toBe('absent');
    await spaces.remove('emp_FFF');
    await spaces.ensure('emp_FFF', { internet: true });
    expect(await spaces.state('emp_FFF')).toBe('running');
    await spaces.sleep('emp_FFF');
    expect(await spaces.state('emp_FFF')).toBe('asleep');
    await expect(spaces.exec('emp_FFF', 'true')).rejects.toThrow('This desktop is off.');
    await spaces.wake('emp_FFF');
    expect(await spaces.state('emp_FFF')).toBe('running');
    await spaces.reset('emp_FFF', { internet: true });
    expect(sdk.creates).toBe(2);
    await spaces.remove('emp_FFF');
    expect(await spaces.state('emp_FFF')).toBe('absent');
    await expect(spaces.screenshot('emp_FFF')).rejects.toThrow('This desktop does not exist.');
  });

  it('turns a stale-instance error into a plain sentence', async () => {
    const sdk = new FakeSdk();
    const spaces = make(sdk);
    await spaces.ensure('emp_GGG', { internet: true });
    sdk.dead.add('local:test-w1-ggg');
    await expect(spaces.exec('emp_GGG', 'true')).rejects.toThrow('stopped responding');
  });

  it('applies the internet switch live and rejects when it cannot', async () => {
    const sdk = new FakeSdk();
    const spaces = make(sdk);
    await spaces.ensure('emp_HHH', { internet: true });
    await spaces.setInternet('emp_HHH', false);
    expect(sdk.networks.at(-1)).toEqual(['local:test-w1-hhh', false]);
    sdk.setNetwork = async () => ({ applied: 'next_start' });
    await expect(spaces.setInternet('emp_HHH', true)).rejects.toThrow('restarts');
  });
});

describe('stream', () => {
  it('returns a cua-media ticket, or frames when opening fails', async () => {
    const sdk = new FakeSdk();
    const h = await sdk.handle('local:x');
    const ok = await openCuaStream(h, 'emp_1', 'view');
    expect(ok).toMatchObject({ kind: 'cua-media', ticket: 't', mediaSessionId: 'm' });
    // absolute epoch milliseconds, about ten minutes ahead
    const ahead = (ok as { expiresMs: number }).expiresMs - Date.now();
    expect(ahead).toBeGreaterThan(9 * 60_000);
    expect(ahead).toBeLessThanOrEqual(10 * 60_000 + 1000);
    sdk.streamFails = true;
    expect(await openCuaStream(await sdk.handle('local:x'), 'emp_1', 'control')).toEqual({ kind: 'frames', url: '/api/employees/emp_1/frame.jpg' });
  });
});
