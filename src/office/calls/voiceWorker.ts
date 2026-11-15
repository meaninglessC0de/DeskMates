import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';
import type { Env } from '../../shared/index.ts';

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcess;

export interface WorkerSupervisor {
  start(): void;
  stop(): Promise<void>;
  /** A worker process exists right now (not waiting to restart). */
  alive(): boolean;
}

export interface WorkerOptions {
  env: Env;
  voiceDir: string;
  logFile: string;
  spawn?: SpawnFn;
  /** Restart delays in ms: doubles from `first` up to `max`; reset after `stableMs` of uptime. */
  backoff?: { first: number; max: number; stableMs: number };
  killAfterMs?: number;
}

export const hasLiveKitKeys = (env: Pick<Env, 'LIVEKIT_URL' | 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET'>): boolean =>
  !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);

/** Spawns `python agent.py start` in voice/ (through `uv run` until the venv exists), restarts it with backoff if it dies, stops it on shutdown. Output goes to the log file. */
export function createWorkerSupervisor(o: WorkerOptions): WorkerSupervisor {
  const spawnFn: SpawnFn = o.spawn ?? ((cmd, args, opts) => nodeSpawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] }));
  const b = o.backoff ?? { first: 1000, max: 30_000, stableMs: 60_000 };
  let child: ChildProcess | null = null;
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = b.first;
  let log: WriteStream | null = null;

  const write = (s: string): void => {
    log?.write(s);
  };

  function launch(): void {
    if (stopping) return;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LIVEKIT_URL: o.env.LIVEKIT_URL,
      LIVEKIT_API_KEY: o.env.LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET: o.env.LIVEKIT_API_SECRET,
      SYNTHESIA_API_KEY: o.env.SYNTHESIA_API_KEY,
      DEEPGRAM_API_KEY: o.env.DEEPGRAM_API_KEY,
      ELEVENLABS_API_KEY: o.env.ELEVENLABS_API_KEY,
      OFFICE_URL: `http://127.0.0.1:${o.env.OFFICE_PORT}`,
      PYTHONUNBUFFERED: '1',
    };
    const startedAt = Date.now();
    write(`\n[${new Date().toISOString()}] starting voice worker\n`);
    let c: ChildProcess;
    try {
      // the venv's own interpreter when it exists (so SIGTERM reaches Python directly), else `uv run`, which creates the venv
      const py = path.join(o.voiceDir, '.venv', 'bin', 'python');
      c = existsSync(py)
        ? spawnFn(py, ['agent.py', 'start'], { cwd: o.voiceDir, env })
        : spawnFn('uv', ['run', 'python', 'agent.py', 'start'], { cwd: o.voiceDir, env });
    } catch (e) {
      write(`[spawn failed] ${(e as Error).message}\n`);
      scheduleRestart(startedAt);
      return;
    }
    child = c;
    c.stdout?.on('data', (d: Buffer) => write(d.toString()));
    c.stderr?.on('data', (d: Buffer) => write(d.toString()));
    let handled = false;
    const died = (why: string): void => {
      if (handled) return;
      handled = true;
      write(`[${new Date().toISOString()}] voice worker ${why}\n`);
      if (child === c) child = null;
      scheduleRestart(startedAt);
    };
    c.on('error', (e) => died(`error: ${e.message}`));
    c.on('exit', (code, signal) => died(`exited (${signal ?? code})`));
  }

  function scheduleRestart(startedAt: number): void {
    if (stopping) return;
    if (Date.now() - startedAt >= b.stableMs) delay = b.first;
    const wait = delay;
    delay = Math.min(delay * 2, b.max);
    write(`[restart in ${wait} ms]\n`);
    timer = setTimeout(() => {
      timer = null;
      launch();
    }, wait);
  }

  return {
    start() {
      if (child || timer) return;
      stopping = false;
      mkdirSync(path.dirname(o.logFile), { recursive: true });
      log = createWriteStream(o.logFile, { flags: 'a' });
      launch();
    },
    alive: () => !!child,
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const c = child;
      child = null;
      if (c && c.exitCode === null && c.signalCode === null) {
        await new Promise<void>((resolve) => {
          const kill = setTimeout(() => c.kill('SIGKILL'), o.killAfterMs ?? 5000);
          c.once('exit', () => {
            clearTimeout(kill);
            resolve();
          });
          c.kill('SIGTERM');
        });
      }
      await new Promise<void>((resolve) => (log ? log.end(resolve) : resolve()));
      log = null;
    },
  };
}
