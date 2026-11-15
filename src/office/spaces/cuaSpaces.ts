import type { Env } from '../../shared/index.ts';
import type { BackendEntry, BackendHandle, CuaBackend } from './cuaBackend.ts';
import {
  DEFAULT_NAME_PREFIX,
  errorText,
  guestDirname,
  isStaleError,
  planEnsure,
  powerKind,
  progressText,
  resolveGuestPath,
  shQuote,
  sleepMs,
  spaceIdFor,
  spaceNameFor,
  withTimeout,
} from './cuaPure.ts';
import { BROWSER_SETUP_SCRIPT } from './browserSetup.ts';
import { openCuaStream } from './stream.ts';
import type { EnsureOptions, ExecResult, McpEndpoint, SpaceInfo, SpaceState, Spaces } from './types.ts';

export interface CuaSpacesOptions {
  dataDir: string;
  env: Env;
  /** Space name prefix. Product: `emp-`. Tests: `test-w1-`. */
  namePrefix?: string;
  /** Tests: a fake SDK. The real one is loaded on first use. */
  backend?: CuaBackend;
}

const HEALTH_MS = 5_000;
const START_MS = 30_000;
const DELETE_MS = 30_000;
const THUMB_WIDTH = 480;
const BROWSER_SETUP_MS = 8_000;

const OFF = 'This desktop is off.';
const ABSENT = 'This desktop does not exist.';
const STUCK = 'This desktop stopped responding. Restart it.';

export function createCuaSpaces(opts: CuaSpacesOptions): Spaces {
  const prefix = opts.namePrefix ?? DEFAULT_NAME_PREFIX;
  const nameOf = (employeeId: string) => spaceNameFor(employeeId, prefix);
  const idOf = (employeeId: string) => spaceIdFor(nameOf(employeeId));

  let backendPromise: Promise<CuaBackend> | undefined;
  const backend = (): Promise<CuaBackend> => {
    if (opts.backend) return Promise.resolve(opts.backend);
    backendPromise ??= import('./cuaBackend.ts').then((m) => m.createSdkBackend());
    return backendPromise;
  };

  const homes = new Map<string, string>();
  /** One create/wake/reset/remove at a time per employee; concurrent `ensure` calls share one run. */
  const inflight = new Map<string, { promise: Promise<SpaceInfo>; listeners: Set<(m: string) => void> }>();
  const tails = new Map<string, Promise<unknown>>();

  const info = (employeeId: string, state: SpaceState): SpaceInfo => ({ id: idOf(employeeId), state });

  async function entryOf(employeeId: string): Promise<BackendEntry | undefined> {
    const id = idOf(employeeId);
    return (await (await backend()).list()).find((s) => s.id === id);
  }

  /** Runs `fn` after anything already queued for this employee. */
  function serial<T>(employeeId: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(employeeId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    tails.set(employeeId, run.catch(() => {}));
    return run;
  }

  /** Throws a plain sentence unless the desktop is listed as running; returns its handle. */
  async function running(employeeId: string): Promise<BackendHandle> {
    const e = await entryOf(employeeId);
    if (!e) throw new Error(ABSENT);
    if (powerKind(e.powerState) !== 'running') throw new Error(OFF);
    return (await backend()).handle(e.id);
  }

  /** Native errors have no message; log the tag, surface one plain sentence. */
  async function call<T>(employeeId: string, fn: (h: BackendHandle) => Promise<T>): Promise<T> {
    const h = await running(employeeId);
    try {
      return await fn(h);
    } catch (e) {
      console.warn(`[spaces] ${nameOf(employeeId)}: ${errorText(e)}`);
      if (isStaleError(e)) throw new Error(STUCK);
      throw e instanceof Error && e.message && e.message !== 'Error' ? e : new Error(errorText(e));
    }
  }

  async function answers(employeeId: string): Promise<boolean> {
    try {
      const h = await running(employeeId);
      const r = await withTimeout(h.bash('true', HEALTH_MS), HEALTH_MS + 1_000, 'health check');
      return !r.timedOut && (r.exitCode ?? 0) === 0;
    } catch {
      return false;
    }
  }

  async function waitHealthy(employeeId: string, tries: number): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      if (await answers(employeeId)) return true;
      await sleepMs(1_000);
    }
    return false;
  }

  async function forceDelete(employeeId: string): Promise<void> {
    const id = idOf(employeeId);
    const be = await backend();
    homes.delete(employeeId);
    try {
      await withTimeout(be.delete(id), DELETE_MS, 'delete');
    } catch (e) {
      const still = (await be.list().catch(() => [])).some((s) => s.id === id);
      if (still) throw new Error(`Could not remove this desktop: ${errorText(e)}`);
    }
  }

  async function createFresh(employeeId: string, o: EnsureOptions): Promise<SpaceInfo> {
    const be = await backend();
    const name = nameOf(employeeId);
    let last = '';
    const say = (m: string) => {
      if (m !== last) {
        last = m;
        o.onProgress?.(m);
      }
    };
    say('Creating desktop');
    try {
      await be.create({
        name,
        employeeId,
        internet: o.internet,
        onProgress: (phase) => say(progressText(phase)),
      });
    } catch (e) {
      console.warn(`[spaces] create ${name} failed: ${errorText(e)}`);
      await forceDelete(employeeId).catch(() => {});
      throw new Error(`Could not start this desktop: ${errorText(e)}`);
    }
    say('Checking the desktop answers');
    if (!(await waitHealthy(employeeId, 6))) {
      await forceDelete(employeeId).catch(() => {});
      throw new Error('The new desktop did not answer.');
    }
    await setUpBrowser(employeeId);
    if (process.env.ON_SCREEN === '1') await setUpWorkLog(employeeId);
    say('Desktop is ready');
    return info(employeeId, 'running');
  }

  /**
   * ON_SCREEN=1 (the live demo): a small always-on-top terminal in the bottom-right corner that tails ~/.worklog, the file the
   * shell tool mirrors every command into (spaceTools.ts). A failure is logged and never fails the hire.
   */
  async function setUpWorkLog(employeeId: string): Promise<void> {
    const script = [
      'export DISPLAY="${DISPLAY:-:0}"',
      'touch "$HOME/.worklog"',
      'if ! wmctrl -l 2>/dev/null | grep -q "Work log"; then',
      '  (setsid xfce4-terminal --title="Work log" --geometry=62x11 --hide-menubar --hide-scrollbar --hide-toolbar -e "tail -n 40 -F $HOME/.worklog" >/dev/null 2>&1 &)',
      '  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do wmctrl -l 2>/dev/null | grep -q "Work log" && break; sleep 0.3; done',
      'fi',
      'wmctrl -r "Work log" -b add,above 2>/dev/null',
      'wmctrl -r "Work log" -e 0,770,560,-1,-1 2>/dev/null',
      'true',
    ].join('\n');
    try {
      const h = await running(employeeId);
      await withTimeout(h.bash(script, 10_000), 11_000, 'work log setup');
    } catch (e) {
      console.warn(`[spaces] ${nameOf(employeeId)}: work log setup failed: ${errorText(e)}`);
    }
  }

  /** One clean Firefox, no popups (see browserSetup.ts). A failure is logged and never fails the hire. */
  async function setUpBrowser(employeeId: string): Promise<void> {
    const t0 = Date.now();
    try {
      const h = await running(employeeId);
      const r = await withTimeout(h.bash(BROWSER_SETUP_SCRIPT, BROWSER_SETUP_MS), BROWSER_SETUP_MS + 1_000, 'browser setup');
      if (r.timedOut || (r.exitCode ?? 0) !== 0) console.warn(`[spaces] ${nameOf(employeeId)}: browser setup did not finish cleanly`);
      else console.log(`[spaces] ${nameOf(employeeId)}: browser set up in ${Date.now() - t0} ms`);
    } catch (e) {
      console.warn(`[spaces] ${nameOf(employeeId)}: browser setup failed: ${errorText(e)}`);
    }
  }

  async function applyNetwork(employeeId: string, internet: boolean): Promise<void> {
    try {
      await (await backend()).setNetwork(idOf(employeeId), internet);
    } catch (e) {
      console.warn(`[spaces] ${nameOf(employeeId)}: could not set the network: ${errorText(e)}`);
    }
  }

  async function doEnsure(employeeId: string, o: EnsureOptions): Promise<SpaceInfo> {
    const be = await backend();
    const id = idOf(employeeId);
    o.onProgress?.('Checking desktop');
    const entry = await entryOf(employeeId);
    const plan = planEnsure(entry);

    if (plan === 'wake') {
      o.onProgress?.('Waking desktop');
      try {
        await withTimeout(be.start(id), START_MS, 'wake');
        if (await waitHealthy(employeeId, 10)) {
          await applyNetwork(employeeId, o.internet);
          o.onProgress?.('Desktop is ready');
          return info(employeeId, 'running');
        }
      } catch (e) {
        console.warn(`[spaces] wake ${nameOf(employeeId)} failed: ${errorText(e)}`);
      }
      o.onProgress?.('Replacing a broken desktop');
      await forceDelete(employeeId);
      return createFresh(employeeId, o);
    }

    if (plan === 'check') {
      if (await answers(employeeId)) {
        await applyNetwork(employeeId, o.internet);
        o.onProgress?.('Desktop is ready');
        return info(employeeId, 'running');
      }
      // Listed but not answering: the runtime VM crashed. Drop the stale entry and make a fresh one.
      o.onProgress?.('Replacing a broken desktop');
      await forceDelete(employeeId);
    }
    return createFresh(employeeId, o);
  }

  function ensure(employeeId: string, o: EnsureOptions): Promise<SpaceInfo> {
    const live = inflight.get(employeeId);
    if (live) {
      if (o.onProgress) live.listeners.add(o.onProgress);
      return live.promise;
    }
    const listeners = new Set<(m: string) => void>();
    if (o.onProgress) listeners.add(o.onProgress);
    const promise = serial(employeeId, () =>
      doEnsure(employeeId, { internet: o.internet, onProgress: (m) => listeners.forEach((l) => l(m)) }),
    ).finally(() => inflight.delete(employeeId));
    inflight.set(employeeId, { promise, listeners });
    return promise;
  }

  async function stateOf(employeeId: string): Promise<SpaceState> {
    const e = await entryOf(employeeId);
    if (!e) return 'absent';
    const k = powerKind(e.powerState);
    return k === 'running' ? 'running' : k === 'asleep' ? 'asleep' : 'error';
  }

  return {
    ensure,

    async wake(employeeId) {
      return serial(employeeId, async () => {
        const e = await entryOf(employeeId);
        if (!e) throw new Error(ABSENT);
        if (powerKind(e.powerState) === 'asleep') {
          try {
            await withTimeout((await backend()).start(e.id), START_MS, 'wake');
          } catch (err) {
            throw new Error(`Could not wake this desktop: ${errorText(err)}`);
          }
        }
        if (!(await waitHealthy(employeeId, 10))) throw new Error(STUCK);
        return info(employeeId, 'running');
      });
    },

    async sleep(employeeId) {
      return serial(employeeId, async () => {
        const e = await entryOf(employeeId);
        if (!e || powerKind(e.powerState) !== 'running') return;
        await (await backend()).suspend(e.id);
      });
    },

    async reset(employeeId, o) {
      return serial(employeeId, async () => {
        o.onProgress?.('Resetting desktop');
        if (await entryOf(employeeId)) await forceDelete(employeeId);
        return createFresh(employeeId, o);
      });
    },

    async remove(employeeId) {
      return serial(employeeId, async () => {
        homes.delete(employeeId);
        if (await entryOf(employeeId)) await forceDelete(employeeId);
      });
    },

    async healthy(employeeId) {
      return answers(employeeId);
    },

    async exec(employeeId, command, o): Promise<ExecResult> {
      const timeoutMs = o?.timeoutMs ?? 30_000;
      const r = await call(employeeId, (h) => h.bash(command, timeoutMs));
      return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode ?? (r.timedOut ? 124 : 1), timedOut: r.timedOut };
    },

    async readFile(employeeId, p) {
      return call(employeeId, async (h) => {
        const home = await homeOf(employeeId, h);
        try {
          return (await h.download(resolveGuestPath(home, p))).toString('utf8');
        } catch (e) {
          console.warn(`[spaces] read ${p}: ${errorText(e)}`);
          throw new Error(`Could not read ${p}. Check the file exists.`);
        }
      });
    },

    async writeFile(employeeId, p, content) {
      return call(employeeId, async (h) => {
        const home = await homeOf(employeeId, h);
        const abs = resolveGuestPath(home, p);
        const mk = await h.bash(`mkdir -p ${shQuote(guestDirname(abs))}`, 10_000);
        if ((mk.exitCode ?? 0) !== 0) throw new Error(`Could not create the folder for ${p}.`);
        await h.write(abs, typeof content === 'string' ? new TextEncoder().encode(content) : content);
      });
    },

    async screenshot(employeeId) {
      return call(employeeId, (h) => h.screenshotJpeg({ quality: 80 }));
    },

    async thumbnail(employeeId) {
      return call(employeeId, async (h) => {
        try {
          return await h.screenshotJpeg({ quality: 70, maxDimension: THUMB_WIDTH });
        } catch {
          return h.thumbnailJpeg();
        }
      });
    },

    async mcpEndpoint(employeeId): Promise<McpEndpoint> {
      const e = await entryOf(employeeId);
      if (!e) throw new Error(ABSENT);
      if (powerKind(e.powerState) !== 'running') throw new Error(OFF);
      try {
        return await (await backend()).mcpEndpoint(e.id);
      } catch (err) {
        console.warn(`[spaces] mcp endpoint for ${nameOf(employeeId)}: ${errorText(err)}`);
        throw new Error(isStaleError(err) ? STUCK : `Could not reach this desktop's tools: ${errorText(err)}`);
      }
    },

    async openStream(employeeId, mode) {
      const h = await running(employeeId);
      return openCuaStream(h, employeeId, mode);
    },

    async setInternet(employeeId, on) {
      const e = await entryOf(employeeId);
      if (!e) throw new Error(ABSENT);
      if (powerKind(e.powerState) !== 'running') throw new Error(OFF);
      let applied: string;
      try {
        applied = (await (await backend()).setNetwork(e.id, on)).applied;
      } catch (err) {
        throw new Error(`Could not change the internet setting: ${errorText(err)}`);
      }
      if (applied !== 'now') throw new Error('The internet setting applies after the desktop restarts.');
    },

    state: stateOf,
  };

  async function homeOf(employeeId: string, h: BackendHandle): Promise<string> {
    let home = homes.get(employeeId);
    if (!home) {
      home = (await h.home()) || '/home/cua';
      homes.set(employeeId, home);
    }
    return home;
  }
}
