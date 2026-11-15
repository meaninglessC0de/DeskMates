// Live demo: "launch day". One command starts a longer project the four employees do together, handing work to each other
// as messages, and narrates it for the audience. The last step (approve Maya's git push) is the presenter's. See scripts/demo/README.md.
//   npx tsx scripts/demo/live.ts [--reset | --reuse] [--stagger-s 0] [--timeout-min 20] [--auto-approve-others]
// Environment: DEMO_OFFICE_URL (default http://127.0.0.1:4317), DEMO_MIN_FREE_GB (default 4, 0 turns the memory check off).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Approval, Employee, TeamReport, ThreadResponse } from '../../src/shared/index.ts';
import {
  CAST, MANAGER, OFFICE, ROOT, api, employee, fail, findArtifacts, hireOne, initSpaces, log, minutes, saveFrameTo, seedMaya, sh, sleep,
  stamp, thread, type Person, type PersonKey,
} from './lib.ts';

// ---------- flags ----------

const argv = process.argv.slice(2);
const has = (n: string) => argv.includes(`--${n}`);
const val = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const KNOWN = new Set(['reset', 'reuse', 'stagger-s', 'timeout-min', 'auto-approve-others', 'people', 'print-tasks']);
const USAGE = 'Flags: --reset | --reuse, --stagger-s N, --timeout-min N, --auto-approve-others';
for (const a of argv) if (a.startsWith('--') && !KNOWN.has(a.slice(2))) fail(`Unknown flag ${a}. ${USAGE}`);
const reset = has('reset');
const reuse = has('reuse');
if (reset && reuse) fail('Pass --reset or --reuse, not both.');
const autoApproveOthers = has('auto-approve-others');
const timeoutMin = Number(val('timeout-min') ?? 20);
if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) fail('--timeout-min must be a number of minutes above zero');
const staggerS = Number(val('stagger-s') ?? 0);
if (!Number.isFinite(staggerS) || staggerS < 0) fail('--stagger-s must be a number of seconds, zero or more');
// Hidden test flag: run the project with a subset of the cast (for example --people maya,ines) on a machine that cannot hold four desktops.
const peopleRaw = val('people');
const subset = peopleRaw?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
if (has('people') && !subset?.length) fail('--people needs names, for example --people maya,ines');
if (subset) for (const o of subset) if (!CAST.some((c) => c.key === o)) fail(`--people: "${o}" is not one of maya, priya, jonas, ines`);
const people = CAST.filter((c) => !subset || subset.includes(c.key));
const set = new Set<PersonKey>(people.map((p) => p.key));
if (!people.length) fail('Nothing to do: --people matched nobody.');

const POLL_MS = 5000;
const ROLE_FIRST = (k: PersonKey) => CAST.find((c) => c.key === k)!.first;

// ---------- the four tasks (one natural message each, from Sam) ----------

function taskText(p: Person): string {
  const has = (k: PersonKey) => set.has(k);
  switch (p.key) {
    case 'jonas':
      return (
        'Hi Jonas, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and the team needs your research first. The desktops do not share files, so anything you send a colleague must be written out in the message itself. ' +
        'Please look at how three hosted shop builders (Shopify, Squarespace and BigCommerce) handle pricing and discount codes on their public pages, public pages only and no logins. ' +
        (has('priya')
          ? 'As soon as you have the three most useful facts, send them to Priya in a message: she is writing the launch page copy and is waiting for them. '
          : 'As soon as you have the three most useful facts, put them in your reply to me. ') +
        'After that, make a one-page comparison chart as a single HTML file (inline CSS or SVG only, nothing loaded from the network) and keep it open in Firefox on screen. ' +
        'Tell me when you are done.'
      );
    case 'ines':
      return (
        'Hi Ines, Sam here. Today is launch day: we ship our fixed checkout with a new launch page, and I need you to design that page. The desktops do not share files, so anything you send a colleague must be written out in the message itself, not left as a file path. ' +
        'Please make a short style guide (three colours as hex codes, a typeface and a spacing scale) and a mockup of the page as an HTML page, and keep the mockup open in Firefox. ' +
        (has('maya')
          ? 'Once the design is settled, send Maya a compact build spec in a message: the colours, fonts and layout in about five lines, because she builds the page. ' +
            'Later Maya will send you the HTML of the page she built, for your review. Wait for it, save it to a file on your own desktop and open it in Firefox beside your mockup. ' +
            'Then reply to Maya with exactly two concrete fixes, or just "ship it" if it needs none. '
          : 'Tell me the build spec in your reply as well: the colours, fonts and layout in about five lines. ') +
        'Keep your mockup open on screen at the end. Tell me when you are done.'
      );
    case 'priya':
      return (
        'Hi Priya, Sam here. Today is launch day: we ship our fixed checkout with a new launch page. Please write the launch page copy: a headline, a one-sentence subhead, three benefit lines and a short pricing note. The desktops do not share files, so anything you send a colleague must be written out in the message itself. ' +
        (has('jonas')
          ? 'Jonas is looking at how Shopify, Squarespace and BigCommerce handle pricing and discount codes and will send you the three most useful facts. Wait for them and use one of them in the pricing note. '
          : '') +
        'Keep the copy open on screen. ' +
        (has('maya')
          ? 'When it is final, send the copy to Maya in a message, because she builds the page from it. '
          : 'When it is final, tell me. ') +
        'After that, write the launch post (about 120 words) that announces the fixed checkout and the new page, and keep it open on screen too. Tell me when you are done.'
      );
    case 'maya':
      return (
        'Hi Maya, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and you are the one who ships it. The desktops do not share files, so what your colleagues send you arrives as message text, and anything you send them must be written out in the message itself. ' +
        'First, the checkout total in our shop looks wrong when a customer uses a discount code. The code is in ~/work/shop. Please find the bug and fix it, ' +
        'then open a terminal window on your desktop, run the tests in it and leave that window open showing the passing run. Commit the fix on a new branch called fix/checkout-discount, as its own step. ' +
        'Second, build the launch page as a single HTML file with inline CSS at ~/work/shop/site/index.html. ' +
        (has('priya') && has('ines')
          ? 'The words come from Priya and the colours, fonts and layout from Ines: both will send you a message, so if either one has not arrived when you need it, wait for it. '
          : has('priya')
            ? 'The words come from Priya, who will send you a message with the copy: wait for it if it has not arrived. Choose simple colours and fonts yourself. '
            : has('ines')
              ? 'The colours, fonts and layout come from Ines, who will send you a message with a build spec: wait for it if it has not arrived. Write the words yourself: a headline, a one-sentence subhead, three benefit lines and a short pricing note. '
              : 'Write the words yourself (a headline, a one-sentence subhead, three benefit lines and a short pricing note) and choose simple colours and fonts. ') +
        'Open the finished page in Firefox and keep it open. ' +
        (has('ines')
          ? 'Then send the full HTML of the page to Ines in a message and ask her to review it. Wait for her reply, which will name two fixes, apply them and reload the page. '
          : '') +
        'Last, commit the page on the same branch and publish the branch with git push (I will approve the push myself). ' +
        'Keep the terminal and the page open on screen at the end, and tell me when you are done.'
      );
  }
}

const SEND_ORDER_ALL: PersonKey[] = ['jonas', 'ines', 'priya', 'maya'];
if (has('print-tasks')) {
  for (const k of SEND_ORDER_ALL) {
    const p = CAST.find((c) => c.key === k)!;
    if (set.has(k)) console.log(`${p.first}:\n${taskText(p)}\n`);
  }
  process.exit(0);
}

/** The order the tasks go out in: the people who start the chain first. */
const SEND_ORDER = SEND_ORDER_ALL;

// ---------- run state ----------

interface PeerMsg { from: string; to: string; text: string; ms: number }
interface State {
  person: Person;
  id: string;
  name: string;
  model: string;
  sentMs: number;
  doneMs: number | null;
  finished: boolean;
  detail: string;
  state: string;
  stateDetail: string;
  plan: string;                  // "2/5"
  planNow: string;
  approvalId: string | null;
  doneText: string;
  lastText: string;
  artifacts: string[];
  costUsd: number | null;
  seenSteps: Set<string>;
  seenMessages: Set<string>;
  seenApprovals: Set<string>;
  printed: boolean;              // has printed its first state line
}
const states = new Map<PersonKey, State>();
const peerLog: PeerMsg[] = [];
const peerSeen = new Set<string>();
const idToFirst = new Map<string, string>();
let runStartMs = 0;

const isPush = (a: Approval) => /push/i.test(`${a.title} ${a.detail}`);
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (flat(s).length > n ? `${flat(s).slice(0, n - 1)}…` : flat(s));
const loud = (s: string) => console.log(`[${stamp()}] !!! ${s}`);

// ---------- preflight and team ----------

async function preflight(): Promise<Employee[]> {
  let health: { ok: boolean; capabilities: { llm: boolean; desktops: string; databricks: boolean; calls: string } };
  try {
    health = await api('GET', '/api/health', undefined, 1);
  } catch (e) {
    fail(`The office does not answer at ${OFFICE} (${(e as Error).message}). Start it, or set DEMO_OFFICE_URL.`);
  }
  if (!health.ok) fail('The office reports it is not healthy.');
  const caps = health.capabilities;
  if (!caps.llm) fail('The office has no model key (capabilities.llm is false): it is not in real mode.');
  if (caps.desktops !== 'cua') fail(`The office runs "${caps.desktops}" desktops, not real ones (cua).`);
  log(`Office at ${OFFICE}: llm on, desktops cua, calls ${caps.calls}, databricks ${caps.databricks ? 'on' : 'off'}`);
  const existing = await api<Employee[]>('GET', '/api/employees');
  if (existing.length && !reset && !reuse) {
    fail(`The office already has employees (${existing.map((e) => e.persona.firstName).join(', ')}). Pass --reset to remove everyone and start fresh, or --reuse to keep the ones that match and hire the rest.`);
  }
  return existing;
}

async function removeEveryone(existing: Employee[]): Promise<void> {
  for (const e of existing) {
    log(`Removing ${e.persona.name}...`);
    await api<null>('DELETE', `/api/employees/${e.id}`);
  }
  const t0 = Date.now();
  for (;;) {
    const left = await api<Employee[]>('GET', '/api/employees');
    if (!left.length) break;
    if (Date.now() - t0 > 180_000) fail(`Still on the team after 3 minutes: ${left.map((e) => e.persona.firstName).join(', ')}.`);
    await sleep(2000);
  }
  log('The office is empty');
}

/** Close every open window and move ~/work (and loose files in the home folder) to ~/work-old-<n>, so nothing stale is on screen. */
async function tidyDesktop(e: Employee, first: string): Promise<void> {
  for (let i = 0; e.state !== 'idle' && e.state !== 'stuck'; i++) {
    if (i >= 15) fail(`${first} is ${e.state} (${e.stateDetail}), not idle: not reusing a busy desktop. Wait for the current task, answer or deny a leftover approval in the app, or use --reset.`);
    await sleep(2000);
    e = await employee(e.id);
  }
  const script = [
    'export DISPLAY="${DISPLAY:-:0}"',
    // only application windows: never the panel or the desktop (closing those opens a logout dialog)
    'if command -v wmctrl >/dev/null 2>&1; then for w in $(wmctrl -lx | awk \'$3 ~ /[Ff]irefox|[Tt]erminal|[Mm]ousepad|[Gg]edit|[Ll]ibre[Oo]ffice|[Xx]term/ {print $1}\'); do wmctrl -i -c "$w" || true; done; fi',
    'pkill -f "[x]fce4-session-logout" 2>/dev/null || true',
    'sleep 1',
    'for p in firefox firefox-bin firefox-esr xfce4-terminal mousepad gedit libreoffice; do pkill -x "$p" 2>/dev/null || true; done',
    'pkill -f "[h]ttp.server" 2>/dev/null || true',
    'n=1; while [ -e "$HOME/work-old-$n" ]; do n=$((n+1)); done',
    'mkdir -p "$HOME/work-old-$n"',
    '[ -e "$HOME/work" ] && mv "$HOME/work" "$HOME/work-old-$n/work" || true',
    'for f in "$HOME"/*.html "$HOME"/*.htm "$HOME"/*.md "$HOME"/*.txt "$HOME"/*.svg "$HOME"/*.png "$HOME"/Desktop/* "$HOME"/Documents/*; do [ -f "$f" ] && mv "$f" "$HOME/work-old-$n/" || true; done',
    'mkdir -p "$HOME/work"; rmdir "$HOME/work" 2>/dev/null || true',
    'echo "tidied into ~/work-old-$n"',
  ].join('\n');
  const r = await sh(e.id, script, 60_000);
  if (!/tidied into/.test(r.out)) throw new Error(`Tidying ${first}'s desktop failed (exit ${r.code}): ${r.out.slice(-300) || 'no output'}`);
  log(`${first}: ${r.out.split('\n').pop()}`);
}

// ---------- tasks ----------

async function sendTask(p: Person, e: Employee): Promise<void> {
  await sh(e.id, 'touch /tmp/.demo-start').catch(() => undefined);
  const sentMs = Date.now();
  await api('POST', `/api/employees/${e.id}/messages`, { text: taskText(p) });
  states.set(p.key, {
    person: p, id: e.id, name: e.persona.name, model: e.model, sentMs, doneMs: null, finished: false, detail: 'task sent',
    state: e.state, stateDetail: e.stateDetail, plan: '', planNow: '', approvalId: null, doneText: '', lastText: '', artifacts: [], costUsd: null,
    seenSteps: new Set(), seenMessages: new Set(), seenApprovals: new Set(), printed: false,
  });
  log(`Task sent to ${p.first}`);
}

// ---------- watching ----------

/** What is not yet as the finale needs it on Maya's desktop (empty = ready). Checked inside her Space. */
async function mayaMissing(id: string): Promise<string[]> {
  const missing: string[] = [];
  try {
    const r = await sh(
      id,
      'cd ~/work/shop || exit 9; ' +
        'git rev-parse --verify -q refs/heads/fix/checkout-discount >/dev/null && echo branch=yes || echo branch=no; ' +
        'test "$(git rev-parse refs/heads/fix/checkout-discount 2>/dev/null)" != "$(git rev-parse refs/heads/main)" && echo commit=yes || echo commit=no; ' +
        'test -z "$(git status --porcelain)" && echo clean=yes || echo clean=no; ' +
        'python3 -m unittest >/dev/null 2>&1 && echo tests=pass || echo tests=fail; ' +
        'test -s site/index.html && echo page=yes || echo page=no; ' +
        'git ls-tree -r --name-only refs/heads/fix/checkout-discount 2>/dev/null | grep -qx site/index.html && echo committed=yes || echo committed=no; ' +
        'pgrep -f "[x]fce4-terminal|[x]term|[g]nome-terminal" >/dev/null && echo terminal=yes || echo terminal=no',
    );
    const ok = (k: string) => r.out.includes(`${k}=yes`) || r.out.includes(`${k}=pass`);
    if (!ok('branch')) missing.push('no branch fix/checkout-discount');
    else if (!ok('commit')) missing.push('nothing committed on the branch');
    if (!ok('page')) missing.push('no launch page at site/index.html');
    else if (!ok('committed')) missing.push('launch page not committed');
    if (!ok('clean')) missing.push('uncommitted changes');
    if (!ok('tests')) missing.push('tests do not pass');
    if (!ok('terminal')) missing.push('no terminal window open');
  } catch (e) {
    missing.push(`could not inspect the desktop (${(e as Error).message.slice(0, 60)})`);
  }
  return missing;
}

let mayaCache: { at: number; missing: string[] } | null = null;

function recordPeer(owner: State, step: ThreadResponse['steps'][number]): void {
  const peer = step.peer;
  if (!peer) return;
  const other = idToFirst.get(peer.employeeId) ?? '?';
  const from = peer.direction === 'to' ? owner.person.first : other;
  const to = peer.direction === 'to' ? other : owner.person.first;
  const key = `${from}>${to}|${flat(peer.text).slice(0, 60).toLowerCase()}`;
  if (peerSeen.has(key)) return;
  peerSeen.add(key);
  peerLog.push({ from, to, text: flat(peer.text), ms: step.startedMs });
  console.log(`[${stamp()}] ${from} -> ${to}: ${clip(peer.text, 600)}`);
}

async function poll(s: State): Promise<void> {
  const [e, t] = await Promise.all([employee(s.id), thread(s.id)]);
  const first = s.person.first;

  // state line, only when it changed
  if (!s.printed || e.state !== s.state || e.stateDetail !== s.stateDetail) {
    const line = `${first}: ${e.state}${e.stateDetail ? ` - ${e.stateDetail}` : ''}`;
    if (e.state === 'stuck' || e.state === 'offline') loud(line);
    else log(line);
    s.printed = true;
  }
  s.state = e.state;
  s.stateDetail = e.stateDetail;

  // plan progress
  const plan = t.task?.plan ?? [];
  if (plan.length) {
    const done = plan.filter((p) => p.status === 'done').length;
    const now = plan.find((p) => p.status === 'in_progress')?.title ?? '';
    const prog = `${done}/${plan.length}`;
    if (prog !== s.plan || now !== s.planNow) log(`${first}: plan ${prog}${now ? `, now: ${clip(now, 70)}` : ''}`);
    s.plan = prog;
    s.planNow = now;
  }

  // new activity and teammate messages (teammate messages of everyone since the run began, so a message that arrives before a task is sent is still shown)
  for (const step of t.steps.filter((x) => x.startedMs >= runStartMs - 1000).sort((a, b) => a.startedMs - b.startedMs)) {
    if (s.seenSteps.has(step.id)) continue;
    s.seenSteps.add(step.id);
    if (step.peer) recordPeer(s, step);
    else log(`  ${first}: ${step.sentence}`);
  }

  // messages from the employee to Sam
  const mine = t.messages.filter((m) => m.createdMs >= s.sentMs - 1000 && m.from === 'employee').sort((a, b) => a.createdMs - b.createdMs);
  for (const m of mine) {
    if (s.seenMessages.has(m.id)) continue;
    s.seenMessages.add(m.id);
    s.lastText = m.text;
    if (m.kind === 'question') loud(`QUESTION from ${first} to ${MANAGER} (not answered by this script): ${clip(m.text, 500)}`);
    else if (m.kind === 'done') log(`${first} reports done: ${clip(m.text, 300)}`);
    else log(`${first} to ${MANAGER}: ${clip(m.text, 300)}`);
  }
  const doneMsg = mine.filter((m) => m.kind === 'done').pop();
  s.doneText = doneMsg?.text ?? s.doneText;

  // approvals
  const pending = t.approvals.filter((a) => a.status === 'pending');
  for (const a of t.approvals.filter((x) => x.createdMs >= runStartMs - 1000)) {
    if (s.seenApprovals.has(a.id)) continue;
    s.seenApprovals.add(a.id);
    const kind = isPush(a) && s.person.key === 'maya' ? 'the push, left for the presenter' : 'not the push';
    if (s.person.key === 'maya' && isPush(a)) log(`APPROVAL raised by ${first}: ${a.title} (${a.id}) - ${kind}. ${clip(a.detail, 160)}`);
    else loud(`APPROVAL raised by ${first}: "${a.title}" (${a.id}). ${clip(a.detail, 200)}${autoApproveOthers ? ' Approving it (--auto-approve-others).' : ' Not answered by this script.'}`);
  }
  if (autoApproveOthers) {
    for (const a of pending) {
      if (s.person.key === 'maya' && isPush(a)) continue;
      try {
        await api('POST', `/api/approvals/${a.id}`, { decision: 'approve', scope: 'once' });
        log(`${first}: approved "${a.title}" (${a.id})`);
      } catch (err) {
        loud(`could not approve ${a.id}: ${(err as Error).message.slice(0, 120)}`);
      }
    }
  }

  // finished?
  let ok = false;
  let why = '';
  if (s.person.key === 'maya') {
    const push = pending.find(isPush);
    const otherPending = pending.find((a) => !isPush(a));
    if (push) {
      s.approvalId = push.id;
      if (!mayaCache || Date.now() - mayaCache.at > 10_000) mayaCache = { at: Date.now(), missing: await mayaMissing(s.id) };
      ok = mayaCache.missing.length === 0;
      why = ok ? `waiting on approval ${push.id}` : `push approval pending, but not ready: ${mayaCache.missing.join('; ')}`;
    } else if (otherPending) {
      why = `pending approval that is not the push: "${otherPending.title}"`;
    } else if (t.approvals.some((a) => isPush(a) && a.status !== 'pending' && a.createdMs >= runStartMs - 1000)) {
      why = `push approval already ${t.approvals.filter(isPush).pop()?.status}`;
      s.approvalId = t.approvals.filter(isPush).pop()?.id ?? s.approvalId;
    } else {
      why = doneMsg ? 'reported done but no push approval is pending' : 'working';
    }
  } else {
    ok = !!doneMsg;
    why = ok ? 'reported done' : 'working';
  }
  s.detail = why;
  if (ok && !s.finished) {
    s.finished = true;
    s.doneMs = Date.now();
    log(`${first}: ${why} after ${minutes(s.doneMs - s.sentMs)} min`);
  } else if (!ok && s.finished && s.person.key === 'maya') {
    // the finale is no longer as shown (for example someone approved it early, or a window closed): say so, keep watching
    s.finished = false;
    s.doneMs = null;
    loud(`${first} is no longer ready for the finale: ${why}`);
  }
}

/** The messages the project needs, among the people taking part, with whether each has happened. */
function expectedMessages(): { label: string; met: boolean }[] {
  const out: { label: string; met: boolean }[] = [];
  const add = (a: PersonKey, b: PersonKey, label: string, met: (list: PeerMsg[]) => boolean) => {
    if (set.has(a) && set.has(b)) out.push({ label, met: met(peerLog) });
  };
  const F = ROLE_FIRST;
  add('jonas', 'priya', 'Jonas to Priya', (l) => l.some((m) => m.from === F('jonas') && m.to === F('priya')));
  add('priya', 'maya', 'Priya to Maya', (l) => l.some((m) => m.from === F('priya') && m.to === F('maya')));
  add('ines', 'maya', 'Ines to Maya (spec)', (l) => l.some((m) => m.from === F('ines') && m.to === F('maya')));
  add('maya', 'ines', 'Maya to Ines (page)', (l) => l.some((m) => m.from === F('maya') && m.to === F('ines')));
  add('ines', 'maya', 'Ines to Maya (review)', (l) => {
    const first = l.find((m) => m.from === F('maya') && m.to === F('ines'));
    return !!first && l.some((m) => m.from === F('ines') && m.to === F('maya') && m.ms > first.ms);
  });
  return out;
}

const allDone = () => states.size === people.length && [...states.values()].every((s) => s.finished) && expectedMessages().every((m) => m.met);

// ---------- main ----------

async function main(): Promise<void> {
  initSpaces();
  const startedAt = Date.now();

  const existing = await preflight();
  if (reset && existing.length) await removeEveryone(existing);
  const kept = reuse ? existing : [];

  const settings = await api<{ userName: string }>('PATCH', '/api/settings', { userName: MANAGER });
  log(`Manager is now ${settings.userName}`);

  // hire in desk order, seed Maya as soon as she is up
  const team = new Map<PersonKey, Employee>();
  for (const p of people) {
    const have = kept.find((e) => e.persona.firstName === p.first);
    if (have) {
      log(`${p.first} is already on the team, reusing her`);
      await tidyDesktop(have, p.first);
      team.set(p.key, have);
    } else {
      team.set(p.key, await hireOne(p));
    }
    if (p.key === 'maya') await seedMaya(team.get('maya')!.id);
  }
  for (const [k, e] of team) idToFirst.set(e.id, ROLE_FIRST(k));

  // tasks: Jonas, Ines, Priya, Maya, with the stagger between them, while the watching already runs
  runStartMs = Date.now();
  const order = SEND_ORDER.filter((k) => set.has(k));
  let sendingDone = false;
  const sender = (async () => {
    for (let i = 0; i < order.length; i++) {
      if (i > 0 && staggerS > 0) await sleep(staggerS * 1000);
      const p = CAST.find((c) => c.key === order[i])!;
      await sendTask(p, team.get(p.key)!);
    }
    sendingDone = true;
  })();
  sender.catch((e) => fail(`Could not send a task: ${(e as Error).message}`));

  const deadline = Date.now() + (timeoutMin * 60_000) + staggerS * 1000 * order.length;
  let finishedAt: number | null = null;
  for (;;) {
    for (const s of [...states.values()]) {
      try {
        await poll(s);
      } catch (e) {
        s.detail = `check failed: ${(e as Error).message.slice(0, 80)}`;
      }
    }
    if (sendingDone && allDone()) {
      finishedAt = Date.now();
      break;
    }
    if (Date.now() > deadline) {
      log(`Timed out after ${timeoutMin} min`);
      break;
    }
    await sleep(POLL_MS);
  }
  if (finishedAt) {
    log('Everything is in place. The push approval is waiting for the presenter.');
    await sleep(3000);
  }

  // ---------- report ----------
  let team$: TeamReport | null = null;
  try {
    team$ = await api<TeamReport>('GET', '/api/team?range=today');
  } catch {
    /* cost is informative only */
  }
  const rows: Record<string, unknown>[] = [];
  for (const k of order) {
    const s = states.get(k);
    if (!s) continue;
    s.costUsd = team$?.rows.find((r) => r.employeeId === s.id)?.costUsd ?? null;
    s.artifacts = s.person.key === 'maya'
      ? ['~/work/shop/site/index.html', '~/work/shop (branch fix/checkout-discount)']
      : await findArtifacts(s.id);
    const frame = await saveFrameTo(s.id, `shots/demo/live/${s.person.key}.jpg`);
    rows.push({
      person: s.name,
      model: s.model,
      state: s.finished ? 'finished' : `not finished (${s.state})`,
      detail: s.detail,
      minutes: s.doneMs ? minutes(s.doneMs - s.sentMs) : null,
      costUsd: s.costUsd,
      artifacts: s.artifacts,
      pendingApprovalId: s.approvalId,
      lastMessage: clip(s.doneText || s.lastText, 300),
      frame,
    });
  }
  const expected = expectedMessages();
  const totalCost = rows.reduce((a, r) => a + ((r.costUsd as number | null) ?? 0), 0);
  const totalMinutes = minutes(Date.now() - startedAt);
  const mayaState = states.get('maya');

  console.log('');
  console.log(['Person', 'State', 'Min', 'Cost', 'Artifact', 'Detail'].join('\t'));
  for (const r of rows) {
    console.log([r.person, r.state, r.minutes ?? '-', r.costUsd === null ? '-' : `$${(r.costUsd as number).toFixed(3)}`, (r.artifacts as string[])[0] ?? '-', r.detail].join('\t'));
  }
  console.log('');
  console.log('Teammate messages');
  for (const m of peerLog.sort((a, b) => a.ms - b.ms)) console.log(`  [${new Date(m.ms).toLocaleTimeString('en-GB')}] ${m.from} -> ${m.to}: ${clip(m.text, 200)}`);
  if (!peerLog.length) console.log('  (none)');
  for (const m of expected) if (!m.met) console.log(`  missing: ${m.label}`);
  console.log('');
  console.log(`Pending approval: ${mayaState?.approvalId ?? 'none'}   Total cost: $${totalCost.toFixed(3)}   Total minutes: ${totalMinutes}`);

  const out = path.join(ROOT, 'shots/demo/live-last-run.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({
    office: OFFICE,
    manager: MANAGER,
    startedAt: new Date(startedAt).toISOString(),
    totalMinutes,
    totalCostUsd: Math.round(totalCost * 1000) / 1000,
    allFinished: !!finishedAt,
    pendingApprovalId: mayaState?.approvalId ?? null,
    expectedMessages: expected,
    rows,
    messages: peerLog.map((m) => ({ time: new Date(m.ms).toISOString(), from: m.from, to: m.to, text: m.text })),
  }, null, 2));
  log(`Wrote ${path.relative(ROOT, out)}`);
  process.exit(finishedAt ? 0 : 2);
}

main().catch((e) => {
  console.error(`demo: ${(e as Error).message}`);
  process.exit(1);
});
