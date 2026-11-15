// One-command demo pipeline: hires Maya, Priya, Jonas and Ines on a running office, seeds Maya's desktop with a small shop
// that has a real checkout bug, sends the four tasks as Sam's messages, then waits and reports. See scripts/demo/README.md.
//   npx tsx scripts/demo/run.ts [--only maya,ines] [--skip-hire] [--skip-seed] [--reuse] [--timeout-min 20]
// Environment: DEMO_OFFICE_URL (default http://127.0.0.1:4317), DEMO_MIN_FREE_GB (default 4, 0 turns the memory check off).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Approval, Candidate, Employee, Message, TeamReport, ThreadResponse } from '../../src/shared/index.ts';
import { readEnv } from '../../src/shared/index.ts';
import { createCuaSpaces } from '../../src/office/spaces/cuaSpaces.ts';
import type { Spaces } from '../../src/office/spaces/types.ts';
import { hostMemory } from '../e2e/lib/harness.ts';

process.env.CUA_TELEMETRY ??= '0';
process.env.DO_NOT_TRACK ??= '1';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SEED_DIR = path.join(import.meta.dirname, 'seed');
const OFFICE = (process.env.DEMO_OFFICE_URL ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
const MIN_FREE_GB = Number(process.env.DEMO_MIN_FREE_GB ?? 4);
const MANAGER = 'Sam';

// ---------- the cast, in desk order ----------

interface Person {
  key: 'maya' | 'priya' | 'jonas' | 'ines';
  first: string;
  roleKey: string;
}
const CAST: Person[] = [
  { key: 'maya', first: 'Maya', roleKey: 'web_developer' },
  { key: 'priya', first: 'Priya', roleKey: 'marketer' },
  { key: 'jonas', first: 'Jonas', roleKey: 'researcher' },
  { key: 'ines', first: 'Ines', roleKey: 'designer' },
];

// ---------- flags ----------

const argv = process.argv.slice(2);
const has = (n: string) => argv.includes(`--${n}`);
const val = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const KNOWN = new Set(['only', 'skip-hire', 'skip-seed', 'reuse', 'timeout-min']);
for (const a of argv) if (a.startsWith('--') && !KNOWN.has(a.slice(2))) fail(`Unknown flag ${a}. Flags: --only a,b --skip-hire --skip-seed --reuse --timeout-min N`);
const onlyRaw = val('only');
const only = onlyRaw?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
if (only) for (const o of only) if (!CAST.some((c) => c.key === o)) fail(`--only: "${o}" is not one of maya, priya, jonas, ines`);
const people = CAST.filter((c) => !only || only.includes(c.key));
const skipHire = has('skip-hire');
const skipSeed = has('skip-seed');
const reuse = has('reuse');
const timeoutMin = Number(val('timeout-min') ?? 20);
if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) fail('--timeout-min must be a number of minutes above zero');

// ---------- small helpers ----------

function fail(msg: string): never {
  console.error(`demo: ${msg}`);
  process.exit(1);
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString('en-GB');
const log = (s: string) => console.log(`[${stamp()}] ${s}`);
const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

async function api<T>(method: string, p: string, body?: unknown, tries = 3): Promise<T> {
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

const thread = (id: string) => api<ThreadResponse>('GET', `/api/employees/${id}/thread?limit=200`);
const employee = (id: string) => api<Employee>('GET', `/api/employees/${id}`);

// ---------- run state ----------

interface State {
  person: Person;
  id: string;
  name: string;
  model: string;
  sentMs: number;           // when the task was sent
  doneMs: number | null;    // when the finish condition first held
  detail: string;           // why it is (not) finished
  finished: boolean;
  approvalId: string | null;
  artifacts: string[];
  costUsd: number | null;
  peerTo: number;
  peerFrom: number;
  state: string;
  stateDetail: string;
  lastEmployeeText: string;
}
const states = new Map<Person['key'], State>();

let spaces: Spaces;

async function sh(id: string, cmd: string, timeoutMs = 60_000): Promise<{ out: string; code: number }> {
  const r = await spaces.exec(id, cmd, { timeoutMs });
  return { out: (r.stdout + (r.stderr ? `\n${r.stderr}` : '')).trim(), code: r.exitCode };
}

// ---------- 1. preflight ----------

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
  const names = existing.map((e) => e.persona.firstName);
  if (existing.length && !reuse && !skipHire) {
    fail(`The office already has employees (${names.join(', ')}). Remove them, or pass --reuse to keep the ones that match and hire the rest.`);
  }
  if (skipHire) {
    const missing = people.filter((p) => !existing.some((e) => e.persona.firstName === p.first));
    if (missing.length) fail(`--skip-hire: ${missing.map((m) => m.first).join(', ')} not on the team yet.`);
  }
  return existing;
}

// ---------- 3. hire ----------

async function waitHello(id: string, first: string, timeoutMs = 240_000): Promise<void> {
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

async function hireOne(p: Person): Promise<Employee> {
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
  log(`${p.first} is at her desk and has said hello`);
  return e;
}

// ---------- 4. seed Maya ----------

function buildSeedTar(): Buffer {
  return execFileSync('tar', ['-czf', '-', '--exclude=__pycache__', '--exclude=*.pyc', '--exclude=.DS_Store', '-C', path.join(SEED_DIR), 'shop'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function seedMaya(id: string): Promise<void> {
  log('Seeding Maya\'s desktop with the shop...');
  await spaces.writeFile(id, '/tmp/shop-seed.tgz', buildSeedTar());
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

// ---------- 5. tasks ----------

function taskText(p: Person, set: Set<Person['key']>): string {
  switch (p.key) {
    case 'maya':
      return 'Hi Maya. The checkout total in our shop looks wrong when a customer uses a discount code. The code is in ~/work/shop. Please find the bug and fix it. Then open a terminal window on your desktop, run the tests in it and leave that window open on screen showing the passing run, so I can see it. Commit the fix on a new branch called fix/checkout-discount (do the commit as its own step). Last of all, publish the branch with git push.';
    case 'priya':
      return set.has('jonas')
        ? 'Hi Priya. We are launching our new checkout, where discount codes now come off before tax so customers pay the right total. Please draft the launch post (about 120 words) and keep it open on your screen so I can read it. Ask Jonas for one line on how competitors handle this and use it in the post. Tell me when it is ready.'
        : 'Hi Priya. We are launching our new checkout, where discount codes now come off before tax so customers pay the right total. Please draft the launch post (about 120 words) and keep it open on your screen so I can read it. Tell me when it is ready.';
    case 'jonas':
      return 'Hi Jonas. Please compare the pricing of three real competitors for our small online shop, for example hosted shop builders. Use their public pricing pages only, no logins. Make a one-page chart as a single HTML file (inline CSS or SVG only, nothing loaded from the network) and keep it open in Firefox. Priya may ask you for a line about it, so answer her if she does.';
    case 'ines':
      return 'Hi Ines. Please design two versions of a mobile onboarding screen as phone mockups side by side on one HTML page, labelled "Version A" and "Version B". Open the page in Firefox and keep it open. I may ask you later to mark the version we choose on that page.';
  }
}

async function sendTask(p: Person, e: Employee, set: Set<Person['key']>): Promise<void> {
  await sh(e.id, 'touch /tmp/.demo-start').catch(() => undefined);
  const sentMs = Date.now();
  await api<Message>('POST', `/api/employees/${e.id}/messages`, { text: taskText(p, set) });
  states.set(p.key, {
    person: p, id: e.id, name: e.persona.name, model: e.model, sentMs, doneMs: null, detail: 'task sent', finished: false,
    approvalId: null, artifacts: [], costUsd: null, peerTo: 0, peerFrom: 0, state: e.state, stateDetail: e.stateDetail, lastEmployeeText: '',
  });
  log(`Task sent to ${p.first}`);
}

// ---------- 6. wait and report ----------

const isPush = (a: Approval) => /push/i.test(`${a.title} ${a.detail}`);

/** What is not yet as the video needs it on Maya's desktop (empty = ready). Checked inside her Space. */
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
        'pgrep -f "[x]fce4-terminal|[x]term|[g]nome-terminal" >/dev/null && echo terminal=yes || echo terminal=no',
    );
    const has = (k: string) => r.out.includes(`${k}=yes`) || r.out.includes(`${k}=pass`);
    if (!has('branch')) missing.push('no branch fix/checkout-discount');
    else if (!has('commit')) missing.push('nothing committed on the branch');
    if (!has('clean')) missing.push('uncommitted changes');
    if (!has('tests')) missing.push('tests do not pass');
    if (!has('terminal')) missing.push('no terminal window open');
  } catch (e) {
    missing.push(`could not inspect the desktop (${(e as Error).message.slice(0, 60)})`);
  }
  return missing;
}

async function check(s: State, set: Set<Person['key']>): Promise<void> {
  const [e, t] = await Promise.all([employee(s.id), thread(s.id)]);
  s.state = e.state;
  s.stateDetail = e.stateDetail;
  const since = t.messages.filter((m) => m.createdMs >= s.sentMs - 1000);
  const fromHer = since.filter((m) => m.from === 'employee');
  s.lastEmployeeText = fromHer.length ? fromHer[fromHer.length - 1].text : s.lastEmployeeText;
  const doneMsg = fromHer.find((m) => m.kind === 'done');
  const question = fromHer.filter((m) => m.kind === 'question').pop();
  const peers = t.steps.filter((x) => x.peer && x.startedMs >= s.sentMs - 1000);
  const other = (k: Person['key']) => states.get(k)?.id;

  const peerOf = (k: Person['key']) => peers.filter((x) => x.peer?.employeeId === other(k));
  let ok = false;
  let why = '';
  switch (s.person.key) {
    case 'maya': {
      const pending = t.approvals.filter((a) => a.status === 'pending');
      const push = pending.find(isPush);
      if (push) {
        s.approvalId = push.id;
        const missing = await mayaMissing(s.id);
        ok = missing.length === 0;
        why = ok ? `waiting on approval ${push.id}` : `push approval pending, but not ready: ${missing.join('; ')}`;
      } else if (pending.length) {
        why = `pending approval that is not a push: "${pending[0].title}"`;
      } else if (t.approvals.some((a) => isPush(a) && a.status !== 'pending')) {
        why = `push approval already ${t.approvals.filter(isPush).pop()?.status}`;
      } else {
        why = doneMsg ? 'reported done but no push approval is pending' : 'working';
      }
      break;
    }
    case 'priya': {
      const jonas = set.has('jonas');
      s.peerTo = jonas ? peerOf('jonas').filter((x) => x.peer?.direction === 'to').length : 0;
      s.peerFrom = jonas ? peerOf('jonas').filter((x) => x.peer?.direction === 'from').length : 0;
      const exchange = !jonas || (s.peerTo >= 1 && s.peerFrom >= 1);
      ok = !!doneMsg && exchange;
      why = doneMsg ? (exchange ? 'reported done' : `reported done, but teammate messages to ${s.peerTo} / from ${s.peerFrom} Jonas`) : jonas ? `working (to Jonas ${s.peerTo}, from Jonas ${s.peerFrom})` : 'working';
      break;
    }
    default: {
      ok = !!doneMsg;
      why = ok ? 'reported done' : 'working';
    }
  }
  if (question && !ok && e.state === 'needs_you') why = `asks Sam: ${question.text.slice(0, 80)}`;
  s.detail = why;
  if (ok && !s.finished) {
    s.finished = true;
    s.doneMs = Date.now();
    log(`${s.person.first}: ${why} after ${minutes(s.doneMs - s.sentMs)} min`);
  }
}

async function findArtifacts(s: State): Promise<string[]> {
  if (s.person.key === 'maya') return ['~/work/shop (branch fix/checkout-discount)'];
  try {
    const r = await sh(
      s.id,
      "find ~ -type f -newer /tmp/.demo-start \\( -name '*.html' -o -name '*.htm' -o -name '*.md' -o -name '*.txt' -o -name '*.svg' -o -name '*.png' \\) -not -path '*/.*' -not -path '*/node_modules/*' 2>/dev/null | head -8",
    );
    return r.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')).map((l) => l.replace(/^\/home\/cua/, '~'));
  } catch {
    return [];
  }
}

async function saveFrame(s: State): Promise<string | null> {
  try {
    const res = await fetch(`${OFFICE}/api/employees/${s.id}/frame.jpg`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200 || buf[0] !== 0xff) return null;
    const dir = path.join(ROOT, 'shots/demo');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${s.person.key}.jpg`);
    writeFileSync(file, buf);
    return path.relative(ROOT, file);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!people.length) fail('Nothing to do: --only matched nobody.');
  spaces = createCuaSpaces({ dataDir: path.join(tmpdir(), 'deskmates-demo'), env: readEnv({ ...process.env, DESKTOPS: 'cua' }) });
  const set = new Set(people.map((p) => p.key));
  const startedAt = Date.now();

  const existing = await preflight();

  // 2. the manager's name
  const settings = await api<{ userName: string }>('PATCH', '/api/settings', { userName: MANAGER });
  log(`Manager is now ${settings.userName}`);

  // 3 and 4. hire in desk order; seed Maya as soon as she is up
  const team = new Map<Person['key'], Employee>();
  for (const p of people) {
    const have = existing.find((e) => e.persona.firstName === p.first);
    if (have) {
      log(`${p.first} is already on the team, reusing her`);
      team.set(p.key, have);
    } else {
      team.set(p.key, await hireOne(p));
    }
    if (p.key === 'maya' && !skipSeed) await seedMaya(team.get('maya')!.id);
  }
  if (skipSeed && set.has('maya')) log('Skipping the seed (--skip-seed)');

  // 5. tasks, in desk order
  for (const p of people) await sendTask(p, team.get(p.key)!, set);

  // 6. wait
  const deadline = Date.now() + timeoutMin * 60_000;
  let lastPrint = 0;
  for (;;) {
    for (const s of states.values()) {
      try {
        await check(s, set);
      } catch (e) {
        s.detail = `check failed: ${(e as Error).message.slice(0, 80)}`;
      }
    }
    if ([...states.values()].every((s) => s.finished)) break;
    if (Date.now() > deadline) {
      log(`Timed out after ${timeoutMin} min`);
      break;
    }
    if (Date.now() - lastPrint >= 15_000) {
      lastPrint = Date.now();
      log([...states.values()].map((s) => `${s.person.first}: ${s.finished ? 'DONE' : s.state} (${s.detail})`).join(' | '));
    }
    await sleep(3000);
  }

  // report
  let team$: TeamReport | null = null;
  try {
    team$ = await api<TeamReport>('GET', '/api/team?range=today');
  } catch {
    /* cost is informative only */
  }
  const rows: Record<string, unknown>[] = [];
  for (const s of states.values()) {
    s.costUsd = team$?.rows.find((r) => r.employeeId === s.id)?.costUsd ?? null;
    s.artifacts = await findArtifacts(s);
    const frame = await saveFrame(s);
    rows.push({
      person: s.name,
      model: s.model,
      state: s.finished ? 'finished' : `not finished (${s.state})`,
      detail: s.detail,
      minutes: s.doneMs ? minutes(s.doneMs - s.sentMs) : null,
      costUsd: s.costUsd,
      artifacts: s.artifacts,
      pendingApprovalId: s.approvalId,
      teammateMessages: s.person.key === 'priya' && set.has('jonas') ? { toJonas: s.peerTo, fromJonas: s.peerFrom } : undefined,
      lastMessage: s.lastEmployeeText.slice(0, 300),
      frame,
    });
  }
  console.log('');
  console.log(['Person', 'State', 'Min', 'Cost', 'Artifact', 'Pending approval'].join('\t'));
  for (const r of rows) {
    console.log([
      r.person, r.state, r.minutes ?? '-', r.costUsd === null ? '-' : `$${(r.costUsd as number).toFixed(3)}`,
      (r.artifacts as string[])[0] ?? '-', r.pendingApprovalId ?? '-',
    ].join('\t'));
  }
  const out = path.join(ROOT, 'shots/demo/last-run.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({
    office: OFFICE, manager: MANAGER, startedAt: new Date(startedAt).toISOString(), totalMinutes: minutes(Date.now() - startedAt),
    allFinished: [...states.values()].every((s) => s.finished), rows,
  }, null, 2));
  log(`Wrote ${path.relative(ROOT, out)}`);
  process.exit([...states.values()].every((s) => s.finished) ? 0 : 2);
}

main().catch((e) => {
  console.error(`demo: ${(e as Error).message}`);
  process.exit(1);
});
