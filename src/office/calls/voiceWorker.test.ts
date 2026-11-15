import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEnv } from '../../shared/index.ts';
import { createWorkerSupervisor, hasLiveKitKeys, type SpawnFn } from './voiceWorker.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed: string[] = [];
  kill(sig: string): boolean {
    this.killed.push(sig);
    this.signalCode = sig;
    queueMicrotask(() => this.emit('exit', null, sig));
    return true;
  }
  die(code: number): void {
    this.exitCode = code;
    this.emit('exit', code, null);
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'vw-'));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const children: FakeChild[] = [];
  const calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const spawn: SpawnFn = (cmd, args, opts) => {
    const c = new FakeChild();
    children.push(c);
    calls.push({ cmd, args, env: opts.env, cwd: opts.cwd });
    return c as unknown as ChildProcess;
  };
  const env = readEnv({ LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', OFFICE_PORT: '4327', DEEPGRAM_API_KEY: 'dg' });
  const logFile = path.join(dir, 'voice.log');
  const sup = createWorkerSupervisor({ env, voiceDir: path.join(dir, 'voice'), logFile, spawn, backoff: { first: 1000, max: 4000, stableMs: 60_000 }, killAfterMs: 50 });
  return { children, calls, sup, logFile };
}

describe('worker supervision', () => {
  it('is only wanted when all three LiveKit variables are set', () => {
    expect(hasLiveKitKeys(readEnv({}))).toBe(false);
    expect(hasLiveKitKeys(readEnv({ LIVEKIT_URL: 'u', LIVEKIT_API_KEY: 'k' }))).toBe(false);
    expect(hasLiveKitKeys(readEnv({ LIVEKIT_URL: 'u', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }))).toBe(true);
  });

  it('spawns with the keys and the office url, logs output to the file, restarts with growing backoff, stops on shutdown', async () => {
    const { children, calls, sup, logFile } = setup();
    sup.start();
    expect(children).toHaveLength(1);
    expect(calls[0].args).toContain('agent.py');
    expect(calls[0].env.LIVEKIT_URL).toBe('wss://x');
    expect(calls[0].env.OFFICE_URL).toBe('http://127.0.0.1:4327');
    expect(calls[0].env.DEEPGRAM_API_KEY).toBe('dg');
    expect(sup.alive()).toBe(true);

    children[0].stdout.emit('data', Buffer.from('hello from stdout\n'));
    children[0].stderr.emit('data', Buffer.from('oops on stderr\n'));

    children[0].die(1);
    expect(sup.alive()).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(children).toHaveLength(2);
    expect(sup.alive()).toBe(true);

    children[1].die(1);                       // quick second death: delay doubles to 2000
    await vi.advanceTimersByTimeAsync(1500);
    expect(children).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(children).toHaveLength(3);

    const stopping = sup.stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopping;
    expect(children[2].killed).toEqual(['SIGTERM']);
    expect(sup.alive()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(children).toHaveLength(3);          // no restart after stop

    const log = readFileSync(logFile, 'utf8');
    expect(log).toContain('hello from stdout');
    expect(log).toContain('oops on stderr');
    expect(log).toContain('voice worker exited');
    expect(log).toContain('restart in 1000 ms');
    expect(log).toContain('restart in 2000 ms');
  });

  it('resets the backoff after a stable run', async () => {
    const { children, sup, logFile } = setup();
    sup.start();
    children[0].die(1);
    await vi.advanceTimersByTimeAsync(1100);   // second child, next delay would be 2000
    await vi.advanceTimersByTimeAsync(61_000); // runs stably
    children[1].die(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(children).toHaveLength(3);
    const stopping = sup.stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopping;
    expect(readFileSync(logFile, 'utf8').match(/restart in 1000 ms/g)).toHaveLength(2);
  });

  it('treats a spawn error event (for example uv missing) as a death and retries', async () => {
    const { children, sup } = setup();
    sup.start();
    children[0].emit('error', new Error('spawn uv ENOENT'));
    expect(sup.alive()).toBe(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(children).toHaveLength(2);
    const stopping = sup.stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopping;
  });
});
