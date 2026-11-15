// Layer 4 end-to-end test: a browser drives the real renderer against a running office, with mouse and keyboard, and
// checks the product's promises at the UI level (scenarios S1, S2, S3, S4, S9, S12, S13, S14 and S17 of
// docs/hackathon/spec/test-plan.md). Nothing in this file touches the renderer's code: every control is found by its
// role and accessible name, and every label lives in LABELS so a copy change is a one-line fix.
//
//   npx tsx scripts/e2e/ui.ts                  mock office (MOCK_LLM=1, DESKTOPS=mock, fast), about two minutes, costs nothing
//   npx tsx scripts/e2e/ui.ts --real           real desktop and real model (claude-haiku-5-5), S1 and S2 only, budget $0.50
//   flags: --speed 2 (MOCK_SPEED) --port 4381 --web 4391 --data data-w11 --headed --keep --budget 0.5 --model <id>
//
// Evidence: shots/e2e-ui/<scenario>/NN-step.png for every step; on a failure also fail.png, console.txt (everything the
// page logged) and office-log.txt (last office log lines) in that scenario's folder. Exit code 1 on any FAIL.
// A scenario also fails when the page logs a console error, throws, or shows the error boundary ("Something went wrong").
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { Client, OfficeProc, ROOT, Run, employeeProcs, flag, hasFlag, portInUse, sleep } from './lib/harness.ts';
import { PageGuard, freshDir, startWeb, type Web } from './lib/web.ts';

// ---------- every label the test relies on (the renderer's copy changes: fix it here) ----------

const LABELS = {
  navigation: /^team$/i, // the sidebar landmark
  firstRunHire: /^hire$/i, // the one button of the empty state
  sidebarHire: /^hire$/i, // the plus in the sidebar header
  hireDialog: /^(hire|new hire)$/i,
  roleWebDeveloper: /web developer/i,
  roleMarketer: /marketer/i,
  hireConfirm: /^hire\s+\w/i, // "Hire Maya"
  composer: /message/i, // "Message input"
  send: /^send$/i,
  delivered: 'Delivered',
  seen: 'Seen',
  desktopToggle: /^desktop$/i,
  desktopClose: /close desktop/i,
  desktopPicture: /^desktop$/i, // the box that holds the live picture
  plan: 'Sketch the structure', // mock script: first plan step
  planDone: 'Done', // accessible name of a ticked plan icon
  noPlan: /no plan yet/i,
  working: 'Working',
  workedFor: /^worked for/i,
  approve: /^approve$/i,
  deny: /^deny$/i,
  needsYou: 'Needs you',
  idle: 'Idle',
  paused: 'Paused',
  moreMenu: /^more$/i,
  pauseItem: /^pause/i,
  resumeButton: /^resume$/i,
  removeItem: /^remove employee/i,
  removeConfirm: /^remove$/i,
  profileDialog: /profile/i,
  levelAsksFirst: /^asks first$/i,
  levelIndependent: /^works independently$/i,
  callButton: /^call$/i,
  callControls: /call controls/i,
  callEnd: /^end$/i,
  tile: /press to address/i,
  summonButton: /^summon meeting$/i,
  summonDialog: /summon meeting/i,
  summonStart: /^start meeting$/i,
  teamButton: /^team$/i,
  askBox: /ask/i,
  noWork: /no work yet/i,
  firstRunTitle: /hire your first/i,
  // mock script (src/office/runtime/mockRuntime.ts): what Maya and Priya say and do
  mockGreeting: /i'm (maya|priya)/i,
  mockActivity: /Opened the project folder|Wrote the first draft|Ran the checks/,
  mockSteerReply: /fold that in/i,
  mockApprovalBig: 'Publish the draft', // default level, "big step"
  mockApprovalFirst: 'Save a file', // level "Asks first"
  mockDone: /Done\. The page is up on staging/i,
  mockDenied: /won't go ahead/i,
  mockCaption: /Going well/i,
  callLine: /^Call with/i,
  meetingLine: /^Meeting\b/i,
  callsOffReason: /off|livekit|key/i,
  meetingReason: /call|livekit|key|off|another/i,
};

// ---------- options ----------

const REAL = hasFlag('real');
const PORT = Number(flag('port') ?? 4381);
const WEB_PORT = Number(flag('web') ?? 4391);
const DATA = flag('data') ?? 'data-w11';
const SPEED = flag('speed') ?? '2';
const MODEL = flag('model') ?? 'claude-haiku-5-5';
const BUDGET = Number(flag('budget') ?? 0.5);
const KEEP = hasFlag('keep');
const HEADED = hasFlag('headed');
const OUT = path.join(ROOT, 'shots/e2e-ui');

// Waits (ms). Real desktops and the real model are slow.
const T = REAL
  ? { ui: 15_000, greeting: 150_000, activity: 120_000, done: 360_000, plan: 45_000 }
  : { ui: 10_000, greeting: 20_000, activity: 15_000, done: 40_000, plan: 15_000 };

// ---------- result bookkeeping ----------

interface Result {
  id: string;
  name: string;
  ok: boolean;
  secs: number;
  evidence: string;
}
const results: Result[] = [];
const secs = (t0: number) => +((Date.now() - t0) / 1000).toFixed(1);
const brief = (e: unknown): string => {
  const lines = (e instanceof Error ? e.message : String(e)).split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.find((l) => !/^(at |Call log:|-)/.test(l)) ?? String(e);
  const waiting = lines.find((l) => /^- (waiting for|locator resolved|element)/.test(l));
  return `${head}${waiting ? ` [${waiting.replace(/^- /, '')}]` : ''}`.slice(0, 400);
};

function record(r: Result): void {
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name} (${r.secs}s) - ${r.evidence}`);
}

// ---------- the page, as a person uses it ----------

class Ui {
  readonly guard: PageGuard;
  shotN = 0;
  scenario = '';
  constructor(readonly page: Page, readonly officeLogs: () => string) {
    this.guard = new PageGuard(page);
  }

  get nav(): Locator {
    return this.page.getByRole('navigation', { name: LABELS.navigation });
  }
  get main(): Locator {
    return this.page.getByRole('main');
  }
  row(first: string): Locator {
    return this.nav.getByRole('listitem').filter({ hasText: first });
  }
  rowState(first: string, state: string): Locator {
    return this.row(first).getByRole('img', { name: state, exact: true });
  }
  /** Her real messages and activity (not the three typing dots). */
  get assistant(): Locator {
    return this.main.getByRole('article', { name: /message from assistant/i }).filter({ hasNot: this.page.getByRole('status', { name: /typing/i }) });
  }
  get composer(): Locator {
    return this.main.getByRole('textbox', { name: LABELS.composer });
  }

  dir(): string {
    return path.join(OUT, this.scenario);
  }

  async shot(name: string): Promise<void> {
    this.shotN++;
    await this.page.screenshot({ path: path.join(this.dir(), `${String(this.shotN).padStart(2, '0')}-${name}.png`) }).catch(() => {});
  }

  async saveFailure(from: number): Promise<void> {
    await this.page.screenshot({ path: path.join(this.dir(), 'fail.png') }).catch(() => {});
    this.guard.save(path.join(this.dir(), 'console.txt'), from);
    await this.page.locator('body').ariaSnapshot({ timeout: 3000 }).then((t) => writeFileSync(path.join(this.dir(), 'page.txt'), t)).catch(() => {});
    writeFileSync(path.join(this.dir(), 'office-log.txt'), this.officeLogs().split('\n').slice(-120).join('\n'));
  }

  /** Opens the app and waits for the sidebar. A page that fails to compile (a file is mid-edit) is retried for a few minutes. */
  async load(url: string): Promise<void> {
    const t0 = Date.now();
    let last = '';
    for (let attempt = 1; attempt <= 8; attempt++) {
      const mark = this.guard.mark();
      await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => (last = brief(e)));
      try {
        await this.nav.waitFor({ state: 'visible', timeout: 25_000 });
        await this.page.evaluate(`(() => {
          const w = window; w.__delivery = [];
          const scan = () => {
            const arts = [...document.querySelectorAll('article')].filter((a) => /Message from user/.test(a.getAttribute('aria-label') || ''));
            const last = arts[arts.length - 1];
            if (!last) return;
            const t = (last.textContent || '').trim();
            const st = /Seen$/.test(t) ? 'Seen' : /Delivered$/.test(t) ? 'Delivered' : '';
            const key = t.replace(/(Delivered|Seen)$/, '').trim();
            const prev = w.__delivery[w.__delivery.length - 1];
            if (st && (!prev || prev.key !== key || prev.st !== st)) w.__delivery.push({ key, st });
          };
          new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        })()`);
        return;
      } catch (e) {
        last = brief(e);
        const body = ((await this.page.locator('body').innerText().catch(() => '')) || '').slice(0, 200).replace(/\s+/g, ' ');
        console.log(`  page did not come up (attempt ${attempt}, ${Math.round((Date.now() - t0) / 1000)}s): ${last}${body ? ` | ${body}` : ''} - waiting 30 s, a file may be mid-edit`);
        this.guard.problems.length = mark.problems; // compile noise from a failed attempt is not a verdict
        await sleep(30_000);
      }
    }
    throw new Error(`the renderer never came up: ${last}`);
  }

  async delivery(): Promise<{ key: string; st: string }[]> {
    return (await this.page.evaluate('window.__delivery || []')) as { key: string; st: string }[];
  }

  async send(text: string): Promise<void> {
    await this.composer.fill(text);
    await this.main.getByRole('button', { name: LABELS.send }).click();
  }

  async openEmployee(first: string): Promise<void> {
    await this.nav.getByRole('button', { name: new RegExp(`^${first}`) }).click();
    await this.composer.waitFor({ state: 'visible' });
  }

  async openHire(): Promise<void> {
    const emptyState = this.main.getByRole('heading', { name: LABELS.firstRunTitle });
    if (await emptyState.isVisible().catch(() => false)) await this.main.getByRole('button', { name: LABELS.firstRunHire }).click();
    else await this.nav.getByRole('button', { name: LABELS.sidebarHire }).click();
    await this.page.getByRole('dialog', { name: LABELS.hireDialog }).waitFor({ state: 'visible' });
  }

  /** Hire through the dialog: pick the role, meet the candidate (name and face), press the hire button. Returns the first name. */
  async hireVia(role: RegExp): Promise<{ first: string; full: string; photo: boolean; ms: number }> {
    await this.openHire();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: role }).first().click();
    const hireBtn = dialog.getByRole('button', { name: LABELS.hireConfirm });
    await hireBtn.waitFor({ state: 'visible', timeout: T.ui });
    await sleep(300);
    const label = (await hireBtn.innerText()).trim();
    const first = label.split(/\s+/).slice(1).join(' ');
    const face = dialog.getByRole('img', { name: new RegExp(`^${first}\\b`) }).first();
    await face.waitFor({ state: 'visible', timeout: T.ui });
    const full = ((await face.getAttribute('aria-label')) ?? (await face.getAttribute('alt')) ?? first).trim();
    if (!(await dialog.getByText(full, { exact: true }).first().isVisible().catch(() => false))) throw new Error(`the candidate's name "${full}" is not shown`);
    const photo = await face.evaluate((el: any) => {
      const i = el.tagName === 'IMG' ? el : el.querySelector('img');
      return !!i && i.naturalWidth > 0;
    });
    await this.shot('candidate');
    const t0 = Date.now();
    await hireBtn.click();
    await this.row(first).waitFor({ state: 'visible', timeout: T.ui });
    return { first, full, photo, ms: Date.now() - t0 };
  }

  async expectState(first: string, state: string, timeout = T.ui): Promise<void> {
    await this.rowState(first, state).waitFor({ state: 'visible', timeout });
  }

  async openProfile(first: string): Promise<Locator> {
    await this.main.getByRole('button', { name: new RegExp(`^${first}`) }).first().click();
    const d = this.page.getByRole('dialog', { name: LABELS.profileDialog });
    await d.waitFor({ state: 'visible' });
    return d;
  }

  /** Chooses a permission level in the open profile (waits for the drawer to finish sliding in). */
  async chooseLevel(d: Locator, label: RegExp): Promise<void> {
    await sleep(700);
    await d.getByText(label).first().click();
  }

  /** Back to a known place after a failed scenario: no dialog, no drawer, no call stage. */
  async recover(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await sleep(300);
    }
    const end = this.page.getByRole('toolbar', { name: LABELS.callControls }).getByRole('button', { name: LABELS.callEnd });
    if (await end.isVisible().catch(() => false)) await end.click().catch(() => {});
  }

  async closeDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: T.ui }).catch(() => {});
  }

  async more(item: RegExp): Promise<void> {
    await this.main.getByRole('button', { name: LABELS.moreMenu }).click();
    await this.page.getByRole('menuitem', { name: item }).click();
  }
}

// ---------- direct checks (the office's own answers, never the UI's) ----------

async function api<T>(base: string, p: string): Promise<{ status: number; data: T }> {
  const r = await fetch(base + p);
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: r.status, data: data as T };
}

interface EmployeeLite {
  id: string;
  state: string;
  persona: { firstName: string };
  permissions: { level: string };
}
interface TeamLite {
  totals: { tasksDone: number; costUsd: number };
  rows: { name: string; tasksDone: number; costUsd: number }[];
}

// ---------- the scenarios ----------

async function runScenario(ui: Ui, id: string, name: string, fn: () => Promise<string>): Promise<boolean> {
  ui.scenario = id;
  ui.shotN = 0;
  freshDir(ui.dir());
  const mark = ui.guard.mark();
  const t0 = Date.now();
  try {
    const evidence = await fn();
    const problems = await ui.guard.check(mark);
    if (problems.length) throw new Error(problems.join(' | '));
    record({ id, name, ok: true, secs: secs(t0), evidence });
    return true;
  } catch (e) {
    await ui.saveFailure(mark.lines);
    record({ id, name, ok: false, secs: secs(t0), evidence: `${brief(e)} (see shots/e2e-ui/${id}/)` });
    await ui.recover();
    return false;
  }
}

/** A part of a scenario that is reported under its own id (S3 and S4 happen inside the S2 task). Never throws. */
async function sub(ui: Ui, id: string, name: string, fn: () => Promise<string>): Promise<boolean> {
  const mark = ui.guard.mark();
  const t0 = Date.now();
  try {
    const evidence = await fn();
    const problems = await ui.guard.check(mark);
    if (problems.length) throw new Error(problems.join(' | '));
    record({ id, name, ok: true, secs: secs(t0), evidence });
    return true;
  } catch (e) {
    const dir = path.join(OUT, id);
    freshDir(dir);
    await ui.page.screenshot({ path: path.join(dir, 'fail.png') }).catch(() => {});
    ui.guard.save(path.join(dir, 'console.txt'), mark.lines);
    writeFileSync(path.join(dir, 'office-log.txt'), ui.officeLogs().split('\n').slice(-120).join('\n'));
    record({ id, name, ok: false, secs: secs(t0), evidence: `${brief(e)} (see shots/e2e-ui/${id}/)` });
    return false;
  }
}

const TASK = REAL ? 'Make a one-page site about our team in ~/work/site and show it to me in the browser' : 'Please make a one-page site about our team';

interface State {
  base: string;
  maya: string; // first name of the first hire
  mayaId: string;
  priya: string;
  priyaId: string;
}

async function employeeId(base: string, first: string): Promise<string> {
  const all = (await api<EmployeeLite[]>(base, '/api/employees')).data;
  const e = all.find((x) => x.persona.firstName === first);
  if (!e) throw new Error(`the office does not know ${first}`);
  return e.id;
}

async function s1(ui: Ui, st: State): Promise<string> {
  const { page } = ui;
  await ui.load(webUrl);
  // empty state: one clear action
  await ui.main.getByRole('heading', { name: LABELS.firstRunTitle }).waitFor({ state: 'visible', timeout: T.ui });
  const buttons = await ui.main.getByRole('button').all();
  const names: string[] = [];
  for (const b of buttons) if (await b.isVisible()) names.push(((await b.innerText()) || (await b.getAttribute('aria-label')) || '').trim());
  if (names.length !== 1 || !LABELS.firstRunHire.test(names[0]!)) throw new Error(`the empty state should offer exactly one action "Hire", it shows: ${JSON.stringify(names)}`);
  await ui.shot('first-run');
  const h = await ui.hireVia(LABELS.roleWebDeveloper);
  st.maya = h.first;
  await ui.shot('hired-row');
  if (h.ms > 3000) throw new Error(`her row took ${h.ms} ms to appear`);
  // her first message arrives by itself
  const t0 = Date.now();
  await ui.openEmployee(st.maya).catch(() => {}); // a hire may already have opened her thread
  await ui.assistant.first().waitFor({ state: 'visible', timeout: T.greeting });
  const greetMs = Date.now() - t0;
  if (!REAL && !(await ui.main.getByText(LABELS.mockGreeting).first().isVisible())) throw new Error('the first message is not her greeting');
  await ui.shot('first-message');
  st.mayaId = await employeeId(st.base, st.maya);
  void page;
  return `${h.full} offered (photo ${h.photo ? 'loaded' : 'not loaded, initials shown'}), row after ${h.ms} ms, first message ${(greetMs / 1000).toFixed(1)} s later`;
}

async function s2(ui: Ui, st: State): Promise<string> {
  const { main } = ui;
  await ui.openEmployee(st.maya);
  await main.getByRole('button', { name: LABELS.desktopToggle }).click();
  await main.getByText(LABELS.noPlan).waitFor({ state: 'visible', timeout: T.ui });
  await ui.shot('panel-no-plan');
  const logBefore = ((await main.getByRole('log').innerText()) || '').length;
  await ui.send(TASK);
  await ui.shot('task-sent');
  await ui.expectState(st.maya, LABELS.working, T.activity);
  let planNote = '';
  let planOk = true;
  // the plan appears
  try {
    if (REAL) await main.getByText(LABELS.noPlan).waitFor({ state: 'hidden', timeout: T.plan });
    else await main.getByText(LABELS.plan).waitFor({ state: 'visible', timeout: T.plan });
  } catch {
    planOk = false;
    planNote = 'no plan appeared (known: I-4, models do not always plan)';
  }
  // activity lines
  const activity = main.getByRole('progressbar', { name: LABELS.working }).or(main.getByRole('button', { name: LABELS.workedFor })).first();
  await activity.waitFor({ state: 'visible', timeout: T.activity });
  await ui.shot('activity');

  // S3: a second message while she works: Delivered, then Seen
  if (!REAL) {
    await sub(ui, 'S3', 'Steer while she works: Delivered then Seen', async () => {
      const text = 'Make the heading blue';
      await ui.send(text);
      await ui.shot('steer-sent');
      const deadline = Date.now() + 8000;
      let seq: string[] = [];
      while (Date.now() < deadline) {
        seq = (await ui.delivery()).filter((d) => d.key === text).map((d) => d.st);
        if (seq.includes(LABELS.seen)) break;
        await sleep(50);
      }
      if (!seq.includes(LABELS.delivered)) throw new Error(`the message never showed "Delivered" (saw: ${JSON.stringify(seq)})`);
      if (!seq.includes(LABELS.seen)) throw new Error(`the message never showed "Seen" (saw: ${JSON.stringify(seq)})`);
      if (seq.indexOf(LABELS.delivered) > seq.indexOf(LABELS.seen)) throw new Error(`"Seen" came before "Delivered": ${JSON.stringify(seq)}`);
      await main.getByText(LABELS.mockSteerReply).waitFor({ state: 'visible', timeout: T.ui });
      await ui.shot('steer-seen');
      return `footer went ${seq.join(' then ')}; she answered "Got it, I'll fold that in."`;
    });
  }

  // the plan ticks over (needs the desktop panel, which is open)
  if (planOk) {
    const ticked = main.getByRole('img', { name: LABELS.planDone, exact: true });
    const t0 = Date.now();
    while ((await ticked.count()) < 1 && Date.now() - t0 < T.plan) await sleep(100);
    if ((await ticked.count()) < 1) {
      planOk = false;
      planNote = 'the plan appeared but no step was ticked';
    } else if (!REAL) {
      while ((await ticked.count()) < 3 && Date.now() - t0 < T.plan) await sleep(100);
      planNote = `plan appeared and ${await ticked.count()} steps ticked`;
    } else planNote = 'plan appeared and ticked';
  }

  // S4: an approval appears in the conversation
  const approve = main.getByRole('button', { name: LABELS.approve });
  let asked = false;
  if (!REAL) {
    asked = await sub(ui, 'S4', 'Approval in the conversation, sidebar needs-you, Approve continues', async () => {
      await approve.waitFor({ state: 'visible', timeout: T.activity });
      await ui.expectState(st.maya, LABELS.needsYou);
      const rowText = (await ui.row(st.maya).innerText()).replace(/\s+/g, ' ');
      if (!rowText.includes(LABELS.mockApprovalBig)) throw new Error(`the sidebar row does not say what she wants: "${rowText}"`);
      if (!(await main.getByText(LABELS.mockApprovalBig).first().isVisible())) throw new Error('the approval title is not in the conversation');
      await ui.shot('approval');
      await approve.click();
      await main.getByText(/you approved/i).waitFor({ state: 'visible', timeout: T.ui });
      await ui.shot('approved');
      return `approval "${LABELS.mockApprovalBig}" in the thread, row "Needs you", Approve continued her`;
    });
    if (!asked) await approve.click().catch(() => {});
  } else {
    // a real model may or may not ask; approve whatever comes up so she can finish
    const end = Date.now() + T.done;
    while (Date.now() < end) {
      if (await approve.isVisible().catch(() => false)) {
        await ui.shot('approval');
        await approve.click();
      }
      if (await ui.rowState(st.maya, LABELS.idle).isVisible().catch(() => false)) break;
      await sleep(1000);
    }
  }

  // the done bubble arrives, she is idle again
  if (!REAL) await main.getByText(LABELS.mockDone).waitFor({ state: 'visible', timeout: T.done });
  await ui.expectState(st.maya, LABELS.idle, T.done);
  const logAfter = ((await main.getByRole('log').innerText()) || '').length;
  if (logAfter < logBefore + TASK.length + 20) throw new Error('nothing new from her in the conversation after the task');
  await ui.shot('done');
  if (!planOk && !REAL) throw new Error(planNote);
  const lines = (await main.getByRole('button', { name: LABELS.workedFor }).count()) + (await main.getByRole('progressbar', { name: LABELS.working }).count());
  return `${planNote || 'plan checked'}; ${lines} activity group(s); done bubble arrived; row back to Idle`;
}

async function s4Deny(ui: Ui, st: State): Promise<string> {
  const { main } = ui;
  const p = await ui.hireVia(LABELS.roleMarketer);
  st.priya = p.first;
  await ui.openEmployee(st.priya).catch(() => {});
  await ui.assistant.first().waitFor({ state: 'visible', timeout: T.greeting });
  st.priyaId = await employeeId(st.base, st.priya);
  // set her to "Asks first" in the profile
  const d = await ui.openProfile(st.priya);
  await ui.chooseLevel(d, LABELS.levelAsksFirst);
  const t0 = Date.now();
  for (;;) {
    const e = (await api<EmployeeLite>(st.base, `/api/employees/${st.priyaId}`)).data;
    if (e.permissions.level === 'asks_first') break;
    if (Date.now() - t0 > T.ui) throw new Error(`the office still has her at ${e.permissions.level} after choosing "Asks first"`);
    await sleep(100);
  }
  await ui.shot('profile-asks-first');
  await ui.closeDialog();
  await ui.send('Please save the team page as a file');
  const deny = main.getByRole('button', { name: LABELS.deny });
  await deny.waitFor({ state: 'visible', timeout: T.activity });
  await ui.expectState(st.priya, LABELS.needsYou);
  if (!(await main.getByText(LABELS.mockApprovalFirst).first().isVisible())) throw new Error(`the approval "${LABELS.mockApprovalFirst}" is not in the conversation`);
  await ui.shot('approval');
  await deny.click();
  await main.getByText(/you denied/i).waitFor({ state: 'visible', timeout: T.ui });
  await main.getByText(LABELS.mockDenied).waitFor({ state: 'visible', timeout: T.done });
  await ui.expectState(st.priya, LABELS.idle, T.done);
  await ui.shot('denied');
  return `${p.full} hired from the dialog, set to Asks first in the profile (office agrees); Deny made her stop and say so`;
}

async function s9(ui: Ui, st: State): Promise<string> {
  const { main, page } = ui;
  await ui.openEmployee(st.maya);
  // the desktop panel shows a picture
  const toggle = main.getByRole('button', { name: LABELS.desktopToggle });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await main.getByRole('img', { name: LABELS.desktopPicture }).waitFor({ state: 'visible', timeout: T.ui });
  let kind = 'frame';
  try {
    await page.waitForFunction(`[...document.querySelectorAll('img')].some((i) => /frame\\.jpg/.test(i.src) && i.naturalWidth > 100)`, undefined, { timeout: T.ui });
  } catch {
    if (await page.locator('canvas').first().isVisible().catch(() => false)) kind = 'live canvas';
    else throw new Error('the desktop panel shows no picture (no frame.jpg loaded and no live canvas)');
  }
  await ui.shot('desktop-open');
  await main.getByRole('button', { name: LABELS.desktopClose }).click();
  await main.getByRole('button', { name: LABELS.desktopClose }).waitFor({ state: 'hidden', timeout: T.ui });
  await ui.shot('desktop-closed');
  // profile: change the permission level
  const d = await ui.openProfile(st.maya);
  await ui.chooseLevel(d, LABELS.levelIndependent);
  const t0 = Date.now();
  for (;;) {
    const e = (await api<EmployeeLite>(st.base, `/api/employees/${st.mayaId}`)).data;
    if (e.permissions.level === 'independent') break;
    if (Date.now() - t0 > T.ui) throw new Error(`the office still has her at ${e.permissions.level}`);
    await sleep(100);
  }
  const chosen = d.getByRole('radio', { name: LABELS.levelIndependent });
  const tc = Date.now();
  while (!(await chosen.isChecked()) && Date.now() - tc < T.ui) await sleep(100);
  if (!(await chosen.isChecked())) throw new Error('the profile does not show the new level as chosen');
  await ui.shot('profile-level');
  await ui.closeDialog();
  // pause and resume
  await ui.more(LABELS.pauseItem);
  await ui.expectState(st.maya, LABELS.paused);
  await main.getByText(/is paused/i).waitFor({ state: 'visible', timeout: T.ui });
  const paused = (await api<EmployeeLite>(st.base, `/api/employees/${st.mayaId}`)).data.state;
  if (paused !== 'paused') throw new Error(`the office says she is ${paused} after Pause`);
  await ui.shot('paused');
  await main.getByRole('button', { name: LABELS.resumeButton }).click();
  await ui.expectState(st.maya, LABELS.idle);
  await ui.shot('resumed');
  return `desktop picture shown (${kind}) and closed; level changed to Works independently (office agrees); paused then resumed`;
}

async function s12(ui: Ui, st: State): Promise<string> {
  const { page, main } = ui;
  await ui.openEmployee(st.maya);
  await main.getByRole('button', { name: LABELS.callButton }).click();
  const controls = page.getByRole('toolbar', { name: LABELS.callControls });
  await controls.waitFor({ state: 'visible', timeout: T.ui });
  await page.getByRole('checkbox', { name: new RegExp(`${st.maya}.*${LABELS.tile.source}`, 'i') }).waitFor({ state: 'visible', timeout: T.ui });
  await controls.getByRole('button', { name: /mute/i }).waitFor({ state: 'visible', timeout: T.done }); // the full pill appears once connected
  for (const c of [/mute/i, /captions/i, /layout/i, LABELS.callEnd]) {
    if (!(await controls.getByRole('button', { name: c }).first().isVisible())) throw new Error(`call control ${c} is missing`);
  }
  await ui.shot('stage');
  if (!REAL) {
    await page.getByText(LABELS.mockCaption).first().waitFor({ state: 'visible', timeout: T.done });
    await ui.shot('caption');
  }
  await controls.getByRole('button', { name: LABELS.callEnd }).click();
  await controls.waitFor({ state: 'hidden', timeout: T.ui });
  await ui.composer.waitFor({ state: 'visible', timeout: T.ui });
  await main.getByText(LABELS.callLine).first().waitFor({ state: 'visible', timeout: T.ui });
  await ui.shot('back-in-chat');
  return `stage opened with her tile and Mute, Captions, Layout, End; ended; the chat shows the call line`;
}

async function s13(ui: Ui, st: State): Promise<string> {
  const { page, main } = ui;
  await ui.openEmployee(st.maya);
  await main.getByRole('button', { name: LABELS.summonButton }).click();
  const dialog = page.getByRole('dialog', { name: LABELS.summonDialog });
  await dialog.waitFor({ state: 'visible', timeout: T.ui });
  await dialog.getByRole('button', { name: new RegExp(`^${st.priya}`) }).click();
  await ui.shot('picker');
  await dialog.getByRole('button', { name: LABELS.summonStart }).click();
  const tiles = page.getByRole('checkbox', { name: LABELS.tile });
  await tiles.first().waitFor({ state: 'visible', timeout: T.ui });
  await sleep(500);
  const n = await tiles.count();
  if (n !== 2) throw new Error(`expected two tiles, saw ${n}`);
  await ui.shot('meeting');
  // address her by clicking her tile, as a person does (the tile is the whole picture): must not break anything
  const box = await tiles.nth(1).boundingBox();
  if (!box) throw new Error('her tile has no size on the page');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(500);
  await ui.shot('addressed');
  await page.getByRole('toolbar', { name: LABELS.callControls }).getByRole('button', { name: LABELS.callEnd }).click();
  await ui.composer.waitFor({ state: 'visible', timeout: T.ui });
  await main.getByText(LABELS.meetingLine).first().waitFor({ state: 'visible', timeout: T.ui });
  await ui.shot('meeting-ended');
  return `picker opened, two people chosen, two tiles on the stage, ended; the chat shows the meeting line`;
}

async function s14(ui: Ui, st: State): Promise<{ text: string; askBox: string }> {
  const { main, nav } = ui;
  await nav.getByRole('button', { name: LABELS.teamButton, exact: true }).click();
  const table = main.getByRole('table');
  await table.waitFor({ state: 'visible', timeout: T.ui });
  await ui.shot('team');
  const api_ = (await api<TeamLite>(st.base, '/api/team?range=today')).data;
  const seen: string[] = [];
  let tasks = 0;
  let cost = 0;
  for (const person of [st.maya, st.priya]) {
    const row = table.getByRole('row').filter({ hasText: person });
    if ((await row.count()) !== 1) throw new Error(`the table has no row for ${person}`);
    const cells = await row.getByRole('cell').allInnerTexts();
    const t = Number(cells[2]);
    const c = Number((cells[3] ?? '').replace(/[^0-9.]/g, ''));
    const theirs = api_.rows.find((r) => r.name.startsWith(person));
    if (!theirs) throw new Error(`the office's team report has no row for ${person}`);
    if (t !== theirs.tasksDone) throw new Error(`${person}: the table says ${t} tasks, the office says ${theirs.tasksDone}`);
    if (Math.abs(c - theirs.costUsd) > 0.005) throw new Error(`${person}: the table says $${c}, the office says $${theirs.costUsd.toFixed(2)}`);
    tasks += t;
    cost += c;
    seen.push(`${person} ${t} done $${c.toFixed(2)}`);
  }
  if (tasks < 1 || cost <= 0) throw new Error(`the numbers are all zero after the tasks (${seen.join(', ')})`);
  // the Ask box: only with Databricks (ruling R15), so with no Databricks it is absent or disabled, never usable
  const ask = main.getByRole('textbox', { name: LABELS.askBox });
  const askCount = await ask.count();
  let askBox = 'absent (R15: shown only with Databricks)';
  if (askCount > 0) {
    if (!(await ask.first().isDisabled())) throw new Error('the Ask box is usable although no Databricks is configured');
    askBox = 'disabled';
  }
  return { text: `table matches the office (${seen.join('; ')}), figures not zero`, askBox };
}

async function s9remove(ui: Ui, st: State): Promise<string> {
  const { main } = ui;
  for (const person of [st.maya, st.priya]) {
    await ui.openEmployee(person);
    await ui.more(LABELS.removeItem);
    await ui.page.getByRole('alertdialog').getByRole('button', { name: LABELS.removeConfirm }).click();
    await ui.row(person).waitFor({ state: 'hidden', timeout: T.ui });
    const left = (await api<EmployeeLite[]>(st.base, '/api/employees')).data.filter((e) => e.persona.firstName === person);
    if (left.length) throw new Error(`the office still lists ${person}`);
    await ui.shot(`removed-${person.toLowerCase()}`);
  }
  await main.getByRole('heading', { name: LABELS.firstRunTitle }).waitFor({ state: 'visible', timeout: T.ui });
  await ui.shot('empty-again');
  return 'both removed through the menu and the confirm; rows gone, office agrees, empty state back';
}

async function s17(ui: Ui, st: State, askNote: string, office: OfficeProc, startOffice: () => Promise<void>): Promise<string> {
  const { page, main, nav } = ui;
  // a second office, started without LiveKit and Databricks settings (and a key the model rejects: nothing can spend)
  await office.stop();
  office.clean();
  await startOffice();
  const c = new Client(office.base);
  const names: string[] = [];
  for (const role of ['web_developer', 'marketer']) names.push((await c.hire(role)).persona.firstName);
  await ui.load(webUrl);
  await ui.openEmployee(names[0]!);
  const caps = (await api<{ capabilities: Record<string, unknown> }>(office.base, '/api/health')).data.capabilities;
  if (caps.calls !== 'off') throw new Error(`the no-keys office reports calls "${String(caps.calls)}", expected off`);
  await ui.shot('no-keys');
  const problems: string[] = [];
  const call = main.getByRole('button', { name: LABELS.callButton });
  if (!(await call.isDisabled())) problems.push('Call is enabled');
  await call.hover({ force: true });
  const tip = await page.getByRole('tooltip').first().innerText({ timeout: 3000 }).catch(() => '');
  if (!LABELS.callsOffReason.test(tip)) problems.push(`Call has no reason (tooltip: "${tip}")`);
  await ui.shot('call-disabled');
  await page.mouse.move(5, 5);
  const summon = main.getByRole('button', { name: LABELS.summonButton });
  const summonDisabled = await summon.isDisabled();
  await summon.hover({ force: true });
  const tip2 = await page.getByRole('tooltip').first().innerText({ timeout: 3000 }).catch(() => '');
  if (!summonDisabled) problems.push('Summon meeting is enabled although calls are off (I-10)');
  else if (!LABELS.meetingReason.test(tip2)) problems.push(`Summon meeting has no reason (tooltip: "${tip2}")`);
  await ui.shot('summon');
  await page.mouse.move(5, 5);
  // the Ask box in the team view: absent or disabled
  await nav.getByRole('button', { name: LABELS.teamButton, exact: true }).click();
  await main.getByText(LABELS.noWork).waitFor({ state: 'visible', timeout: T.ui });
  const ask = main.getByRole('textbox', { name: LABELS.askBox });
  if ((await ask.count()) > 0 && !(await ask.first().isDisabled())) problems.push('the Ask box is usable');
  await ui.shot('team-no-keys');
  if (problems.length) throw new Error(problems.join('; '));
  return `calls off: Call disabled with "${tip.replace(/\s+/g, ' ')}", Summon meeting disabled with "${tip2.replace(/\s+/g, ' ')}"; Ask box ${askNote}; no console errors`;
}

// ---------- main ----------

let webUrl = '';

function killOwn(): void {
  for (const p of [PORT, WEB_PORT]) {
    try {
      const pids = execFileSync('lsof', ['-ti', `:${p}`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const pid of pids) process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* nothing there */
    }
  }
}

async function main(): Promise<number> {
  if (portInUse(PORT) || portInUse(WEB_PORT)) {
    console.log(`FAIL setup - port ${PORT} or ${WEB_PORT} is already in use (a leftover run? stop it with: lsof -ti:${PORT} | xargs kill)`);
    return 1;
  }
  freshDir(OUT);

  // the office
  let run: Run | null = null;
  let office: OfficeProc;
  const mockEnv = { MOCK_LLM: '1', MOCK_SPEED: SPEED, MAX_TEAM: '4', DATABRICKS_SYNC: 'off', MOCK_GENIE: '0', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' };
  if (REAL) {
    run = new Run({ port: PORT, data: DATA, model: MODEL, budget: BUDGET, keep: KEEP });
    office = run.office;
    await run.boot();
  } else {
    office = new OfficeProc({ port: PORT, data: DATA, desktops: 'mock', model: MODEL, attach: false }, mockEnv);
    office.clean();
    await office.start();
  }
  const base = office.base;
  const web: Web = await startWeb(WEB_PORT, base);
  webUrl = web.url;
  console.log(`office ${base} (${REAL ? 'real desktops, model ' + MODEL : 'mock, speed ' + SPEED}), web ${web.url}, data ${DATA}`);

  let browser: Browser | null = null;
  let exit = 0;
  const st: State = { base, maya: '', mayaId: '', priya: '', priyaId: '' };
  try {
    browser = await chromium.launch({ headless: !HEADED });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    const page = await context.newPage();
    page.setDefaultTimeout(T.ui);
    const ui = new Ui(page, () => office.logs);

    const first = await runScenario(ui, 'S1', 'First run, hire through the dialog, her first message', () => s1(ui, st));
    if (!first) {
      for (const [id, name] of [['S2', 'Task: plan, activity, done'], ['S3', 'Steer'], ['S4', 'Approval'], ['S9', 'Desktop, profile, pause'], ['S12', 'Call'], ['S13', 'Summon'], ['S14', 'Team'], ['S17', 'No keys']]) {
        record({ id: id!, name: name!, ok: false, secs: 0, evidence: 'not run: S1 failed' });
      }
    } else {
      const ok2 = await runScenario(ui, 'S2', 'Task: plan appears and ticks, activity lines, done bubble', () => s2(ui, st));
      if (!REAL) {
        if (!ok2) for (const id of ['S3', 'S4']) if (!results.some((r) => r.id === id)) record({ id, name: 'part of the S2 task', ok: false, secs: 0, evidence: 'not run: S2 stopped earlier' });
        const denyOk = await runScenario(ui, 'S4b', 'Deny stops her (Priya, Asks first)', () => s4Deny(ui, st));
        void denyOk;
        const mayaOk = Boolean(st.maya);
        let askNote = 'absent';
        if (mayaOk) {
          await runScenario(ui, 'S9', 'Desktop picture, profile level, pause and resume', () => s9(ui, st));
          await runScenario(ui, 'S12', 'Call: stage, controls, end', () => s12(ui, st));
          await runScenario(ui, 'S13', 'Summon meeting: pick two, two tiles, end', () => s13(ui, st));
          await runScenario(ui, 'S14', 'Team view: numbers match, not all zero', async () => {
            const r = await s14(ui, st);
            askNote = r.askBox;
            return r.text;
          });
          await runScenario(ui, 'S9b', 'Remove the employees', () => s9remove(ui, st));
        }
        await runScenario(ui, 'S17', 'No keys: Call, Summon and Ask are off with reasons', () =>
          s17(ui, st, askNote, office, async () => {
            // MOCK_LLM off with a key the model rejects: a no-keys office, and nothing can spend
            const env = { MOCK_LLM: '0', DATABRICKS_SYNC: 'off', MOCK_GENIE: '0', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', DATABRICKS_HOST: '', DATABRICKS_TOKEN: '', DATABRICKS_GENIE_SPACE_ID: '', ANTHROPIC_API_KEY: 'sk-ant-e2e-ui-not-a-real-key', MAX_TEAM: '4' };
            Object.assign(office.extraEnv, env);
            await office.start();
          }),
        );
      }
    }
  } finally {
    await browser?.close().catch(() => {});
    await web.close().catch(() => {});
    if (REAL && run) {
      // the UI hired her: tell the run so that its cleanup removes her and her desktop
      try {
        const left = (await api<EmployeeLite[]>(base, '/api/employees')).data;
        for (const e of left) run.hired.set(e.id, { id: e.id, firstName: e.persona.firstName, roleKey: '' });
      } catch {
        /* office may be down: cleanup handles it */
      }
      const cost = await run.refreshCost().catch(() => 0);
      const c = await run.cleanup();
      console.log(`real run: cost $${cost.toFixed(4)} of $${BUDGET}; leftover Spaces: ${c.left.length ? c.left.join(', ') : 'none'}; port ${PORT} ${c.port ? 'STILL IN USE' : 'free'}`);
      if (cost > BUDGET || c.left.length) exit = 1;
    } else if (!KEEP) {
      await office.stop();
      const stray = employeeProcs(office.dataDir);
      for (const p of stray) {
        try {
          process.kill(p.pid, 'SIGTERM');
        } catch {
          /* gone */
        }
      }
      if (stray.length) console.log(`stopped ${stray.length} employee process(es) left by the no-keys office`);
      killOwn();
    }
  }

  // table
  const order = ['S1', 'S2', 'S3', 'S4', 'S4b', 'S9', 'S9b', 'S12', 'S13', 'S14', 'S17'];
  const sorted = [...results].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  console.log('\nscenario  result  secs   evidence');
  for (const r of sorted) console.log(`${r.id.padEnd(9)} ${(r.ok ? 'PASS' : 'FAIL').padEnd(7)} ${String(r.secs).padEnd(6)} ${r.evidence}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 && exit === 0 ? 'PASS' : 'FAIL'} ui: ${results.length - failed} of ${results.length} scenarios passed (${REAL ? 'real' : 'mock'}); evidence in shots/e2e-ui/`);
  return failed === 0 && exit === 0 ? 0 : 1;
}

process.on('SIGINT', () => {
  killOwn();
  process.exit(130);
});

main().then(
  (code) => process.exit(code),
  (e) => {
    console.log(`FAIL ui: ${e instanceof Error ? e.stack : e}`);
    killOwn();
    process.exit(1);
  },
);
