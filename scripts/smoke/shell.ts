/**
 * Smoke test for the Mac shell (src/main, src/preload). Run: npx tsx scripts/smoke/shell.ts
 *
 * Run 1: a seeded mock office on 4329 (started here, or reused), the app pointed at it with
 *        AGENT_MANAGER_OFFICE_URL and AGENT_MANAGER_TEST=1.
 * Run 2: no AGENT_MANAGER_OFFICE_URL, so main starts office itself; after quit nothing may listen on 4329.
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Only used inside page.evaluate callbacks, which run in the renderer.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const getComputedStyle: (e: any) => any;
declare const window: { shell?: import('../../src/shared/shell').ShellBridge } & Record<string, unknown>;

const root = resolve(import.meta.dirname, '../..');
const PORT = '4329';
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = 'data-w9';
const shotPath = join(root, 'shots/smoke/shell-window.png');
const electronBin = createRequire(import.meta.url)('electron') as unknown as string;
mkdirSync(join(root, 'shots/smoke'), { recursive: true });

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newestMtime(dir: string): number {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

function build(): void {
  const out = join(root, 'out/main/index.js');
  const stale = !existsSync(out) || !existsSync(join(root, 'out/renderer/index.html')) ||
    ['src/main', 'src/preload', 'src/renderer'].some((d) => newestMtime(join(root, d)) > statSync(out).mtimeMs);
  if (!stale) return console.log('build: out/ is current');
  console.log('build: npx electron-vite build');
  execFileSync('npx', ['electron-vite', 'build'], { cwd: root, stdio: 'inherit' });
}

async function health(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function listening(): string[] {
  try {
    return execFileSync('lsof', ['-ti', `:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const officeEnv = { ...process.env, MOCK_LLM: '1', DESKTOPS: 'mock', DATA_DIR: DATA, OFFICE_PORT: PORT, MOCK_SPEED: '10' };

let office: ChildProcess | null = null;
async function ensureOffice(): Promise<void> {
  if (!(await health())) {
    rmSync(join(root, DATA), { recursive: true, force: true }); // a clean database, so the seed gives the documented states
    office = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/office/main.ts'], {
      cwd: root,
      env: officeEnv,
      stdio: ['ignore', openSync(join(tmpdir(), 'w9-smoke-office.log'), 'a'), openSync(join(tmpdir(), 'w9-smoke-office.log'), 'a')],
      detached: true,
    });
    for (let i = 0; i < 100 && !(await health()); i++) await sleep(300);
    if (!(await health())) throw new Error('mock office did not start');
  }
  const list = (await (await fetch(`${BASE}/api/employees`)).json()) as unknown[];
  if (list.length < 4) {
    console.log('seeding');
    execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts'], { cwd: root, env: officeEnv, stdio: 'inherit' });
  }
}

function killPortOwners(): void {
  for (const pid of listening()) {
    const pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', pid], { encoding: 'utf8' }).trim());
    // an office we (or an earlier run of this script) started leads its own process group
    if (pgid !== process.pid && pgid !== process.ppid && pgid > 1) {
      try {
        process.kill(-pgid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

interface Emp {
  id: string;
  state: string;
  persona: { name: string; firstName: string; portraitUrl: string };
}
const humanize = (s: string) => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Test = {
  notificationList: () => { employeeId: string; title: string; body: string; portraitUrl: string; iconLoaded: boolean }[];
  trayLabels(): string[];
  badge(): string;
  clickNotification(id: string): void;
  clickTrayItem(label: string): boolean;
  trayAction(a: unknown): void;
  windowVisible(): boolean;
  closeWindow(): void;
  officePid(): number | null;
};
const hook = <T>(app: ElectronApplication, fn: string, ...args: unknown[]): Promise<T> =>
  app.evaluate((_e, [name, a]: [string, unknown[]]) => {
    const t = (globalThis as unknown as { __shellTest: Record<string, (...x: unknown[]) => unknown> }).__shellTest;
    return t[name](...a);
  }, [fn, args] as [string, unknown[]]) as Promise<T>;

async function runOne(): Promise<void> {
  console.log('\n== Run 1: shell against a seeded mock office (AGENT_MANAGER_OFFICE_URL) ==');
  await ensureOffice();
  const employees = (await (await fetch(`${BASE}/api/employees`)).json()) as Emp[];
  check('seeded office has four people', employees.length === 4, employees.map((e) => `${e.persona.firstName}:${e.state}`).join(' '));

  const userData = mkdtempSync(join(tmpdir(), 'w9-userdata-'));
  const launchArgs = [join(root, 'out/main/index.js'), `--user-data-dir=${userData}`];
  const env = {
    ...process.env,
    AGENT_MANAGER_TEST: '1',
    AGENT_MANAGER_OFFICE_URL: BASE,
    OFFICE_PORT: PORT,
    DATA_DIR: DATA,
  } as Record<string, string>;
  const app = await electron.launch({ args: launchArgs, cwd: root, env });
  try {
    const page: Page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForLoadState('load');
    await page.getByText(employees[0].persona.name).first().waitFor({ timeout: 20_000 });
    await page.evaluate('globalThis.__name = (f) => f; document.fonts.ready'); // tsx's keepNames helper, needed inside evaluate callbacks
    await sleep(800);

    // window
    const info = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { title: w.getTitle(), url: w.webContents.getURL(), size: w.getSize(), min: w.getMinimumSize(), visible: w.isVisible() };
    });
    check('window appears and loads office /', info.visible && info.url === `${BASE}/`, `${info.url} ${info.size.join('x')} min ${info.min.join('x')} "${info.title}"`);
    check('size 1280x800, minimum 960x640', info.size[0] === 1280 && info.size[1] === 800 && info.min[0] === 960 && info.min[1] === 640);
    const people = await page.getByText(/^(Maya|Priya|Jonas|Ines) /).count();
    check('renderer shows the four people', people >= 4, `${people} name matches`);

    // drag region
    const styles = await page.evaluate(() => {
      const s = (e: any) => (e ? (getComputedStyle(e) as unknown as Record<string, string>).webkitAppRegion : null);
      const hdr = document.querySelector('nav.astryx-side-nav > :first-child');
      const bar = document.querySelector('.astryx-layout-header');
      const sideBtn = document.querySelector('nav.astryx-side-nav button');
      const barBtn = document.querySelector('.astryx-layout-header button');
      const r = hdr?.getBoundingClientRect();
      return { sidebarHeader: s(hdr), topBar: s(bar), sidebarButton: s(sideBtn), topBarButton: s(barBtn), headerHeight: r?.height ?? 0, hasTopBar: Boolean(bar) };
    });
    check('drag region: sidebar header is drag, its buttons are no-drag', styles.sidebarHeader === 'drag' && styles.sidebarButton !== 'drag', JSON.stringify(styles));
    check('drag region: top bar is drag, its buttons are no-drag', !styles.hasTopBar || (styles.topBar === 'drag' && styles.topBarButton !== 'drag'), styles.hasTopBar ? '' : 'no top bar on screen (no thread open)');

    // screenshot + traffic light clearance (traffic lights sit at about x 13..70, y 6..30 in the title bar inset)
    await page.screenshot({ path: shotPath });
    const heading = await page.evaluate(() => {
      const hdr = document.querySelector('nav.astryx-side-nav > :first-child');
      const rects = [...(hdr?.querySelectorAll('*') ?? [])]
        .filter((el: any) => el.children.length === 0 && (el.textContent ?? '').trim() !== '')
        .map((el: any) => el.getBoundingClientRect())
        .filter((r: any) => r.width > 0 && r.height > 0);
      return { topOfContent: rects.length ? Math.min(...rects.map((r: any) => r.top)) : null, text: hdr?.textContent?.trim() ?? '' };
    });
    check('traffic-light inset: sidebar header content starts below the window buttons', heading.topOfContent !== null && heading.topOfContent >= 30, `header text "${heading.text}" starts at y=${heading.topOfContent}`);
    console.log(`screenshot ${shotPath}`);

    // tray: does the renderer call setTray itself?
    const rows = employees.map((e) => ({ id: e.id, name: e.persona.name, state: e.state }));
    let labels = await hook<string[]>(app, 'trayLabels');
    const rendererCalls = labels.some((l) => l.startsWith(employees[0].persona.name));
    console.log(`renderer called setTray by itself: ${rendererCalls ? 'yes' : 'no (calling window.shell.setTray from the page to prove the bridge and the menu)'}`);
    if (!rendererCalls) {
      await page.evaluate((r) => window.shell?.setTray(r, null), rows);
      await sleep(300);
      labels = await hook<string[]>(app, 'trayLabels');
    }
    console.log(`tray labels: ${JSON.stringify(labels)}`);
    const wanted = rows.map((r) => `${r.name}    ${humanize(r.state)}`);
    check('tray lists the four people with their states', wanted.every((w) => labels.includes(w)), wanted.join(' | '));
    const actions = ['Show desks', 'Summon meeting…', 'Hire…', 'Pause everyone', 'Open Deskmates', 'Quit'];
    check('tray has the actions', actions.every((a) => labels.includes(a)));
    await page.evaluate((r) => window.shell?.setTray(r, r[0].id), rows);
    await sleep(300);
    const lentLabels = await hook<string[]>(app, 'trayLabels');
    check('tray while screen lent', lentLabels[0] === `${rows[0].name} is using your screen` && lentLabels[1] === 'Take it back', JSON.stringify(lentLabels.slice(0, 3)));
    await page.evaluate((r) => window.shell?.setTray(r.map((x) => ({ ...x, state: 'paused' })), null), rows);
    await sleep(300);
    check('tray shows "Resume everyone" when all are paused', (await hook<string[]>(app, 'trayLabels')).includes('Resume everyone'));
    await page.evaluate((r) => window.shell?.setTray(r, null), rows);
    await sleep(300);

    // tray actions reach the renderer
    await page.evaluate(() => {
      const w = window as unknown as { __trayActions: unknown[] };
      w.__trayActions = [];
      window.shell?.onTrayAction((a) => w.__trayActions.push(a));
    });
    await hook(app, 'clickTrayItem', `${rows[1].name}    `);
    await hook(app, 'clickTrayItem', 'Hire…');
    await hook(app, 'clickTrayItem', 'Pause everyone');
    await sleep(300);
    const got = await page.evaluate(() => (window as unknown as { __trayActions: unknown[] }).__trayActions);
    check('tray menu clicks arrive through onTrayAction', JSON.stringify(got) === JSON.stringify([{ type: 'open', employeeId: rows[1].id }, { type: 'hire' }, { type: 'pause_all' }]), JSON.stringify(got));

    // notifications: try the renderer's own path first (a mock approval), then fall back to the bridge
    await page.evaluate(() => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      window.shell?.onNotificationClick((id) => w.__clicks.push(id));
    });
    const jonas = employees.find((e) => e.persona.firstName === 'Jonas') ?? employees[2];
    await fetch(`${BASE}/api/employees/${jonas.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Please save a file' }) });
    let notes = await hook<ReturnType<Test['notificationList']>>(app, 'notifications');
    for (let i = 0; i < 40 && notes.length === 0; i++) {
      await sleep(1000);
      notes = await hook<ReturnType<Test['notificationList']>>(app, 'notifications');
    }
    const viaRenderer = notes.length > 0;
    console.log(`renderer produced a notification by itself: ${viaRenderer ? 'yes' : 'no (using window.shell.notify from the page)'}`);
    if (!viaRenderer) {
      await page.evaluate((e) => window.shell?.notify({ employeeId: e.id, title: e.persona.name, body: 'Can I publish the draft?', portraitUrl: e.persona.portraitUrl }), jonas);
      await sleep(500);
      notes = await hook<ReturnType<Test['notificationList']>>(app, 'notifications');
    }
    check('a notification is recorded, not shown', notes.length > 0, JSON.stringify(notes[0]));
    const target = notes[0].employeeId;
    await hook(app, 'closeWindow');
    await sleep(300);
    await hook(app, 'clickNotification', target);
    await sleep(600);
    const clicks = await page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);
    check('notification click calls onNotificationClick with that employee and shows the window', clicks.length === 1 && clicks[0] === target && (await hook<boolean>(app, 'windowVisible')), JSON.stringify(clicks));
    const targetName = employees.find((e) => e.id === target)?.persona.name ?? '';
    const bar = await page.locator('.astryx-layout-header').first().textContent().catch(() => '');
    console.log(`INFO renderer selects the thread on notification click: ${bar?.includes(targetName) ? 'yes' : 'not observed (renderer does not register onNotificationClick yet)'}`);

    // badge, microphone
    await page.evaluate(() => window.shell?.setBadge(2));
    await sleep(200);
    const b2 = await hook<string>(app, 'badge');
    await page.evaluate(() => window.shell?.setBadge(0));
    await sleep(200);
    const b0 = await hook<string>(app, 'badge');
    check('badge text is "2" then empty', b2 === '2' && b0 === '', `${JSON.stringify(b2)} then ${JSON.stringify(b0)}`);
    const mic = await page.evaluate(() => window.shell?.askMicrophone());
    check('askMicrophone resolves a boolean without a prompt in test mode', typeof mic === 'boolean', String(mic));
    check('bridge exposes platform darwin', (await page.evaluate(() => window.shell?.platform)) === 'darwin');

    // close hides, process stays, Open shows
    await hook(app, 'closeWindow');
    await sleep(500);
    const hidden = !(await hook<boolean>(app, 'windowVisible'));
    const alive = await app.evaluate(() => process.pid > 0);
    check('closing the window hides it and the app keeps running', hidden && alive);
    await hook(app, 'clickTrayItem', 'Open Deskmates');
    await sleep(400);
    check('"Open Deskmates" shows the window again', await hook<boolean>(app, 'windowVisible'));

    // single instance
    await hook(app, 'closeWindow');
    await sleep(300);
    const second = spawn(electronBin, launchArgs, { cwd: root, env, stdio: 'ignore' });
    const secondCode = await new Promise<number | null>((resolveCode) => {
      const t = setTimeout(() => {
        second.kill('SIGKILL');
        resolveCode(null);
      }, 10_000);
      second.on('exit', (code) => {
        clearTimeout(t);
        resolveCode(code);
      });
    });
    await sleep(500);
    check('second launch exits and focuses the first window', secondCode === 0 && (await hook<boolean>(app, 'windowVisible')), `second exit code ${secondCode}`);

    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await app.close().catch(() => undefined);
  }
  await sleep(1000);
  check('run 1: external office is untouched by the shell quitting', await health());
}

async function runTwo(): Promise<void> {
  console.log('\n== Run 2: main starts office itself ==');
  killPortOwners();
  for (let i = 0; i < 20 && listening().length; i++) await sleep(250);
  check('port 4329 is free before run 2', listening().length === 0, listening().join(','));

  const userData = mkdtempSync(join(tmpdir(), 'w9-userdata-'));
  const env = { ...officeEnv, AGENT_MANAGER_TEST: '1' } as Record<string, string>;
  delete env.AGENT_MANAGER_OFFICE_URL;
  const app = await electron.launch({ args: [join(root, 'out/main/index.js'), `--user-data-dir=${userData}`], cwd: root, env });
  let pid: number | null = null;
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    pid = await hook<number | null>(app, 'officePid');
    const res = await fetch(`${BASE}/api/health`).then((r) => r.json()) as { ok: boolean };
    const url = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
    check('main started office and /api/health answers', res.ok && url === `${BASE}/`, `child pid ${pid}, window ${url}`);
    check('office log written to data-w9/office.log', existsSync(join(root, DATA, 'office.log')));
    check('child is a system node, not Electron', pid !== null && !execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).includes('Electron'),
      pid ? execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim().slice(0, 100) : '');
  } finally {
    await app.close().catch(() => undefined);
  }
  for (let i = 0; i < 40 && listening().length; i++) await sleep(250);
  check('after quit, lsof -ti:4329 is empty', listening().length === 0, listening().join(','));
  let gone = true;
  if (pid) {
    try {
      process.kill(pid, 0);
      gone = false;
    } catch {
      gone = true;
    }
  }
  check('after quit, the office child pid is gone', gone, String(pid));
}

try {
  build();
  await runOne();
  await runTwo();
} catch (e) {
  failures++;
  console.error(e);
} finally {
  killPortOwners();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
