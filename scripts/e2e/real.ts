// Layer 3 end-to-end test: scenarios S1 to S10 of docs/hackathon/spec/test-plan.md against a real office on real
// Cua desktops with the real model, over HTTP and the WebSocket. No UI.
//   npx tsx scripts/e2e/real.ts [--only S2,S3] [--keep] [--model claude-haiku-5-5] [--budget 3] [--repeat 1] [--port 4330] [--data data-w10]
// Starts its own office (DESKTOPS=cua, DATABRICKS_SYNC=off, MAX_TEAM=4) on a clean data folder, runs the scenarios one at a
// time, prints PASS or FAIL with one line of evidence and the cost so far, saves evidence under shots/e2e/<scenario>/,
// removes every employee it hired (which deletes their Spaces), stops office and exits non-zero if anything failed.
// S2 and S3 are one driver (S3 steers S2 while it runs), so --only S3 runs both and reports S3 only.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Approval, Employee, Message, ServerEvent } from '../../src/shared/index.ts';
import {
  BudgetExceeded, Run, ROOT, badSentence, employeeProcs, empMessages, flag, hasFlag, hasKey, headingColors, isBlueish, money,
  overlap, parseOptions, portInUse, sdkSpaceIds, sleep, stateEvents, stepsOf, stripHtml, taglineCandidates,
} from './lib/harness.ts';

const opts = parseOptions();
const only = flag('only')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const repeat = Number(flag('repeat') ?? 1);

if (!hasKey()) {
  console.log('SKIP real: no ANTHROPIC_API_KEY in .env.local, so nothing was run (exit code 3, not a pass)');
  process.exit(3);
}

// ---------- scenario context ----------

interface Check {
  ok: boolean;
  label: string;
  evidence: string;
}

class Ctx {
  readonly t0 = Date.now();
  readonly mark: number;
  aborted = false;
  checks: Check[] = [];
  facts: string[] = [];
  files: string[] = [];
  focus = new Set<string>();
  constructor(readonly R: Run, readonly id: string, public timeoutMs: number) {
    this.mark = R.c.mark();
  }
  get c() {
    return this.R.c;
  }
  remaining(): number {
    return this.t0 + this.timeoutMs - Date.now();
  }
  guard(): void {
    if (this.R.budgetHit) throw new BudgetExceeded(`budget of ${money(this.R.opts.budget)} passed (${money(this.R.lastCost)})`);
    if (this.aborted) throw new Error('scenario timed out');
    if (this.remaining() <= 0) throw new Error(`scenario timed out after ${Math.round(this.timeoutMs / 1000)}s`);
  }
  check(ok: unknown, label: string, evidence = ''): boolean {
    this.checks.push({ ok: !!ok, label, evidence });
    return !!ok;
  }
  fact(s: string): void {
    this.facts.push(s);
  }
  /** Walks the event log from `from`, calling `handler` on each event; resolves with the first event it accepts. */
  async scan(what: string, from: number, handler: (e: ServerEvent) => boolean | Promise<boolean>, timeoutMs = 120_000): Promise<ServerEvent> {
    const start = Date.now();
    let i = from;
    for (;;) {
      this.guard();
      while (i < this.c.log.length) {
        const e = this.c.log[i++].e;
        if (await handler(e)) return e;
      }
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`);
      await sleep(50);
    }
  }
  async until<T>(what: string, fn: () => Promise<T | undefined | false | null>, timeoutMs = 60_000, pollMs = 500): Promise<T> {
    const start = Date.now();
    for (;;) {
      this.guard();
      const v = await fn();
      if (v) return v;
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`);
      await sleep(pollMs);
    }
  }
}

const isEmpMsg = (id: string, kind?: Message['kind']) => (e: ServerEvent): e is Extract<ServerEvent, { type: 'message' }> =>
  e.type === 'message' && e.message.employeeId === id && e.message.from === 'employee' && (kind === undefined || e.message.kind === kind);

type End = 'done' | 'idle' | 'stuck' | 'needs_you';

/**
 * Waits for the employee's work to end: a `done` bubble, or idle after she worked, or stuck. Optionally handles each
 * approval that appears (the handler decides and records); returns how it ended.
 */
async function drive(ctx: Ctx, id: string, from: number, onApproval: ((a: Approval) => Promise<void>) | null, timeoutMs: number, ignoreQuestions = false): Promise<End> {
  let worked = false;
  let end: End = 'idle';
  const handled = new Set<string>();
  await ctx.scan('the work to end', from, async (e) => {
    if (e.type === 'approval' && e.approval.employeeId === id && e.approval.status === 'pending' && !handled.has(e.approval.id)) {
      handled.add(e.approval.id);
      if (onApproval) await onApproval(e.approval);
      else end = 'needs_you';
      return !onApproval;
    }
    if (e.type === 'message' && e.message.employeeId === id && e.message.from === 'employee' && e.message.kind === 'question' && !ignoreQuestions) {
      end = 'needs_you';
      return true;
    }
    if (e.type === 'message' && e.message.employeeId === id && e.message.from === 'employee' && e.message.kind === 'done') {
      end = 'done';
      return true;
    }
    if (e.type === 'employee' && e.employee.id === id) {
      if (e.employee.state === 'working') worked = true;
      if (e.employee.state === 'stuck') {
        end = 'stuck';
        return true;
      }
      if (e.employee.state === 'idle' && worked) {
        // office can emit idle and, in the same millisecond, stuck: look again before calling it idle
        await sleep(1000);
        end = (await ctx.c.employee(id)).state === 'stuck' ? 'stuck' : 'idle';
        return true;
      }
    }
    return false;
  }, timeoutMs);
  return end;
}

/** Wait until the employee is idle (or give up quietly after `ms`). */
async function settle(ctx: Ctx, id: string, ms = 90_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const e = await ctx.c.employee(id);
    if (e.state === 'idle' || e.state === 'stuck' || e.state === 'offline') return e.state;
    if (Date.now() - start > ms) return e.state;
    await sleep(1000);
  }
}

// ---------- shared employees ----------

const R = new Run(opts);
let maya: Employee | null = null;
let priya: Employee | null = null;
let jonas: Employee | null = null;

async function getMaya(ctx: Ctx): Promise<Employee> {
  if (!maya) {
    maya = await R.hire('web_developer');
    await R.waitReady(maya.id);
    await sleep(3000);
  }
  ctx.focus.add(maya.id);
  return maya;
}
async function getPriya(ctx: Ctx, level: 'asks_first' | 'asks_big_steps' | 'independent' = 'asks_big_steps'): Promise<Employee> {
  if (!priya) {
    priya = await R.hire('marketer', { level });
    await R.waitReady(priya.id);
    await sleep(3000);
  } else if (priya.permissions.level !== level) {
    priya = await ctx.c.patch(priya.id, { permissions: { level } });
  }
  ctx.focus.add(priya.id);
  return priya;
}
async function getJonas(ctx: Ctx): Promise<Employee> {
  if (!jonas) {
    jonas = await R.hire('researcher');
    await R.waitReady(jonas.id);
    await sleep(3000);
  }
  ctx.focus.add(jonas.id);
  return jonas;
}

const SITE = '~/work/site';
async function ensureSite(id: string): Promise<void> {
  const r = await R.sh(id, `ls ${SITE}/*.html 2>/dev/null | head -1`);
  if (!r.out) await R.sh(id, `mkdir -p ${SITE} && printf '<!doctype html><html><head><title>Our team</title><style>h1{color:black}</style></head><body><h1>Our team</h1><p>Placeholder page.</p></body></html>' > ${SITE}/index.html`);
}
async function siteText(id: string): Promise<{ html: string; css: string }> {
  const html = (await R.sh(id, `find ${SITE} -type f -name '*.html' -exec cat {} +`)).out;
  const css = (await R.sh(id, `find ${SITE} -type f -name '*.css' -exec cat {} +`)).out;
  return { html, css };
}

// ---------- scenarios ----------

const SITE_TASK = 'Make a one-page site about our team in ~/work/site and show it to me in the browser';

async function s1(ctx: Ctx): Promise<void> {
  const cand = await ctx.c.api<{ token: string; persona: { firstName: string } }>('POST', '/api/candidates', { roleKey: 'web_developer' });
  ctx.check(cand.status === 200 && cand.data.persona.firstName === 'Maya', 'the preset proposes Maya', `HTTP ${cand.status} ${cand.data.persona?.firstName}`);
  const from = ctx.c.mark();
  const t1 = Date.now();
  const h = await ctx.c.api<Employee>('POST', '/api/employees', { token: cand.data.token });
  const hireMs = Date.now() - t1;
  if (h.status !== 200) throw new Error(`hire answered ${h.status} ${JSON.stringify(h.data)}`);
  maya = h.data;
  R.hired.set(maya.id, { id: maya.id, firstName: 'Maya', roleKey: 'web_developer' });
  ctx.focus.add(maya.id);
  ctx.check(hireMs < 1000, 'hire answers within 1 s', `${hireMs} ms`);
  ctx.check(maya.state === 'starting' && maya.stateDetail === 'Starting desktop', 'she appears as "Starting desktop"', `${maya.state} / ${maya.stateDetail}`);
  const up = (await ctx.scan('the desktop to come up', from, (e) => e.type === 'employee' && e.employee.id === maya!.id && e.employee.state === 'idle', 90_000)) as Extract<ServerEvent, { type: 'employee' }>;
  const upMs = Date.now() - t1;
  ctx.check(upMs <= 60_000, 'desktop up within 60 s', `${(upMs / 1000).toFixed(1)} s, ${up.employee.spaceId}`);
  ctx.check(!!up.employee.spaceId?.startsWith('local:emp-') && up.employee.desktopSinceMs, 'the desktop is a real Space', `${up.employee.spaceId}, desktopSinceMs ${up.employee.desktopSinceMs}`);
  if (up.employee.spaceId) R.spaceIds.add(up.employee.spaceId);
  const first = (await ctx.scan('her first message', from, (e) => isEmpMsg(maya!.id)(e), 90_000)) as Extract<ServerEvent, { type: 'message' }>;
  ctx.check(true, 'first message arrives by itself', `after ${((first.message.createdMs - t1) / 1000).toFixed(1)} s: "${first.message.text.slice(0, 80)}"`);
  await sleep(4000); // the panel and dock draw a few seconds after the Space reports ready
  const f = await R.frame(maya.id, 'S1');
  ctx.files.push(f.file);
  const panel = await R.sh(maya.id, 'pgrep -c xfce4-panel; DISPLAY=:1 xdotool getdisplaygeometry');
  ctx.check(f.ok && f.bytes > 15_000, 'frame is a real desktop', `${f.bytes} B, ${panel.out.replace(/\n/g, ' ')}`);
  ctx.files.push(await R.saveThread(maya.id, 'S1', 'thread.json'));
  await settle(ctx, maya.id);
}

async function s2s3(cs: Ctx[]): Promise<void> {
  const [c2, c3] = cs;
  const m = await getMaya(c2);
  c3.focus.add(m.id);
  await settle(c2, m.id);
  const c = c2.c;
  const from = c.mark();
  await c.say(m.id, SITE_TASK);
  // steer as soon as she has started: Haiku can finish this task in well under a minute
  await c2.until('her first step', async () => stepsOf(c, from, m.id).length >= 1 || c.events('message', from).some((x) => x.message.employeeId === m.id && x.message.kind === 'done'), 150_000, 100);
  const firstPlan = c.events('task', from).find((t) => t.task.employeeId === m.id && t.task.plan.length > 0);
  const taskId = c.events('task', from).find((t) => t.task.employeeId === m.id)?.task.id ?? '';
  const alreadyDone = c.events('message', from).some((x) => x.message.employeeId === m.id && x.message.kind === 'done');
  c3.fact(alreadyDone ? 'she was already done when the steer arrived (not mid-task)' : `steered after ${stepsOf(c, from, m.id).length} activity line(s), ${firstPlan ? 'plan already shown' : 'no plan yet'}`);
  const steerMark = c.mark();
  const steer = await c.say(m.id, 'Make the heading blue');
  c3.check(steer.from === 'user' && steer.seenMs === null, 'the steering message is delivered unseen', `seenMs ${steer.seenMs}`);
  const seenEv = await c3.scan('the message to be seen', steerMark, (e) => e.type === 'message_seen' && e.id === steer.id, 240_000).catch(() => null);
  c3.check(seenEv, 'it becomes seen', seenEv ? `after ${(((seenEv as { seenMs: number }).seenMs - steer.createdMs) / 1000).toFixed(1)} s` : 'no message_seen event');

  const end = await drive(c2, m.id, from, null, 420_000);
  c2.check(end === 'done', 'a done message ends the task', `ended as ${end}`);
  await sleep(1500);
  const f = await R.frame(m.id, 'S2');
  c2.files.push(f.file);

  // S2 checks
  const tasks = c.events('task', from).filter((t) => t.task.employeeId === m.id);
  const plans = tasks.map((t) => t.task.plan.map((p) => p.status).join(','));
  const distinct = new Set(plans);
  const sawDone = tasks.some((t) => t.task.plan.some((p) => p.status === 'done'));
  const planned = tasks.filter((t) => t.task.plan.length > 0);
  c2.check(planned.length > 0, 'a plan appears', planned.length ? `${planned[0].task.plan.length} steps: ${planned[0].task.plan.map((x) => x.title).join(' / ').slice(0, 120)}` : 'no task event ever carried a plan (the model never used its checklist)');
  c2.check(distinct.size >= 2 && sawDone, 'the plan progresses', `${distinct.size} distinct plan states; last ${plans[plans.length - 1] ?? 'none'}`);
  const steps = stepsOf(c, from, m.id);
  const bad = steps.map((s) => ({ s: s.sentence, why: badSentence(s.sentence) })).filter((x) => x.why);
  c2.check(steps.length >= 1 && bad.length === 0, 'activity lines read like sentences', bad.length ? `bad: ${bad.map((b) => `"${b.s}" (${b.why})`).join('; ')}` : `${steps.length} lines, e.g. ${steps.slice(0, 3).map((s) => `"${s.sentence}"`).join(', ')}`);
  const listing = (await R.sh(m.id, `ls -R ${SITE} | head -30`)).out;
  const { html, css } = await siteText(m.id);
  c2.check(/\.html/.test(listing) && html.length > 200, 'the site exists in ~/work/site', listing.replace(/\n/g, ' ').slice(0, 100) + ` (${html.length} B html)`);
  const win = await R.windows(m.id);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  const onPage = (title && win.titles.some((t) => t.includes(title))) || /work\/site|file:\/\//.test(win.browserArgs);
  c2.check(onPage, 'the browser ends on the page', `page title "${title}"; windows ${JSON.stringify(win.titles)}; active "${win.active}"; browser args ${win.browserArgs.slice(0, 100) || 'none'}`);
  const th = await c.thread(m.id);
  const done = th.messages.filter((x) => x.from === 'employee' && x.kind === 'done').pop();
  c2.check(done && done.text.length > 10, 'a done bubble summarises it', done ? `"${done.text.slice(0, 100)}"` : 'none');
  const task = await c.taskWhen(m.id, (t) => t.costUsd > 0 && t.status === 'done', 25_000);
  c2.check(task && task.costUsd > 0 && task.activeMs > 0, 'the task has cost and active time', task ? `${money(task.costUsd)}, ${(task.activeMs / 1000).toFixed(0)} s active, ${task.numTurns} turns, status ${task.status}` : 'no task');
  c2.files.push(await R.saveThread(m.id, 'S2', 'thread.json'));

  // S3 checks
  const colors = headingColors(html, css);
  c3.check(colors.length > 0 && isBlueish(colors[0]), 'the final heading is blue', `heading colours (last rule first): ${colors.join(' | ') || 'none found'}`);
  const newTasks = new Set(c.events('task', steerMark).filter((t) => t.task.employeeId === m.id).map((t) => t.task.id));
  if (!alreadyDone) c3.check(newTasks.size <= 1 && (newTasks.size === 0 || newTasks.has(taskId)), 'she carried on in the same task, not from scratch', `task ids after the steer: ${newTasks.size}`);
  const seenThread = th.messages.find((x) => x.id === steer.id);
  c3.check(seenThread?.seenMs, 'the thread shows it seen', `seenMs ${seenThread?.seenMs}`);
  c3.files.push(await R.saveThread(m.id, 'S3', 'thread.json'));
  const f3 = await R.frame(m.id, 'S3');
  c3.files.push(f3.file);
  await settle(c2, m.id);
}

async function s4(ctx: Ctx): Promise<void> {
  const p = await getPriya(ctx, 'asks_first');
  await settle(ctx, p.id);
  const c = ctx.c;
  ctx.check(p.permissions.level === 'asks_first' || (await c.employee(p.id)).permissions.level === 'asks_first', 'Priya is set to asks first', (await c.employee(p.id)).permissions.level);

  // approve
  const from = c.mark();
  await c.say(p.id, 'Please save a file called note.txt in your home folder containing the single line: approved run');
  const seen: Approval[] = [];
  let firstChecked = false;
  const end = await drive(ctx, p.id, from, async (a) => {
    seen.push(a);
    if (!firstChecked) {
      firstChecked = true;
      const e = await c.employee(p.id);
      ctx.check(e.state === 'needs_you', 'an approval makes her "needs you"', `state ${e.state}, "${a.title}" / "${a.detail.slice(0, 80)}"`);
      await sleep(1500);
      const notify = c.events('notify', from).find((n) => n.employeeId === p.id && n.kind === 'approval');
      ctx.check(notify, 'a notify event fires', notify ? `"${notify.title}" / "${notify.body.slice(0, 60)}"` : 'none');
      const f = await R.frame(p.id, 'S4', 'frame.jpg');
      ctx.files.push(f.file);
      const none = (await R.sh(p.id, 'test -e ~/note.txt && echo exists || echo absent')).out;
      ctx.check(none === 'absent', 'nothing was written before the answer', none);
    }
    await c.decide(a.id, 'approve', 'once');
  }, 240_000);
  ctx.check(seen.length > 0, 'an approval row appeared', `${seen.length} approvals`);
  ctx.check(end === 'done' || end === 'idle', 'approving lets her finish', `ended as ${end} after ${seen.length} approvals`);
  const note = (await R.sh(p.id, 'cat ~/note.txt 2>&1')).out;
  ctx.check(/approved run/.test(note), 'note.txt has the text', JSON.stringify(note.slice(0, 60)));
  await settle(ctx, p.id);

  // deny
  const from2 = c.mark();
  await c.say(p.id, 'Now save another file called note2.txt in your home folder containing the single line: denied run');
  const denied: Approval[] = [];
  const end2 = await drive(ctx, p.id, from2, async (a) => {
    denied.push(a);
    await c.decide(a.id, 'deny', 'once', 'No, please do not do that.');
  }, 240_000);
  await sleep(1500);
  const absent = (await R.sh(p.id, 'test -e ~/note2.txt && echo exists || echo absent')).out;
  ctx.check(denied.length > 0, 'the second run asks too', `${denied.length} approvals, all denied`);
  ctx.check(absent === 'absent', 'nothing was written after the denial', absent);
  const final = await c.employee(p.id);
  const msgs = empMessages(c, from2, p.id).filter((m) => m.createdMs >= (c.events('approval', from2).find((x) => x.approval.status === 'denied')?.approval.resolvedMs ?? 0));
  const said = msgs.map((m) => m.text).join(' | ');
  ctx.check(/won'?t|will not|not (go|proceed|continue|do)|stopp|didn'?t|did not|haven'?t|declin|denied|unable|couldn'?t|can'?t|cannot|understood|no problem/i.test(said), 'she stops and says so', `ended ${end2}, state ${final.state}; said "${said.slice(0, 160)}"`);
  ctx.check(denied.length <= 3, 'she does not keep asking', `${denied.length} denied requests`);
  ctx.files.push(await R.saveThread(p.id, 'S4', 'thread.json'));
  ctx.fact(`approved path used ${seen.length} approvals, denied path ${denied.length}`);
}

async function s5(ctx: Ctx): Promise<void> {
  const m = await getMaya(ctx);
  await settle(ctx, m.id);
  const c = ctx.c;
  await ensureSite(m.id);
  await c.patch(m.id, { permissions: { level: 'asks_big_steps' } });
  const setup = await R.sh(m.id, `git config --global user.email test@example.com; git config --global user.name Test; rm -rf ~/remote.git; git init -q --bare ~/remote.git && cd ${SITE} && (git rev-parse --git-dir >/dev/null 2>&1 || git init -q -b main) && git remote remove origin 2>/dev/null; cd ${SITE} && git remote add origin /home/cua/remote.git && git remote -v | head -1`);
  ctx.check(setup.code === 0, 'a local bare repository is set up inside her desktop', setup.out.split('\n').pop() ?? '');
  const count = async () => Number((await R.sh(m.id, 'git --git-dir=/home/cua/remote.git rev-list --all --count 2>/dev/null || echo 0')).out.split('\n').pop());
  const from = c.mark();
  await c.say(m.id, 'publish it with git push');
  const asked: Approval[] = [];
  const others: Approval[] = [];
  let atApproval = -1;
  const end = await drive(ctx, m.id, from, async (a) => {
    if (/push/i.test(`${a.title} ${a.detail}`)) {
      asked.push(a);
      if (asked.length === 1) {
        atApproval = await count();
        const f = await R.frame(m.id, 'S5');
        ctx.files.push(f.file);
        ctx.check((await c.employee(m.id)).state === 'needs_you', 'she waits for the answer ("needs you")', `"${a.title}" / "${a.detail.slice(0, 80)}"`);
      }
      await c.decide(a.id, 'deny', 'once', 'Do not push anything.');
    } else {
      others.push(a);
      await c.decide(a.id, 'approve', 'once');
    }
  }, 270_000).catch((e) => {
    ctx.check(false, 'the work ended', (e as Error).message);
    return 'idle' as End;
  });
  await sleep(1500);
  ctx.check(asked.length > 0, 'an approval for the push was requested', asked.length ? `"${asked[0].title}" / "${asked[0].detail.slice(0, 100)}"` : `none; unexpected approvals: ${others.map((o) => o.title).join(', ') || 'none'}`);
  ctx.check(atApproval === 0, 'nothing was pushed when it asked', `commits in the bare repo at that moment: ${atApproval}`);
  const after = await count();
  ctx.check(after === 0, 'nothing is pushed after the denial', `commits in the bare repo: ${after}`);
  if (others.length) ctx.fact(`other approvals: ${others.map((o) => o.title).join(', ')}`);
  const said = empMessages(c, from, m.id).map((x) => x.text).join(' | ');
  ctx.check(said.length > 0, 'she tells me what happened', `ended ${end}: "${said.slice(-160)}"`);
  ctx.files.push(await R.saveThread(m.id, 'S5', 'thread.json'));
  await c.patch(m.id, { permissions: { level: 'independent' } });
  await settle(ctx, m.id);
}

async function s6(ctx: Ctx): Promise<void> {
  const p = await getPriya(ctx, 'asks_big_steps');
  await settle(ctx, p.id);
  const c = ctx.c;
  const from = c.mark();
  const sent = await c.say(p.id, 'Write a tagline for us');
  void sent;
  const first = (await ctx.scan('a question or an answer', from, (e) => isEmpMsg(p.id)(e) && ['question', 'text', 'done'].includes((e as { message: Message }).message.kind), 200_000)) as Extract<ServerEvent, { type: 'message' }>;
  if (first.message.kind === 'question') {
    ctx.fact('asked a question');
    await sleep(800);
    const e = await c.employee(p.id);
    ctx.check(e.state === 'needs_you', 'the question puts her in "needs you"', `state ${e.state}, "${e.stateDetail}"`);
    const list = (await c.api<Employee[]>('GET', '/api/employees')).data;
    ctx.check(list[0]?.id === p.id, 'she sorts to the top', list.map((x) => `${x.persona.firstName}:${x.state}`).join(', '));
    const f = await R.frame(p.id, 'S6');
    ctx.files.push(f.file);
    const qCount = empMessages(c, from, p.id, 'question').length;
    ctx.check(qCount === 1, 'one clear question', `"${first.message.text.slice(0, 140)}" (${qCount} questions)`);
    const mark = c.mark();
    await c.say(p.id, 'We are a small design studio in London. Friendly and a little witty.');
    const end = await drive(ctx, p.id, mark, async (a) => void (await c.decide(a.id, 'approve', 'once')), 200_000);
    const after = empMessages(c, mark, p.id).filter((m) => m.kind !== 'question');
    ctx.check(after.length > 0 && end !== 'stuck', 'a reply resumes her', `ended ${end}: "${(after.pop()?.text ?? '').slice(0, 140)}"`);
  } else {
    ctx.fact('made a choice and said so');
    await drive(ctx, p.id, from, async (a) => void (await c.decide(a.id, 'approve', 'once')), 120_000).catch(() => 'idle');
    const f = await R.frame(p.id, 'S6');
    ctx.files.push(f.file);
    const txt = empMessages(c, from, p.id).map((m) => m.text).join(' | ');
    ctx.check(txt.length > 15, 'she makes a sensible choice and says so', `"${txt.slice(0, 200)}"`);
    ctx.check((await c.employee(p.id)).state !== 'stuck', 'she is not stuck', (await c.employee(p.id)).state);
  }
  ctx.files.push(await R.saveThread(p.id, 'S6', 'thread.json'));
  await settle(ctx, p.id);
}

async function s7(ctx: Ctx): Promise<void> {
  const m = await getMaya(ctx);
  const p = await getPriya(ctx, 'asks_big_steps');
  await settle(ctx, m.id);
  await settle(ctx, p.id);
  const c = ctx.c;
  await ensureSite(m.id);
  const from = c.mark();
  await c.say(m.id, 'get a tagline from Priya and put it on the page');
  const end = await drive(ctx, m.id, from, async (a) => void (await c.decide(a.id, 'approve', 'once')), 270_000);
  await settle(ctx, p.id, 60_000);
  const mt = await c.thread(m.id);
  const pt = await c.thread(p.id);
  const mPeer = mt.steps.filter((s) => s.peer && s.peer.employeeId === p.id && s.startedMs >= (c.log[from]?.at ?? 0) - 1);
  const pPeer = pt.steps.filter((s) => s.peer && s.peer.employeeId === m.id && s.startedMs >= (c.log[from]?.at ?? 0) - 1);
  const dir = (arr: typeof mPeer, d: 'to' | 'from') => arr.filter((s) => s.peer?.direction === d);
  ctx.check(dir(mPeer, 'to').length >= 1 && dir(mPeer, 'from').length >= 1, 'Maya\'s thread shows the exchange with Priya', `${dir(mPeer, 'to').length} to, ${dir(mPeer, 'from').length} from; "${mPeer.map((s) => `${s.peer!.direction}: ${s.peer!.text.slice(0, 60)}`).join('" / "')}"`);
  ctx.check(dir(pPeer, 'from').length >= 1 && dir(pPeer, 'to').length >= 1, 'Priya\'s thread shows it too', `${dir(pPeer, 'from').length} from, ${dir(pPeer, 'to').length} to; "${pPeer.map((s) => `${s.peer!.direction}: ${s.peer!.text.slice(0, 60)}`).join('" / "')}"`);
  const reply = dir(mPeer, 'from').pop()?.peer?.text ?? '';
  const { html } = await siteText(m.id);
  const page = stripHtml(html);
  const cands = taglineCandidates(reply);
  const best = cands.map((t) => ({ t, o: overlap(t, page) })).sort((a, b) => b.o - a.o)[0];
  ctx.check(best && best.o >= 0.8, 'the page shows the tagline', best ? `"${best.t.slice(0, 80)}" overlap ${(best.o * 100).toFixed(0)}%` : `no tagline found in Priya's reply "${reply.slice(0, 80)}"`);
  const before = mPeer.length + pPeer.length;
  await sleep(20_000);
  const mt2 = await c.thread(m.id);
  const pt2 = await c.thread(p.id);
  const count2 = mt2.steps.filter((s) => s.peer).length + pt2.steps.filter((s) => s.peer).length;
  const countNow = mt2.steps.filter((s) => s.peer && s.startedMs >= (c.log[from]?.at ?? 0) - 1).length + pt2.steps.filter((s) => s.peer && s.startedMs >= (c.log[from]?.at ?? 0) - 1).length;
  ctx.check(before <= 8 && countNow === before, 'no loop', `${before} peer lines, ${countNow} 20 s later (${count2} in both threads in total); Maya ended ${end}`);
  const f = await R.frame(m.id, 'S7');
  ctx.files.push(f.file);
  ctx.files.push(await R.saveThread(m.id, 'S7', 'thread-maya.json'), await R.saveThread(p.id, 'S7', 'thread-priya.json'));
}

async function s8(ctx: Ctx): Promise<void> {
  const j = await getJonas(ctx);
  await settle(ctx, j.id);
  const c = ctx.c;
  const from = c.mark();
  await c.say(j.id, 'Open https://portal.acme-internal-xyz.invalid/login in the browser, log in with username demo and password demo, and tell me what the dashboard shows.');
  const end = await drive(ctx, j.id, from, async (a) => void (await c.decide(a.id, 'approve', 'once')), 280_000);
  ctx.check(end === 'stuck', 'he reports stuck', `ended as ${end}`);
  if (end === 'stuck') {
    const e = await c.employee(j.id);
    ctx.check(e.state === 'stuck' && e.stateDetail.length > 3, 'the banner state has a reason', `state ${e.state}, "${e.stateDetail}"`);
    await sleep(800);
    const msgs = empMessages(c, from, j.id);
    const stuckMsg = msgs.pop();
    ctx.check(stuckMsg && stuckMsg.text.length > 40, 'he says what he tried', `"${(stuckMsg?.text ?? '').slice(0, 200)}"`);
    const steps = stepsOf(c, from, j.id);
    ctx.check(steps.length >= 1, 'with activity lines of his attempts', steps.map((s) => s.sentence).join(' | ').slice(0, 160));
    const notify = c.events('notify', from).find((n) => n.employeeId === j.id && n.kind === 'stuck');
    ctx.check(notify, 'a stuck notification fires', notify ? `"${notify.body.slice(0, 80)}"` : 'none');
    const f = await R.frame(j.id, 'S8');
    ctx.files.push(f.file);
    const mark = c.mark();
    const r = await c.api<Employee>('POST', `/api/employees/${j.id}/resume`);
    ctx.check(r.status === 200 && r.data.state !== 'stuck', '"Try again" clears stuck', `HTTP ${r.status}, state ${r.data?.state}`);
    const states = await ctx.until('working or idle after Try again', async () => stateEvents(c, mark, j.id).find((s) => s === 'working' || s === 'idle'), 30_000, 300).catch(() => null);
    ctx.check(states, 'he goes back to working or idle', `states after: ${stateEvents(c, mark, j.id).join(' > ')}`);
  } else {
    const msgs = empMessages(c, from, j.id).map((m) => m.text).join(' | ');
    ctx.fact(`did not call report_stuck: "${msgs.slice(0, 160)}"`);
  }
  ctx.files.push(await R.saveThread(j.id, 'S8', 'thread.json'));
}

async function s9(ctx: Ctx): Promise<void> {
  const j = await getJonas(ctx);
  const c = ctx.c;
  const id = j.id;
  const st = async () => (await c.employee(id)).state;
  const pollState = (want: (s: string) => boolean, ms = 20_000) => ctx.until('a state', async () => { const s = await st(); return want(s) ? s : false; }, ms, 400).catch(() => st());
  // start from calm: resume if paused, then pause
  let r = await c.api<Employee>('POST', `/api/employees/${id}/pause`);
  ctx.check(r.status === 200, 'pause answers', `HTTP ${r.status}`);
  const paused = await pollState((s) => s === 'paused');
  const e1 = await c.employee(id);
  ctx.check(paused === 'paused' && /paused/i.test(e1.stateDetail), 'pause: state paused', `${paused} / "${e1.stateDetail}"`);
  r = await c.api<Employee>('POST', `/api/employees/${id}/resume`);
  const resumed = await pollState((s) => s !== 'paused');
  ctx.check(resumed !== 'paused', 'resume: no longer paused', `${resumed}`);
  r = await c.api<Employee>('POST', `/api/employees/${id}/pause`);
  await pollState((s) => s === 'paused');
  // desktop restart keeps a file
  await R.sh(id, 'echo keep > ~/s9_keep.txt');
  const before = (await c.employee(id)).desktopSinceMs ?? 0;
  const t0 = Date.now();
  r = await c.api<Employee>('POST', `/api/employees/${id}/desktop/restart`);
  ctx.check(r.status === 200, 'restart desktop answers', `HTTP ${r.status}, state ${r.data?.state}`);
  await ctx.until('the desktop back', async () => (await R.spaces.healthy(id)) && ((await c.employee(id)).desktopSinceMs ?? 0) > before, 120_000, 1500);
  const kept = (await R.sh(id, 'cat ~/s9_keep.txt 2>&1')).out;
  ctx.check(kept === 'keep', 'restart keeps a file', `${((Date.now() - t0) / 1000).toFixed(0)} s, file says "${kept}"`);
  const f = await R.frame(id, 'S9');
  ctx.files.push(f.file);
  // reset erases it
  const before2 = (await c.employee(id)).desktopSinceMs ?? 0;
  r = await c.api<Employee>('POST', `/api/employees/${id}/desktop/reset`);
  ctx.check(r.status === 200, 'reset desktop answers', `HTTP ${r.status}`);
  await ctx.until('the fresh desktop', async () => { if (((await c.employee(id)).desktopSinceMs ?? 0) <= before2) return false; R.freshSpaces(); return R.spaces.healthy(id); }, 150_000, 1500);
  const gone = (await R.sh(id, 'test -e ~/s9_keep.txt && echo exists || echo erased')).out;
  ctx.check(gone === 'erased', 'reset erases it', gone);
  // remove deletes the Space
  const now = await c.employee(id);
  const spaceId = now.spaceId ?? `local:emp-${id.replace(/^emp_/, '').toLowerCase()}`;
  const dir = path.join(R.office.dataDir, 'employees', id);
  const procsBefore = employeeProcs(R.office.dataDir).filter((p) => p.employeeId === id).length;
  await R.remove(id);
  jonas = null;
  await sleep(1500);
  const get = await c.api('GET', `/api/employees/${id}`);
  const ids = await sdkSpaceIds();
  const procsAfter = employeeProcs(R.office.dataDir).filter((p) => p.employeeId === id);
  const dirGone = await import('node:fs').then((fs) => !fs.existsSync(dir));
  ctx.check(get.status === 404, 'remove: the employee is gone', `HTTP ${get.status}`);
  ctx.check(!ids.includes(spaceId), 'remove: the Space is deleted (SDK list)', `${spaceId} ${ids.includes(spaceId) ? 'still listed' : 'not listed'}`);
  ctx.check(procsAfter.length === 0 && dirGone, 'no orphan process or folder', `claude processes for her: ${procsBefore} before, ${procsAfter.length} after; folder ${dirGone ? 'gone' : 'still there'}`);
}

async function s10(ctx: Ctx): Promise<void> {
  const m = await getMaya(ctx);
  const p = await getPriya(ctx, 'asks_big_steps');
  await settle(ctx, m.id);
  await settle(ctx, p.id);
  const c = ctx.c;
  await c.patch(m.id, { permissions: { level: 'independent' } });
  const before = (await c.api<Employee[]>('GET', '/api/employees')).data;
  const spaceBefore = new Map(before.map((e) => [e.id, e.spaceId]));
  const from = c.mark();
  await c.say(m.id, 'Run `sleep 45` in the shell, then write the single word resumed into ~/work/s10.txt, then tell me you are done.');
  await ctx.until('the sleep command to run in her desktop', async () => (await R.sh(m.id, "pgrep -f '[s]leep 45' >/dev/null && echo yes || echo no")).out === 'yes', 120_000, 1000);
  await sleep(3000);
  const midState = (await c.employee(m.id)).state;
  ctx.check(midState === 'working', 'Maya is mid-task when the office dies', `state ${midState}`);
  const f0 = await R.frame(m.id, 'S10', 'frame-before.jpg');
  ctx.files.push(f0.file);
  R.office.kill();
  await sleep(1500);
  ctx.check(!portInUse(R.opts.port), 'office is killed (SIGKILL)', `port ${R.opts.port} free`);
  const t0 = Date.now();
  await R.restartOffice();
  const back = Date.now() - t0;
  const mark = c.mark();
  const list = (await c.api<Employee[]>('GET', '/api/employees')).data;
  ctx.check(list.length === before.length, 'everyone returns', `${list.length} of ${before.length} employees; office up after ${(back / 1000).toFixed(1)} s`);
  const same = list.every((e) => spaceBefore.get(e.id) === e.spaceId);
  ctx.check(same, 'on the same desktops (no new Space)', list.map((e) => `${e.persona.firstName}:${e.spaceId?.slice(-6)}`).join(', '));
  const pr = list.find((e) => e.id === p.id);
  const prLater = await ctx.until('Priya idle', async () => { const e = await c.employee(p.id); return e.state === 'idle' ? e : false; }, 90_000, 1000).catch(() => c.employee(p.id));
  ctx.check(pr && prLater.state === 'idle', 'Priya returns idle', `right after: ${pr?.state}, later: ${prLater.state}`);
  const end = await drive(ctx, m.id, mark, async (a) => void (await c.decide(a.id, 'approve', 'once')), 240_000, true).catch((e) => `${(e as Error).message}` as string);
  const file = (await R.sh(m.id, 'cat ~/work/s10.txt 2>&1')).out;
  const mayaNow = await c.employee(m.id);
  ctx.check(/resumed/.test(file), 'the task finishes after the restart', `ended ${end}; s10.txt "${file.slice(0, 40)}"; state ${mayaNow.state}`);
  const procs = employeeProcs(R.office.dataDir);
  const mine = new Set(before.map((e) => e.id));
  const dupes = procs.filter((x) => !mine.has(x.employeeId));
  ctx.check(procs.length <= before.length && dupes.length === 0, 'no orphan runtime processes', `${procs.length} claude processes: ${procs.map((x) => `${x.employeeId.slice(-4)}:${x.rssMb}MB`).join(', ')}`);
  const spaces = (await sdkSpaceIds()).filter((s) => [...spaceBefore.values()].includes(s));
  ctx.check(spaces.length === before.length, 'no extra or missing Spaces', `${spaces.length} of ${before.length} listed`);
  const f = await R.frame(m.id, 'S10', 'frame.jpg');
  ctx.files.push(f.file);
  ctx.files.push(await R.saveThread(m.id, 'S10', 'thread.json'));
}

// ---------- runner ----------

interface Def {
  ids: string[];
  name: string[];
  timeoutMs: number;
  fn: (cs: Ctx[]) => Promise<void>;
}

const defs: Def[] = [
  { ids: ['S1'], name: ['Hire Maya from the preset'], timeoutMs: 300_000, fn: ([c]) => s1(c) },
  { ids: ['S2', 'S3'], name: ['A real build task', 'Steer mid-task'], timeoutMs: 480_000, fn: s2s3 },
  { ids: ['S4'], name: ['Approval: approve, then deny'], timeoutMs: 420_000, fn: ([c]) => s4(c) },
  { ids: ['S5'], name: ['Big step: git push asks first'], timeoutMs: 300_000, fn: ([c]) => s5(c) },
  { ids: ['S6'], name: ['A question with no context'], timeoutMs: 300_000, fn: ([c]) => s6(c) },
  { ids: ['S7'], name: ['Teammates: a tagline from Priya'], timeoutMs: 300_000, fn: ([c]) => s7(c) },
  { ids: ['S8'], name: ['Stuck and Try again'], timeoutMs: 300_000, fn: ([c]) => s8(c) },
  { ids: ['S9'], name: ['Pause, restart, reset, remove'], timeoutMs: 420_000, fn: ([c]) => s9(c) },
  { ids: ['S10'], name: ['SIGKILL office mid-task'], timeoutMs: 360_000, fn: ([c]) => s10(c) },
];

interface Result {
  id: string;
  name: string;
  ok: boolean;
  skipped?: string;
  secs: number;
  cost: number;
  evidence: string;
  failures: string[];
  files: string[];
}
const results: Result[] = [];
let aborted: string | null = null;

async function failureBundle(ctx: Ctx): Promise<string[]> {
  const files: string[] = [];
  try {
    files.push(R.saveEvents(ctx.id, ctx.mark, 20, 'fail-last-events.json'));
    files.push(R.saveOfficeLog(ctx.id, 120, 'fail-office-log.txt'));
    for (const id of ctx.focus) {
      const name = R.hired.get(id)?.firstName?.toLowerCase() ?? id.slice(-6);
      try {
        files.push(await R.saveThread(id, ctx.id, `fail-thread-${name}.json`));
        const f = await R.frame(id, ctx.id, `fail-frame-${name}.jpg`);
        if (f.ok) files.push(f.file);
      } catch {
        /* the employee may be gone */
      }
    }
  } catch (e) {
    console.log(`WARN could not save the failure bundle: ${(e as Error).message}`);
  }
  return files;
}

async function runDef(def: Def): Promise<void> {
  const wanted = def.ids.filter((id) => !only || only.includes(id));
  if (!wanted.length) return;
  if (aborted) {
    for (const id of wanted) results.push({ id, name: def.name[def.ids.indexOf(id)], ok: false, skipped: aborted, secs: 0, cost: 0, evidence: `skipped: ${aborted}`, failures: [], files: [] });
    for (const id of wanted) console.log(`SKIP ${id} ${def.name[def.ids.indexOf(id)]} - ${aborted}`);
    return;
  }
  const costBefore = await R.refreshCost();
  const ctxs = def.ids.map((id) => new Ctx(R, id, def.timeoutMs));
  let err: Error | null = null;
  const timer = setTimeout(() => ctxs.forEach((c) => (c.aborted = true)), def.timeoutMs);
  try {
    await Promise.race([
      def.fn(ctxs),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`hard timeout of ${Math.round(def.timeoutMs / 1000)}s`)), def.timeoutMs + 5000)),
    ]);
  } catch (e) {
    err = e as Error;
    if (e instanceof BudgetExceeded) aborted = e.message;
  } finally {
    clearTimeout(timer);
  }
  const cost = await R.refreshCost();
  for (const ctx of ctxs) {
    if (!wanted.includes(ctx.id)) continue;
    // a driver that died early fails every scenario it had not finished checking
    const failed = ctx.checks.filter((c) => !c.ok);
    if (err) failed.push({ ok: false, label: 'scenario error', evidence: err.message });
    const ok = failed.length === 0 && ctx.checks.length > 0;
    const secs = (Date.now() - ctx.t0) / 1000;
    const evidence = [...ctx.checks.filter((c) => c.ok).map((c) => `${c.label}: ${c.evidence}`.replace(/: $/, '')), ...ctx.facts].join('; ');
    let files = ctx.files;
    if (!ok) files = [...files, ...(await failureBundle(ctx))];
    const short = (ok ? evidence : failed.map((f) => `${f.label}${f.evidence ? ` (${f.evidence})` : ''}`).join('; ')).slice(0, 420);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${ctx.id} ${def.name[def.ids.indexOf(ctx.id)]} (${secs.toFixed(0)} s, ${money(cost - costBefore)} here, ${money(cost)} so far) - ${short}`);
    if (!ok) for (const k of ctx.checks) console.log(`     ${k.ok ? 'ok' : 'x '} ${k.label}${k.evidence ? `: ${k.evidence}` : ''}`);
    if (!ok && err) console.log(`     x scenario error: ${err.message}`);
    if (files.length) console.log(`     evidence: ${[...new Set(files)].join(', ')}`);
    results.push({ id: ctx.id, name: def.name[def.ids.indexOf(ctx.id)], ok, secs, cost: cost - costBefore, evidence: short, failures: failed.map((f) => `${f.label}: ${f.evidence}`), files: [...new Set(files)] });
  }
  if (aborted) console.log(`ABORT ${aborted}`);
}

async function main(): Promise<number> {
  console.log(`real.ts: model ${opts.model}, budget ${money(opts.budget)}, port ${opts.port}, data ${opts.data}${only ? `, only ${only.join(',')}` : ''}${repeat > 1 ? `, repeat ${repeat}` : ''}`);
  await R.boot();
  const health = await R.c.api<{ capabilities: { llm: boolean; desktops: string } }>('GET', '/api/health');
  console.log(`office up: llm ${health.data.capabilities.llm}, desktops ${health.data.capabilities.desktops}`);
  if (health.data.capabilities.desktops !== 'cua' || !health.data.capabilities.llm) throw new Error('office is not running real desktops with a model');
  try {
    for (let i = 0; i < repeat; i++) {
      if (repeat > 1) console.log(`--- round ${i + 1} of ${repeat} ---`);
      for (const def of defs) await runDef(def);
    }
  } finally {
    const clean = await R.cleanup().catch((e) => ({ left: [`cleanup failed: ${(e as Error).message}`], port: false }));
    console.log(`cleanup: ${opts.keep ? 'kept (--keep)' : 'every employee removed, office stopped'}; Spaces of ours left: ${clean.left.length ? clean.left.join(', ') : 'none'}; port ${opts.port} ${clean.port ? 'STILL IN USE' : 'free'}`);
    if (!opts.keep && (clean.left.length || clean.port)) process.exitCode = 1;
  }
  const secs = results.reduce((s, r) => s + r.secs, 0);
  console.log('\nResult        secs   cost     evidence');
  for (const r of results) console.log(`${r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(4)} ${r.secs.toFixed(0).padStart(6)} ${money(r.cost).padStart(8)}  ${r.name}`);
  console.log(`total ${(secs / 60).toFixed(1)} min of scenarios, ${money(R.lastCost)} model spend`);
  mkdirSync(R.evidenceRoot, { recursive: true });
  writeFileSync(path.join(R.evidenceRoot, `summary${only ? `-${only.join('-')}` : ''}.json`), JSON.stringify({ at: new Date().toISOString(), model: opts.model, totalCostUsd: R.lastCost, results }, null, 2));
  return results.some((r) => !r.ok && !r.skipped) || results.some((r) => r.skipped) ? 1 : 0;
}

void hasFlag;
main().then((code) => process.exit(process.exitCode ? process.exitCode : code), async (err) => {
  console.log(`FAIL real.ts crashed: ${(err as Error).stack ?? err}`);
  await R.cleanup().catch(() => {});
  process.exit(1);
});
