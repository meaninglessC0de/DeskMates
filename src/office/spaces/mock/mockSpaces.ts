import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StreamResponse } from '../../../shared/index.ts';
import { scaled } from '../../speed.ts';
import type { EnsureOptions, ExecResult, McpEndpoint, SpaceInfo, SpaceState, Spaces } from '../types.ts';

const IMAGE_COUNT = 5;
const CONFIG_DIR = path.resolve(import.meta.dirname, '../../../../config/mock-desktops');

const images = new Map<string, Buffer>();
async function image(file: string): Promise<Buffer> {
  let buf = images.get(file);
  if (!buf) {
    buf = await readFile(path.join(CONFIG_DIR, file));
    images.set(file, buf);
  }
  return buf;
}

function spaceName(employeeId: string): string {
  return `emp-${employeeId.replace(/^emp_/, '').toLowerCase()}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface MockSpacesOptions {
  /** Absolute DATA_DIR. Desktops live under <dataDir>/mock-spaces/<employee id>/ */
  dataDir: string;
}

/**
 * A desktop that is a folder: shell and files act inside it. State survives an office restart
 * (the folder's existence and an `.asleep` marker), as a real Space would.
 */
export function createMockSpaces(opts: MockSpacesOptions): Spaces {
  const root = path.join(opts.dataDir, 'mock-spaces');
  const dirOf = (id: string) => path.join(root, id);
  const markerOf = (id: string) => path.join(dirOf(id), '.asleep');
  const frameCounter = new Map<string, number>();
  const internet = new Map<string, boolean>();

  const info = (id: string, state: SpaceState): SpaceInfo => ({ id: `mock:${spaceName(id)}`, state });

  async function state(id: string): Promise<SpaceState> {
    if (!existsSync(dirOf(id))) return 'absent';
    return existsSync(markerOf(id)) ? 'asleep' : 'running';
  }

  async function requireRunning(id: string): Promise<void> {
    const s = await state(id);
    if (s === 'absent') throw new Error('This desktop does not exist.');
    if (s === 'asleep') throw new Error('This desktop is off.');
  }

  function resolveInside(id: string, p: string): string {
    const base = dirOf(id);
    let rel = p.trim();
    if (rel === '~') rel = '.';
    else if (rel.startsWith('~/')) rel = rel.slice(2);
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('That path is outside the desktop.');
    return abs;
  }

  async function create(id: string, o: EnsureOptions): Promise<SpaceInfo> {
    o.onProgress?.('Creating desktop');
    await new Promise((r) => setTimeout(r, scaled(1500)));
    await mkdir(path.join(dirOf(id), 'work'), { recursive: true });
    internet.set(id, o.internet);
    o.onProgress?.('Desktop is ready');
    return info(id, 'running');
  }

  return {
    async ensure(id, o) {
      const s = await state(id);
      if (s === 'running') {
        internet.set(id, o.internet);
        return info(id, 'running');
      }
      if (s === 'asleep') return this.wake(id);
      return create(id, o);
    },

    async wake(id) {
      const s = await state(id);
      if (s === 'absent') throw new Error('This desktop does not exist.');
      await rm(markerOf(id), { force: true });
      return info(id, 'running');
    },

    async sleep(id) {
      if ((await state(id)) === 'absent') return;
      await writeFile(markerOf(id), '');
    },

    async reset(id, o) {
      await rm(dirOf(id), { recursive: true, force: true });
      return create(id, o);
    },

    async remove(id) {
      await rm(dirOf(id), { recursive: true, force: true });
      frameCounter.delete(id);
      internet.delete(id);
    },

    async healthy(id) {
      return (await state(id)) === 'running';
    },

    async exec(id, command, o) {
      await requireRunning(id);
      const cwd = path.join(dirOf(id), 'work');
      await mkdir(cwd, { recursive: true });
      const timeoutMs = o?.timeoutMs ?? 30_000;
      return new Promise<ExecResult>((resolve) => {
        const child = spawn('/bin/sh', ['-c', command], {
          cwd,
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dirOf(id), LANG: 'en_US.UTF-8' },
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
        child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
        child.on('error', (e) => {
          clearTimeout(timer);
          resolve({ stdout, stderr: String(e.message), exitCode: 127, timedOut });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
        });
      });
    },

    async readFile(id, p) {
      await requireRunning(id);
      const abs = resolveInside(id, p);
      if (!(await stat(abs).catch(() => null))) throw new Error('That file does not exist.');
      return readFile(abs, 'utf8');
    },

    async writeFile(id, p, content) {
      await requireRunning(id);
      const abs = resolveInside(id, p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    },

    async screenshot(id) {
      await requireRunning(id);
      const n = (frameCounter.get(id) ?? hash(id) % IMAGE_COUNT) + 1;
      frameCounter.set(id, n);
      return image(`desktop-${(n % IMAGE_COUNT) + 1}.jpg`);
    },

    async thumbnail(id) {
      await requireRunning(id);
      const n = frameCounter.get(id) ?? hash(id) % IMAGE_COUNT;
      return image(`thumb-${(n % IMAGE_COUNT) + 1}.jpg`);
    },

    async mcpEndpoint(id): Promise<McpEndpoint> {
      await requireRunning(id);
      return { url: 'http://127.0.0.1:9/mock-desktop-mcp', headers: {} };
    },

    async openStream(id, _mode): Promise<StreamResponse> {
      await requireRunning(id);
      return { kind: 'frames', url: `/api/employees/${id}/frame.jpg` };
    },

    async setInternet(id, on) {
      await requireRunning(id);
      internet.set(id, on);
    },

    state,
  };
}
