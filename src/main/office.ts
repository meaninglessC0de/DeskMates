import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, OFFICE_PORT, REPO_ROOT } from './constants';

export const LOG_PATH = join(DATA_DIR, 'office.log');

let child: ChildProcess | null = null;

export function officeUrl(): string {
  return process.env.AGENT_MANAGER_OFFICE_URL || `http://127.0.0.1:${OFFICE_PORT}`;
}

export function officePid(): number | null {
  return child?.pid ?? null;
}

/** The system node, as an absolute path. Never Electron's own binary. */
async function resolveNode(): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh';
  const fromShell = await new Promise<string>((resolve) => {
    execFile(shell, ['-l', '-c', 'command -v node'], { timeout: 5000 }, (err, stdout) => {
      resolve(err ? '' : stdout.trim().split('\n').pop() ?? '');
    });
  });
  const candidates = [fromShell, '/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  const found = candidates.find((p) => p.startsWith('/') && existsSync(p));
  if (!found) throw new Error('Node.js was not found on this Mac.');
  return found;
}

async function healthy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Starts office unless AGENT_MANAGER_OFFICE_URL points at one, and resolves when /api/health answers. */
export async function startOffice(): Promise<void> {
  const base = officeUrl();
  if (!process.env.AGENT_MANAGER_OFFICE_URL) {
    const node = await resolveNode();
    mkdirSync(DATA_DIR, { recursive: true });
    const log = openSync(LOG_PATH, 'a');
    const env: NodeJS.ProcessEnv = { ...process.env, OFFICE_PORT };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(node, ['node_modules/tsx/dist/cli.mjs', 'src/office/main.ts'], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', log, log],
      detached: true, // own process group, so the tsx wrapper and its child die together
    });
    closeSync(log);
    child.unref();
  }
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (child && child.exitCode !== null) throw new Error('Office stopped while starting.');
    if (await healthy(base)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Office did not answer in 30 seconds.');
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    /* already gone */
  }
}

/** SIGTERM, then SIGKILL after 3 s, then wait until the process is gone. */
export async function stopOffice(): Promise<void> {
  const pid = child?.pid;
  if (!pid) return;
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && alive(pid)) await new Promise((r) => setTimeout(r, 100));
  if (alive(pid)) {
    signalGroup(pid, 'SIGKILL');
    for (let i = 0; i < 30 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  }
  child = null;
}

/** Last resort, synchronous: used from process 'exit'. */
export function killOfficeNow(): void {
  if (child?.pid) signalGroup(child.pid, 'SIGKILL');
}
