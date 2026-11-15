// Shared pieces of the demo scripts (run.ts and live.ts): office API calls, hiring, seeding Maya's shop, frames.
// Environment: DEMO_OFFICE_URL (default http://127.0.0.1:4317), DEMO_MIN_FREE_GB (default 4, 0 turns the memory check off).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Candidate, Employee, ThreadResponse } from '../../src/shared/index.ts';
import { readEnv } from '../../src/shared/index.ts';
import { createCuaSpaces } from '../../src/office/spaces/cuaSpaces.ts';
import type { Spaces } from '../../src/office/spaces/types.ts';
import { hostMemory } from '../e2e/lib/harness.ts';

process.env.CUA_TELEMETRY ??= '0';
process.env.DO_NOT_TRACK ??= '1';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SEED_DIR = path.join(import.meta.dirname, 'seed');
export const OFFICE = (process.env.DEMO_OFFICE_URL ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
export const MIN_FREE_GB = Number(process.env.DEMO_MIN_FREE_GB ?? 4);
export const MANAGER = 'Sam';

// ---------- the cast, in desk order ----------

export type PersonKey = 'maya' | 'priya' | 'jonas' | 'ines';
export interface Person {
  key: PersonKey;
  first: string;
  roleKey: string;
}
export const CAST: Person[] = [
  { key: 'maya', first: 'Maya', roleKey: 'web_developer' },
  { key: 'priya', first: 'Priya', roleKey: 'marketer' },
  { key: 'jonas', first: 'Jonas', roleKey: 'researcher' },
  { key: 'ines', first: 'Ines', roleKey: 'designer' },
];

// ---------- small helpers ----------

export function fail(msg: string): never {
  console.error(`demo: ${msg}`);
  process.exit(1);
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const stamp = () => new Date().toLocaleTimeString('en-GB');
export const log = (s: string) => console.log(`[${stamp()}] ${s}`);
export const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

export async function api<T>(method: string, p: string, body?: unknown, tries = 3): Promise<T> {
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(OFFICE + p, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (res.status >= 500 && i < tries - 1) {
        last = `${res.status} ${text.slice(0, 200)}`;
        await sleep(1500);
        continue;
      }
      if (res.status >= 400) throw new Error(`${method} ${p}: ${res.status} ${text.slice(0, 300)}`);
      return (text ? JSON.parse(text) : null) as T;
    } catch (e) {
      if ((e as Error).message.startsWith(`${method} ${p}:`)) throw e;
      last = (e as Error).message;
      await sleep(1500);
    }
  }
  throw new Error(`${method} ${p}: ${last}`);
}

export const thread = (id: string) => api<ThreadResponse>('GET', `/api/employees/${id}/thread?limit=200`);
export const employee = (id: string) => api<Employee>('GET', `/api/employees/${id}`);

// ---------- Space access (the script talks to the same local desktops the office created) ----------

let spaces: Spaces | null = null;
export function initSpaces(): Spaces {
  spaces ??= createCuaSpaces({ dataDir: path.join(tmpdir(), 'deskmates-demo'), env: readEnv({ ...process.env, DESKTOPS: 'cua' }) });
  return spaces;
}

export async function sh(id: string, cmd: string, timeoutMs = 60_000): Promise<{ out: string; code: number }> {
  const r = await initSpaces().exec(id, cmd, { timeoutMs });
  return { out: (r.stdout + (r.stderr ? `\n${r.stderr}` : '')).trim(), code: r.exitCode };
}

// ---------- hire ----------

export async function waitHello(id: string, first: string, timeoutMs = 240_000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const e = await employee(id);
    const t = await thread(id);
    const hello = t.messages.some((m) => m.from === 'employee' && m.kind === 'text');
    if ((e.state === 'idle' || e.state === 'working') && hello) return;
    if (e.state === 'stuck' || e.state === 'offline') throw new Error(`${first}'s desktop is ${e.state} (${e.stateDetail}).`);
    if (Date.now() - t0 > timeoutMs) throw new Error(`${first} did not come up with a hello within ${Math.round(timeoutMs / 1000)} s (state ${e.state}: ${e.stateDetail}).`);
    await sleep(2000);
  }
}

export async function hireOne(p: Person): Promise<Employee> {
  if (MIN_FREE_GB > 0) {
    const m = hostMemory();
    if (m.availGb >= 0 && m.availGb < MIN_FREE_GB) {
      fail(`Only ${m.availGb} GB of memory is free (free plus inactive), under ${MIN_FREE_GB} GB. Not hiring ${p.first}. Set DEMO_MIN_FREE_GB=0 to skip this check.`);
    }
  }
  const c = await api<Candidate>('POST', '/api/candidates', { roleKey: p.roleKey });
  if (c.persona.firstName !== p.first) {
    fail(`The office offered ${c.persona.name} for role ${p.roleKey}, not ${p.first}. Is ${p.first} already hired, or is config/cast.json different?`);
  }
  log(`Hiring ${c.persona.name} (${c.persona.role})...`);
  const e = await api<Employee>('POST', '/api/employees', { token: c.token });
  await waitHello(e.id, p.first);
  log(`${p.first} is in and has said hello`);
  return e;
}

// ---------- seed Maya ----------

function buildSeedTar(): Buffer {
  return execFileSync('tar', ['-czf', '-', '--exclude=__pycache__', '--exclude=*.pyc', '--exclude=.DS_Store', '-C', path.join(SEED_DIR), 'shop'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
}

export async function seedMaya(id: string): Promise<void> {
  log('Seeding Maya\'s desktop with the shop...');
  await initSpaces().writeFile(id, '/tmp/shop-seed.tgz', buildSeedTar());
  const script = [
    'set -e',
    'mkdir -p ~/work/remotes',
    'rm -rf ~/work/shop ~/work/remotes/shop.git',
    'tar -xzf /tmp/shop-seed.tgz -C ~/work',
    'git config --global user.name "Maya Chen"',
    'git config --global user.email "maya@deskmates.example"',
    'git config --global init.defaultBranch main',
    'git init -q --bare -b main ~/work/remotes/shop.git',
    'cd ~/work/shop',
    'git init -q -b main',
    'git add -A',
    'git commit -q -m "Initial commit: shop"',
    'git remote add origin "$HOME/work/remotes/shop.git"',
    'git push -q -u origin main',
    'rm -f /tmp/shop-seed.tgz',
  ].join('\n');
  const r = await sh(id, script, 90_000);
  if (r.code !== 0) throw new Error(`Seeding failed (exit ${r.code}): ${r.out.slice(-400)}`);
  // verify inside the Space
  const tests = await sh(id, 'cd ~/work/shop && python3 -m unittest 2>&1 | tail -4', 90_000);
  const ran = tests.out.match(/Ran (\d+) tests?/);
  const failed = tests.out.match(/failures=(\d+)/);
  const n = ran ? Number(ran[1]) : 0;
  const f = failed ? Number(failed[1]) : 0;
  if (n < 40 || n > 50) throw new Error(`Seed check: expected 40 to 50 tests, saw: ${tests.out}`);
  if (f < 3) throw new Error(`Seed check: expected several failing tests, saw: ${tests.out}`);
  const git = await sh(id, 'cd ~/work/shop && echo "status:[$(git status --porcelain)]" && git branch --show-current && git log --oneline | wc -l && git remote get-url origin && test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)" && echo remote-in-sync');
  if (!/status:\[\]/.test(git.out) || !/remote-in-sync/.test(git.out) || !/^main$/m.test(git.out)) {
    throw new Error(`Seed check: the repository is not as expected:\n${git.out}`);
  }
  log(`Seed verified in Maya's Space: ${n} tests, ${f} failing, git clean on main, origin in sync`);
}

// ---------- frames ----------

/** Saves the desktop's current frame as <ROOT>/<relFile>; returns the relative path, or null if it could not be fetched. */
export async function saveFrameTo(id: string, relFile: string): Promise<string | null> {
  try {
    const res = await fetch(`${OFFICE}/api/employees/${id}/frame.jpg`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200 || buf[0] !== 0xff) return null;
    const file = path.join(ROOT, relFile);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, buf);
    return path.relative(ROOT, file);
  } catch {
    return null;
  }
}

// ---------- artifacts ----------

/** Files a person made since the marker /tmp/.demo-start was touched in their Space (html, md, txt, svg, png). */
export async function findArtifacts(id: string): Promise<string[]> {
  try {
    const r = await sh(
      id,
      "find ~ -type f -newer /tmp/.demo-start \\( -name '*.html' -o -name '*.htm' -o -name '*.md' -o -name '*.txt' -o -name '*.svg' -o -name '*.png' \\) -not -path '*/.*' -not -path '*/node_modules/*' -not -path '*/work/shop/*' -not -path '*/work/remotes/*' 2>/dev/null | head -8",
    );
    return r.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')).map((l) => l.replace(/^\/home\/cua/, '~'));
  } catch {
    return [];
  }
}
