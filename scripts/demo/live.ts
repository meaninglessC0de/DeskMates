// Live demo: "launch day". One command starts a longer project the four employees do together, handing work to each other
// as messages, and narrates it for the audience. The last step (approve Maya's git push) is the presenter's. See scripts/demo/README.md.
//   npx tsx scripts/demo/live.ts [--prepare | --go] [--quick] [--reset | --reuse] [--stagger-s 0] [--timeout-min 20] [--auto-approve-others]
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
const KNOWN = new Set(['reset', 'reuse', 'stagger-s', 'timeout-min', 'auto-approve-others', 'people', 'print-tasks', 'prepare', 'go', 'quick', 'no-change', 'change-at']);
const USAGE = 'Flags: --prepare | --go, --quick, --no-change, --change-at N, --reset | --reuse, --stagger-s N, --timeout-min N, --auto-approve-others';
for (const a of argv) if (a.startsWith('--') && !KNOWN.has(a.slice(2))) fail(`Unknown flag ${a}. ${USAGE}`);
const reset = has('reset');
const reuse = has('reuse');
const prepare = has('prepare');
const go = has('go');
const quick = has('quick');
if (reset && reuse) fail('Pass --reset or --reuse, not both.');
if (prepare && go) fail('Pass --prepare or --go, not both. Run --prepare first, then --go when the audience is ready. With neither, the script does everything.');
if (go && (reset || reuse)) fail('--go uses the team --prepare made: it does not take --reset or --reuse.');
if (prepare && reuse) fail('--prepare with --reuse would keep people who already have work. Use --reset (or an empty office).');
if (prepare) for (const f of ['quick', 'no-change', 'change-at', 'stagger-s', 'timeout-min', 'auto-approve-others']) if (has(f)) fail(`--${f} belongs to the part that sends tasks: give it to --go (or to a run without --prepare).`);
const noChange = has('no-change');
const changeAtRaw = val('change-at');
const changeAt = changeAtRaw === undefined ? null : Number(changeAtRaw);
if (has('change-at') && (changeAt === null || !Number.isFinite(changeAt) || changeAt < 0)) fail('--change-at must be a number of seconds after the kickoff, zero or more');
if (noChange && has('change-at')) fail('Pass --no-change or --change-at, not both.');
if (quick && (noChange || has('change-at'))) fail('--no-change and --change-at belong to the default project; --quick has no change request.');
const changeEnabled = !quick && !noChange;
const autoApproveOthers = has('auto-approve-others');
const timeoutMin = Number(val('timeout-min') ?? (quick ? 20 : 25));
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

const NO_SHARED_FILES = 'The desktops do not share files, so anything you send a colleague must be written out in the message itself';
const MAYA_FILES = 'The desktops do not share files, so what your colleagues send you arrives as message text, and anything you send them must be written out in the message itself';

/** The short version (--quick): about two minutes of work. */
function quickText(p: Person): string {
  const has = (k: PersonKey) => set.has(k);
  switch (p.key) {
    case 'jonas':
      return (
        `Hi Jonas, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and the team needs your research first. ${NO_SHARED_FILES}. ` +
        'Please look at how three hosted shop builders (Shopify, Squarespace and BigCommerce) handle pricing and discount codes on their public pages, public pages only and no logins. ' +
        (has('priya')
          ? 'As soon as you have the three most useful facts, send them to Priya in a message: she is writing the launch page copy and is waiting for them. '
          : 'As soon as you have the three most useful facts, put them in your reply to me. ') +
        'After that, make a one-page comparison chart as a single HTML file (inline CSS or SVG only, nothing loaded from the network) and keep it open in Firefox on screen. ' +
        'Tell me when you are done.'
      );
    case 'ines':
      return (
        `Hi Ines, Sam here. Today is launch day: we ship our fixed checkout with a new launch page, and I need you to design that page. ${NO_SHARED_FILES}, not left as a file path. ` +
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
        `Hi Priya, Sam here. Today is launch day: we ship our fixed checkout with a new launch page. Please write the launch page copy: a headline, a one-sentence subhead, three benefit lines and a short pricing note. ${NO_SHARED_FILES}. ` +
        (has('jonas')
          ? 'Jonas is looking at how Shopify, Squarespace and BigCommerce handle pricing and discount codes and will send you the three most useful facts. Wait for them and use one of them in the pricing note. '
          : '') +
        'Make the copy a single styled web page (HTML with inline CSS, not a text file) and keep it open in Firefox. ' +
        (has('maya')
          ? 'When it is final, send the copy to Maya in a message, because she builds the page from it. '
          : 'When it is final, tell me. ') +
        'After that, write the launch post (about 120 words) that announces the fixed checkout and the new page, also as a styled web page, and keep it open in Firefox too. Tell me when you are done.'
      );
    case 'maya':
      return (
        `Hi Maya, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and you are the one who ships it. ${MAYA_FILES}. ` +
        'First, the checkout total in our shop looks wrong when a customer uses a discount code. The code is in ~/work/shop. Please find the bug and fix it, ' +
        'then open a terminal window on your desktop, run the tests in it and leave that window open showing the passing run. Commit the fix on a new branch called fix/checkout-discount, as its own step. ' +
        'Second, build the launch page as a single HTML file with inline CSS at ~/work/shop/site/index.html. ' +
        mayaSources() +
        'Open the finished page in Firefox and keep it open. ' +
        (has('ines')
          ? 'Then send the full HTML of the page to Ines in a message and ask her to review it. Wait for her reply, which will name two fixes, apply them and reload the page. '
          : '') +
        'Last, commit the page on the same branch and publish the branch with git push (I will approve the push myself). ' +
        'Keep the terminal and the page open on screen at the end, and tell me when you are done.'
      );
  }
}

/** Who Maya waits for, depending on who is on the team. */
function mayaSources(): string {
  const has = (k: PersonKey) => set.has(k);
  if (has('priya') && has('ines')) return 'The words come from Priya and the colours, fonts and layout from Ines: both will send you a message, so if either one has not arrived when you need it, wait for it. ';
  if (has('priya')) return 'The words come from Priya, who will send you a message with the copy: wait for it if it has not arrived. Choose simple colours and fonts yourself. ';
  if (has('ines')) return 'The colours, fonts and layout come from Ines, who will send you a message with a build spec: wait for it if it has not arrived. Write the words yourself: a headline, a one-sentence subhead, three benefit lines and a short pricing note. ';
  return 'Write the words yourself (a headline, a one-sentence subhead, three benefit lines and a short pricing note) and choose simple colours and fonts. ';
}

/** The default kickoff: a shared opening, each person's ownership and a shared closing. No step-by-step instructions. */
function teamText(p: Person): string {
  const has = (k: PersonKey) => set.has(k);
  const n = people.length;
  const who = n === 4 ? 'the four of you own it together' : n === 3 ? 'the three of you own it together' : n === 2 ? 'the two of you own it together' : 'you own it';
  const opening =
    `Hi ${p.first}, Sam here. Today is launch day, and ${who}: by the end, our fixed checkout and a launch page that sells it are ready to publish. ` +
    'I am not going to hand out step-by-step instructions, and you do not need my answer on details: decide, and tell me what you decided. Work it out between you, talk to each other directly and take the initiative: if you see what the launch needs from your side, do it, and if something a teammate sends you is wrong or could be better, tell them how. ' +
    'Your desktops do not share files, so anything you pass to a teammate has to be in the message itself.';
  const closing =
    'I am watching your desks live, so do the work on screen where I can see it: read and browse in Firefox on your own desktop rather than fetching pages in the background, ' +
    'keep whatever you are making open and reload it after every change, scroll through anything you review, and run your checks in a visible terminal. ' +
    'Tell me in a line when something important happens.';
  let own = '';
  switch (p.key) {
    case 'maya': {
      const from = [has('priya') ? "Priya's words" : '', has('ines') ? "Ines's design" : ''].filter(Boolean);
      const signoffs = [has('ines') ? 'Ines has signed off the design' : '', has('priya') ? 'Priya the words' : '', has('jonas') ? 'Jonas the facts' : ''].filter(Boolean);
      const count = signoffs.length;
      own =
        'You build and ship. The checkout total is wrong when a customer uses a discount code (the code is in ~/work/shop): find it, fix it, and keep a terminal window open on your desktop showing the tests passing. ' +
        `Then build the launch page at ~/work/shop/site/index.html from ${from.length ? from.join(' and ') : 'your own words and design'}, with a worked example of a discounted order whose numbers come from running the shop's own code, and an FAQ section. ` +
        (count
          ? `Nothing ships until ${signoffs.length > 1 ? signoffs.slice(0, -1).join(', ') + ' and ' + signoffs[signoffs.length - 1] : signoffs[0]} on the page you built. ` +
            `When ${count === 1 ? 'that is done' : count === 2 ? 'both have' : 'all three have'}, commit on a branch called fix/checkout-discount and publish it with git push; I will approve the push myself. `
          : 'When you are happy with it, commit on a branch called fix/checkout-discount and publish it with git push; I will approve the push myself. ') +
        'Keep the page and the terminal open on your desktop, and try the page in Firefox the way a customer would: scroll it and click through it.';
      break;
    }
    case 'priya':
      own =
        'You own the words: the launch page copy (a headline, a subhead, three benefits, a pricing note and five FAQ answers), then the launch post and three short social posts. ' +
        (has('jonas') ? 'Every claim about another company has to be checked by Jonas before it goes out. ' : '') +
        'Keep your work open on your desktop as a styled web page, not a text file. ' +
        (has('maya') ? 'Maya needs your words to build, and you proofread what she builds.' : '');
      break;
    case 'jonas':
      own =
        'You own the facts: how Shopify, Squarespace and BigCommerce handle pricing and discount codes on their public pages, no logins. Do the research in Firefox on your desktop, page by page, so I can see what you are reading. ' +
        `Get the most useful facts to ${has('priya') ? 'Priya' : 'me'} early, then make a comparison chart with real bars as a web page and keep it open on your desktop. ` +
        (has('priya') || has('maya')
          ? `Check every factual claim in ${[has('priya') ? "Priya's copy" : '', has('maya') ? 'the page Maya builds' : ''].filter(Boolean).join(' and ')}, and tell ${has('priya') && has('maya') ? 'them' : has('priya') ? 'her' : 'her'} exactly what to change. `
          : '') +
        'If your research turns up something that should change the page or the design, say so without being asked.';
      break;
    case 'ines':
      own =
        'You own the look: a style guide (colours, type, spacing) and a mockup of the launch page at desktop and phone widths, kept open on your desktop. ' +
        (has('maya')
          ? 'Maya builds from your spec, so send her one she can build from. Review what she builds against your mockup: save what she sends, open it in Firefox on your desktop and scroll through it, and keep reviewing until you would put your name on it.'
          : '');
      break;
  }
  return `${opening} ${own.trim()} ${closing}`;
}

/** The manager's change request, sent to everyone in the middle of the default project. */
const CHANGE_REQUEST =
  'Team, a change from me before we ship. First, we are adding a launch-week offer: 15% off with the code LAUNCH15, valid for seven days. ' +
  'Second, I want a short "How the fix works" section on the page for customers who are not technical, with a simple diagram. ' +
  'Both have to be consistent everywhere: in the shop\'s code and on the page, in the copy and the posts, and in the design. ' +
  'Jonas, check how our competitors run launch offers so what we claim is fair. Sort out between you who does what, and get every change signed off again. The offer starts today. Where I have not given a detail, decide it between you and tell me what you chose: do not wait for my answer.';

const taskText = (p: Person): string => (quick ? quickText(p) : teamText(p));

const SEND_ORDER_ALL: PersonKey[] = ['jonas', 'ines', 'priya', 'maya'];
if (has('print-tasks')) {
  console.log('# Default: the team brief (one message each)\n');
  for (const k of SEND_ORDER_ALL) {
    const p = CAST.find((c) => c.key === k)!;
    if (set.has(k)) console.log(`${p.first}:\n${teamText(p)}\n`);
  }
  console.log(`# Default: the change request (sent to all, ${has('change-at') ? `after ${val('change-at')} s` : 'when the first round wraps up: every teammate has answered Maya after her first build went out, or 240 s after the kickoff, never before 120 s'})\n\n${CHANGE_REQUEST}\n`);
  console.log('# --quick: the scripted two-minute version\n');
  for (const k of SEND_ORDER_ALL) {
    const p = CAST.find((c) => c.key === k)!;
    if (set.has(k)) console.log(`${p.first}:\n${quickText(p)}\n`);
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
  mentionsCode: string[];        // files on this desktop that mention LAUNCH15
  toManager: number;             // messages this person sent to Sam
}
const states = new Map<PersonKey, State>();
const peerLog: PeerMsg[] = [];
const idToFirst = new Map<string, string>();
let runStartMs = 0;
let tasksOutMs = 0;   // when the first task went out
let kickoffMs = 0;    // when the last task went out
let changeSentMs = 0; // when the change request went out (0 = not yet)

const isPush = (a: Approval) => /push/i.test(`${a.title} ${a.detail}`);
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (flat(s).length > n ? `${flat(s).slice(0, n - 1)}…` : flat(s));
const elapsed = () => {
  const sec = tasksOutMs ? Math.max(0, Math.round((Date.now() - tasksOutMs) / 1000)) : 0;
  return `+${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
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
  if (existing.length && !reset && !reuse && !go) {
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
  tasksOutMs ||= sentMs;
  await api('POST', `/api/employees/${e.id}/messages`, { text: taskText(p) });
  states.set(p.key, {
    person: p, id: e.id, name: e.persona.name, model: e.model, sentMs, doneMs: null, finished: false, detail: 'task sent',
    state: e.state, stateDetail: e.stateDetail, plan: '', planNow: '', approvalId: null, doneText: '', lastText: '', artifacts: [], costUsd: null,
    seenSteps: new Set(), seenMessages: new Set(), seenApprovals: new Set(), printed: false, toManager: 0, mentionsCode: [],
  });
  log(`Task sent to ${p.first}`);
}

// ---------- watching ----------

/** What is not yet as the finale needs it on Maya's desktop (empty = ready). Checked inside her Space. */
async function mayaMissing(id: string, wantCode: boolean): Promise<string[]> {
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
        'grep -q LAUNCH15 site/index.html 2>/dev/null && echo launch15=yes || echo launch15=no; ' +
        'git ls-tree -r --name-only refs/heads/fix/checkout-discount 2>/dev/null | grep -qx site/index.html && echo committed=yes || echo committed=no; ' +
        'pgrep -f "[x]fce4-terminal|[x]term|[g]nome-terminal" >/dev/null && echo terminal=yes || echo terminal=no',
    );
    const ok = (k: string) => r.out.includes(`${k}=yes`) || r.out.includes(`${k}=pass`);
    if (!ok('branch')) missing.push('no branch fix/checkout-discount');
    else if (!ok('commit')) missing.push('nothing committed on the branch');
    if (!ok('page')) missing.push('no launch page at site/index.html');
    else if (!ok('committed')) missing.push('launch page not committed');
    if (wantCode && !ok('launch15')) missing.push('LAUNCH15 not on the page');
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
  // the same message shows up in both threads (sender's "to" step, receiver's "from" step): count it once
  const t60 = flat(peer.text).slice(0, 60).toLowerCase();
  if (peerLog.some((m) => m.from === from && m.to === to && flat(m.text).slice(0, 60).toLowerCase() === t60 && Math.abs(m.ms - step.startedMs) < 30_000)) return;
  peerLog.push({ from, to, text: flat(peer.text), ms: step.startedMs });
  console.log(`[${stamp()} ${elapsed()}] ${from} -> ${to}: ${clip(peer.text, 600)}`);
}

/** Files on a desktop (html, md, py, txt) that mention the launch code. */
async function mentionsLaunch15(id: string): Promise<string[]> {
  try {
    const r = await sh(id, "find ~ -type f \\( -name '*.html' -o -name '*.md' -o -name '*.py' -o -name '*.txt' \\) -not -path '*/.*' -not -path '*/work-old-*' -not -path '*/work/remotes/*' -exec grep -l LAUNCH15 {} + 2>/dev/null | head -8");
    return r.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')).map((l) => l.replace(/^\/home\/cua/, '~'));
  } catch {
    return [];
  }
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
    s.toManager++;
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
    const pushes = pending.filter(isPush);
    // in the default project only an approval raised after the change request counts
    const valid = changeEnabled ? pushes.filter((a) => changeSentMs > 0 && a.createdMs > changeSentMs) : pushes;
    const push = valid[0];
    const otherPending = pending.find((a) => !isPush(a));
    if (push) {
      s.approvalId = push.id;
      if (!mayaCache || Date.now() - mayaCache.at > 10_000) mayaCache = { at: Date.now(), missing: await mayaMissing(s.id, changeEnabled) };
      ok = mayaCache.missing.length === 0;
      why = ok ? `waiting on approval ${push.id}` : `push approval pending, but not ready: ${mayaCache.missing.join('; ')}`;
      if (!ok && why !== s.detail) log(`${first}: ${why}`);
    } else if (pushes.length) {
      why = 'push approval raised before the change request: waiting for her to pick the change up and ask again';
      if (why !== s.detail) log(`${first}: ${why}`);
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
  const F = ROLE_FIRST;
  if (!quick) return out;
  const count = (a: PersonKey, b: PersonKey) => peerLog.filter((m) => m.from === F(a) && m.to === F(b)).length;
  const need = (a: PersonKey, b: PersonKey, n: number) => {
    if (!set.has(a) || !set.has(b)) return;
    out.push({ label: `${F(a)} to ${F(b)}${n > 1 ? ` x${n}` : ''}`, met: count(a, b) >= n });
  };
  need('jonas', 'priya', 1);
  need('priya', 'maya', 1);
  need('ines', 'maya', 1);
  need('maya', 'ines', 1);
  // Ines's review reply must come after Maya's page
  if (set.has('ines') && set.has('maya')) {
    const first = peerLog.find((m) => m.from === F('maya') && m.to === F('ines'));
    out.push({ label: 'Ines to Maya (review, after the page)', met: !!first && peerLog.some((m) => m.from === F('ines') && m.to === F('maya') && m.ms > first.ms) });
  }
  return out;
}

const allDone = () => states.size === people.length && [...states.values()].every((s) => s.finished) && expectedMessages().every((m) => m.met);

// ---------- main ----------

/** --go: the team --prepare made must be there, with no task given yet. */
async function loadPreparedTeam(existing: Employee[]): Promise<Map<PersonKey, Employee>> {
  const team = new Map<PersonKey, Employee>();
  const problems: string[] = [];
  for (const p of people) {
    const e = existing.find((x) => x.persona.firstName === p.first);
    if (!e) {
      problems.push(`${p.first} is not on the team`);
      continue;
    }
    let cur = e;
    for (let i = 0; cur.state !== 'idle' && cur.state !== 'working' && i < 10; i++) {
      await sleep(2000);
      cur = await employee(e.id);
    }
    if (cur.state !== 'idle') problems.push(`${p.first} is ${cur.state} (${cur.stateDetail}), not idle`);
    const t = await thread(e.id);
    if (t.messages.some((m) => m.from === 'user') || t.task) problems.push(`${p.first} already has work`);
    team.set(p.key, cur);
  }
  const maya = team.get('maya');
  if (maya && !problems.length) {
    const r = await sh(maya.id, 'test -d ~/work/shop/.git && test -d ~/work/remotes/shop.git && echo seeded').catch(() => ({ out: '', code: 1 }));
    if (!/seeded/.test(r.out)) problems.push("Maya's shop is not seeded");
  }
  if (problems.length) fail(`The team is not ready for --go: ${problems.join('; ')}. Run --prepare (with --reset) first.`);
  return team;
}

/** True when the change request should go out now. */
function changeDue(): boolean {
  const el = (Date.now() - kickoffMs) / 1000;
  if (changeAt !== null) return el >= changeAt;
  if (el < 120) return false;
  if (el >= 240) return true;
  // The first round is wrapping up: Maya's build has gone out for review and every teammate has answered her since.
  const maya = ROLE_FIRST('maya');
  const spec = peerLog.find((m) => m.from === ROLE_FIRST('ines') && m.to === maya);
  const build = spec ? peerLog.find((m) => m.from === maya && m.to === ROLE_FIRST('ines') && m.ms > spec.ms) : undefined;
  if (!build) return false;
  return (['ines', 'priya', 'jonas'] as PersonKey[])
    .filter((k) => set.has(k))
    .every((k) => peerLog.some((m) => m.from === ROLE_FIRST(k) && m.to === maya && m.ms > build.ms));
}

async function sendChange(team: Map<PersonKey, Employee>): Promise<void> {
  changeSentMs = Date.now();
  console.log(`[${stamp()} ${elapsed()}] Sam -> team: ${CHANGE_REQUEST}`);
  for (const [, e] of team) {
    try {
      await api('POST', `/api/employees/${e.id}/messages`, { text: CHANGE_REQUEST });
    } catch (err) {
      loud(`could not send the change request to ${e.persona.firstName}: ${(err as Error).message.slice(0, 100)}`);
    }
  }
}

async function main(): Promise<void> {
  initSpaces();
  const startedAt = Date.now();

  const existing = await preflight();
  let team = new Map<PersonKey, Employee>();
  if (go) {
    team = await loadPreparedTeam(existing);
    log(`Team is in place: ${people.map((p) => p.first).join(', ')}. Sending the ${quick ? 'quick' : 'full'} project.`);
  } else {
    if (reset && existing.length) await removeEveryone(existing);
    const kept = reuse ? existing : [];

    const settings = await api<{ userName: string }>('PATCH', '/api/settings', { userName: MANAGER });
    log(`Manager is now ${settings.userName}`);

    // hire in desk order, seed Maya as soon as she is up
    for (const p of people) {
      const have = kept.find((e) => e.persona.firstName === p.first);
      if (have) {
        log(`${p.first} is already on the team, reusing`);
        await tidyDesktop(have, p.first);
        team.set(p.key, have);
      } else {
        team.set(p.key, await hireOne(p));
      }
      if (p.key === 'maya') await seedMaya(team.get('maya')!.id);
    }
    if (prepare) {
      log(`The team is ready: ${people.map((p) => p.first).join(', ')}, Maya's shop seeded, manager ${MANAGER}. No task has been sent (${minutes(Date.now() - startedAt)} min).`);
      log(`Next: npx tsx scripts/demo/live.ts --go${quick ? '' : '   (add --quick for the two-minute version)'}`);
      process.exit(0);
    }
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
    kickoffMs = Date.now();
    sendingDone = true;
  })();
  sender.catch((e) => fail(`Could not send a task: ${(e as Error).message}`));

  const deadline = Date.now() + (timeoutMin * 60_000) + staggerS * 1000 * order.length;
  let finishedAt: number | null = null;
  let graceStart = 0;
  for (;;) {
    for (const s of [...states.values()]) {
      try {
        await poll(s);
      } catch (e) {
        s.detail = `check failed: ${(e as Error).message.slice(0, 80)}`;
      }
    }
    if (sendingDone && changeEnabled && !changeSentMs && changeDue()) await sendChange(team);
    if (sendingDone) {
      if (quick) {
        if (allDone()) {
          finishedAt = Date.now();
          break;
        }
      } else {
        const maya = states.get('maya');
        const others = [...states.values()].filter((x) => x.person.key !== 'maya');
        if (!maya) {
          if (others.every((x) => x.finished)) {
            finishedAt = Date.now();
            break;
          }
        } else if (maya.finished) {
          if (!graceStart) {
            graceStart = Date.now();
            if (!others.every((x) => x.finished)) log(`Maya's approval is in. Letting the others wrap up (up to 60 s): ${others.filter((x) => !x.finished).map((x) => x.person.first).join(', ')}`);
          }
          if (others.every((x) => x.finished) || Date.now() - graceStart > 60_000) {
            finishedAt = Date.now();
            break;
          }
        } else {
          graceStart = 0;
        }
      }
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
    s.mentionsCode = changeSentMs ? await mentionsLaunch15(s.id) : [];
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
      messagesToManager: s.toManager,
      launch15In: s.mentionsCode,
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
  const rel = (ms: number) => { const sec = Math.max(0, Math.round((ms - tasksOutMs) / 1000)); return `+${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  for (const m of peerLog.sort((a, b) => a.ms - b.ms)) console.log(`  [${new Date(m.ms).toLocaleTimeString('en-GB')} ${rel(m.ms)}] ${m.from} -> ${m.to}: ${clip(m.text, 200)}`);
  if (!peerLog.length) console.log('  (none)');
  for (const m of expected) if (!m.met) console.log(`  missing: ${m.label}`);
  console.log('');
  const stillBusy = quick ? [] : [...states.values()].filter((x) => x.person.key !== 'maya' && !x.finished).map((x) => x.person.first);
  const toApprovalMin = mayaState?.doneMs ? minutes(mayaState.doneMs - kickoffMs) : null;
  const mayaPage = mayaState ? (mayaState.mentionsCode.some((f) => /site\/index\.html$/.test(f)) ? 'yes' : changeSentMs ? 'no' : 'n/a') : 'n/a';
  const mayaCode = mayaState ? (mayaState.mentionsCode.some((f) => f.endsWith('.py')) ? 'yes' : changeSentMs ? 'no' : 'n/a') : 'n/a';
  console.log(`Pending approval: ${mayaState?.approvalId ?? 'none'}   Total cost: $${totalCost.toFixed(3)}   Total minutes: ${totalMinutes}`);
  if (!quick) {
    console.log(`Kickoff to Maya's approval: ${toApprovalMin ?? '-'} min   Teammate messages: ${peerLog.length}   Still busy at the end: ${stillBusy.length ? stillBusy.join(', ') : 'nobody'}`);
    console.log(`Messages to ${MANAGER}: ${[...states.values()].map((x) => `${x.person.first} ${x.toManager}`).join(', ')}`);
    console.log(`Change request (LAUNCH15): ${changeEnabled ? (changeSentMs ? `sent at +${Math.round((changeSentMs - tasksOutMs) / 1000)} s; on Maya's page: ${mayaPage}; in the shop code: ${mayaCode}` : 'not sent') : 'skipped'}`);
  }

  const out = path.join(ROOT, 'shots/demo/live-last-run.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({
    office: OFFICE,
    manager: MANAGER,
    mode: quick ? 'quick' : 'full',
    startedAt: new Date(startedAt).toISOString(),
    totalMinutes,
    totalCostUsd: Math.round(totalCost * 1000) / 1000,
    allFinished: !!finishedAt,
    pendingApprovalId: mayaState?.approvalId ?? null,
    expectedMessages: expected,
    minutesToApproval: toApprovalMin,
    teammateMessageCount: peerLog.length,
    messagesToManager: Object.fromEntries([...states.values()].map((x) => [x.person.first, x.toManager])),
    stillBusy,
    changeRequest: changeEnabled ? { sentAtS: changeSentMs ? Math.round((changeSentMs - tasksOutMs) / 1000) : null, onPage: mayaPage, inShopCode: mayaCode } : null,
    rows,
    messages: peerLog.map((m) => ({ time: new Date(m.ms).toISOString(), from: m.from, to: m.to, elapsedS: Math.round((m.ms - tasksOutMs) / 1000), text: m.text })),
  }, null, 2));
  log(`Wrote ${path.relative(ROOT, out)}`);
  process.exit(finishedAt ? 0 : 2);
}

main().catch((e) => {
  console.error(`demo: ${(e as Error).message}`);
  process.exit(1);
});
