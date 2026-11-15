// Seeds a running mock office with the four demo employees and a short history.
// Usage: npm run seed   (office must run with MOCK_LLM=1 DESKTOPS=mock; OFFICE_PORT picks the port)
import { pathToFileURL } from 'node:url';
import type { ActivityStep, Employee, Message, Task } from '../src/shared/index.ts';
import { readEnv } from '../src/shared/index.ts';

const DAY = 86_400_000;

type Json = Record<string, unknown>;

async function call<T = unknown>(base: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

async function until<T>(what: string, fn: () => Promise<T | null | false | undefined>, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const PEOPLE: { roleKey: string; titles: string[]; steps: string[]; ack: string; acks?: string[]; outcomes: string[] }[] = [
  {
    roleKey: 'web_developer',
    titles: ['Fix the cart total on checkout', 'Build the pricing page', 'Review the signup form code', 'Speed up the home page', 'Add a contact form', 'Fix the broken footer links'],
    steps: ['Opened the project folder', 'Edited the page', 'Ran the checks'],
    ack: 'On it. I will run the checks before I call it done.',
    acks: ['On it. I\'ll run the checks before I call it done.', 'Looking now.', 'Sure, starting with the failing case.'],
    outcomes: [
      'The cart total was adding shipping twice. Fixed, and the checkout tests pass.',
      'The pricing page is up on staging: three plans, monthly and yearly, and it holds up on a phone.',
      'The signup form is in good shape. Two things worth changing: the password rule message and a missing label. I\'ve left notes in the file.',
      'The home page now loads in 1.1 s, down from 2.9. Most of it was two oversized images.',
      'The contact form is in. It checks the email address and sends to the shared inbox.',
      'Six footer links pointed at pages we renamed. All fixed and checked.',
    ],
  },
  {
    roleKey: 'marketer',
    titles: ['Plan the launch campaign', 'Write the launch email', 'Research three competitors', 'Draft the newsletter', 'Outline a social calendar', 'Compare ad channels'],
    steps: ['Looked at competitors', 'Drafted three options', 'Picked the strongest'],
    ack: 'Sure. I will bring you three options.',
    acks: ['Sure. I\'ll bring you three options.', 'Happy to. Give me a few minutes.', 'On it. I\'ll start with what competitors are doing.'],
    outcomes: [
      'Three campaign options are in the doc. I\'d go with the second: one clear promise and a two-week run.',
      'The launch email is drafted, with three subject lines to choose from. The short one reads best.',
      'Notes on the three competitors are ready. All three lead with price; none of them shows the product.',
      'The newsletter draft is ready: four short items and one link each.',
      'A four-week social calendar is in the sheet, three posts a week.',
      'Search wins on cost per signup, social on reach. A one-page comparison is in the folder.',
    ],
  },
  {
    roleKey: 'researcher',
    titles: ['Find the facts on pricing models', 'Compare two hosting options', 'Summarise the market report', 'Check the claims in the draft', 'List open questions on privacy', 'Read the new regulation'],
    steps: ['Read the sources', 'Kept notes', 'Wrote the summary'],
    ack: 'Starting now. I will mark what is uncertain.',
    acks: ['Starting now. I\'ll mark what is uncertain.', 'On it. I\'ll keep the sources.', 'Sure. I\'ll come back with what holds up and what doesn\'t.'],
    outcomes: [
      'There are three common pricing models. Per-seat is the norm in our space. Sources and two caveats are in the note.',
      'Both hosts would do. The first is cheaper at our size and the second is simpler to run. Details in the note.',
      'The market report in one page: growth is slowing, and small teams are the part still growing.',
      'Two claims in the draft don\'t hold up. I\'ve marked them and suggested wording that does.',
      'Seven open questions on privacy, in order of risk. The first two need a lawyer.',
      'The new regulation mostly restates the old one. Two changes affect us, and both are in the note.',
    ],
  },
  {
    roleKey: 'designer',
    titles: ['Sketch the settings layout', 'Improve the pricing page', 'Make a simple logo', 'Review the colour palette', 'Tidy the icon set', 'Mock up the empty state'],
    steps: ['Sketched two directions', 'Compared them', 'Wrote up the why'],
    ack: 'Happy to. Two directions coming.',
    acks: ['Happy to. Two directions coming.', 'On it. I\'ll sketch before I polish.', 'Sure. I\'ll show you options first.'],
    outcomes: [
      'Two layouts for settings are in the file. The grouped one is calmer and I\'d build that.',
      'The pricing page reads better now: one highlighted plan and less small print.',
      'Three logo directions are ready. The simple mark holds up best at small sizes.',
      'The palette works. I\'d drop the second blue: it fights the first.',
      'The icon set is tidy: one stroke weight and one corner style, 24 icons.',
      'The empty state is mocked up: one line and one button, nothing else.',
    ],
  },
];

function pad<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/** The manager's request, written the way a person asks: "Can you fix the cart total on checkout?" */
function ask(title: string, i: number): string {
  const rest = title[0]!.toLowerCase() + title.slice(1);
  return [`Can you ${rest}?`, `Please ${rest}.`, `${title} when you get a moment.`][i % 3]!;
}

function historyFor(e: Employee, spec: (typeof PEOPLE)[number], now: number) {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const days = [0, 0, 1, 2, 3, 5, 8, 10, 12, 20, 26, 33, 40, 47];
  const tasks: Task[] = [];
  const messages: Message[] = [];
  const steps: ActivityStep[] = [];
  let seq = 0;
  const id = (p: string) => `${p}_seed${e.id.slice(-6)}${String(++seq).padStart(4, '0')}`;

  days.forEach((d, i) => {
    let start = midnight - d * DAY + (9 + (i % 6) * 2) * 3_600_000;
    if (d === 0) start = Math.min(start, now - (25 + i * 40) * 60_000);
    start = Math.max(start, midnight - d * DAY + 60_000);
    const title = pad(spec.titles, i);
    const activeMs = (10 + ((i * 7) % 25)) * 60_000;
    const failed = i % 7 === 6;
    const finished = start + activeMs + 60_000;
    const task: Task = {
      id: id('tsk'), employeeId: e.id, title, assignedBy: 'user', status: failed ? 'failed' : 'done',
      plan: [], outcome: failed ? "I couldn't finish this one: the site didn't load after three tries." : pad(spec.outcomes, i),
      assignedMs: start, finishedMs: finished, activeMs, costUsd: Math.round((0.12 + ((i * 13) % 30) / 100) * 100) / 100,
      inputTokens: 20_000 + i * 900, outputTokens: 3_000 + i * 120, numTurns: 6 + (i % 5), traceId: null,
    };
    tasks.push(task);
    if (d > 3) return; // threads keep three days of history; older work only counts in the numbers
    const m = (from: Message['from'], kind: Message['kind'], text: string, createdMs: number): Message => ({
      id: id('msg'), employeeId: e.id, from, kind, text, taskId: task.id, createdMs, seenMs: from === 'user' ? createdMs + 4_000 : null,
    });
    messages.push(m('user', 'text', ask(title, i), start));
    messages.push(m('employee', 'text', pad(spec.acks ?? [spec.ack], i), start + 9_000));
    spec.steps.forEach((sentence, k) => {
      const s = start + 20_000 + k * Math.floor(activeMs / 3);
      steps.push({ id: id('evt'), employeeId: e.id, taskId: task.id, sentence, status: 'ok', startedMs: s, endedMs: s + Math.floor(activeMs / 3) - 1000 });
    });
    messages.push(m('employee', failed ? 'text' : 'done', task.outcome ?? '', finished));
  });
  return { tasks, messages, steps };
}

export interface SeedResult {
  employees: Employee[];
  history: boolean;
}

export async function seedOffice(base: string, log: (s: string) => void = console.log): Promise<SeedResult> {
  const health = await call<{ capabilities: { desktops: string } }>(base, 'GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) throw new Error(`No office answering at ${base}`);
  if (health.data.capabilities.desktops !== 'mock') throw new Error('The seed only runs against DESKTOPS=mock.');

  const existing = (await call<Employee[]>(base, 'GET', '/api/employees')).data;
  for (const e of existing) await call(base, 'DELETE', `/api/employees/${e.id}`);
  if (existing.length) log(`removed ${existing.length} existing employees`);

  const hired: Employee[] = [];
  for (const p of PEOPLE) {
    const cand = await call<{ token: string }>(base, 'POST', '/api/candidates', { roleKey: p.roleKey });
    const e = await call<Employee>(base, 'POST', '/api/employees', { token: cand.data.token });
    if (e.status !== 200) throw new Error(`Could not hire ${p.roleKey}: ${JSON.stringify(e.data)}`);
    hired.push(e.data);
  }
  log(`hired ${hired.map((h) => h.persona.firstName).join(', ')}`);

  for (const h of hired) {
    await until(`${h.persona.firstName}'s greeting`, async () => {
      const t = (await call<{ messages: Message[] }>(base, 'GET', `/api/employees/${h.id}/thread`)).data;
      const e = (await call<Employee>(base, 'GET', `/api/employees/${h.id}`)).data;
      return e.state === 'idle' && t.messages.some((m) => m.from === 'employee') ? true : null;
    });
  }

  const now = Date.now();
  const probe = await call(base, 'POST', '/api/dev/seed', {});
  const history = probe.status === 204;
  if (history) {
    const patches: Json[] = [];
    const body: { tasks: Task[]; messages: Message[]; steps: ActivityStep[]; employees: Json[] } = { tasks: [], messages: [], steps: [], employees: patches };
    hired.forEach((h, i) => {
      const hist = historyFor(h, PEOPLE[i], now);
      body.tasks.push(...hist.tasks);
      body.messages.push(...hist.messages);
      body.steps.push(...hist.steps);
    });
    await call(base, 'POST', '/api/dev/seed', body);
    log(`history: ${body.tasks.length} tasks, ${body.messages.length} messages`);
  } else {
    log('no /api/dev/seed (office is not in MOCK_LLM mode): history skipped');
  }

  const [maya, priya, jonas, ines] = hired;
  await call(base, 'POST', `/api/employees/${maya.id}/messages`, { text: 'Please put together a short team page and get it ready to publish.' });
  await call(base, 'POST', `/api/employees/${priya.id}/messages`, { text: 'This is a long task: draft three campaign options for the launch.' });
  await until('Maya to need you', async () => ((await call<Employee>(base, 'GET', `/api/employees/${maya.id}`)).data.state === 'needs_you' ? true : null));
  await until('Priya to be working', async () => ((await call<Employee>(base, 'GET', `/api/employees/${priya.id}`)).data.state === 'working' ? true : null));

  if (history) {
    await call(base, 'POST', '/api/dev/seed', {
      employees: [
        { id: jonas.id, lastActivityMs: Date.now() - 3_600_000, unread: 0 },
        { id: ines.id, lastActivityMs: Date.now() - 3 * 3_600_000, unread: 0 },
      ],
    });
  }
  const final = (await call<Employee[]>(base, 'GET', '/api/employees')).data;
  log(`ready: ${final.map((e) => `${e.persona.firstName} (${e.state})`).join(', ')}`);
  return { employees: final, history };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = readEnv();
  seedOffice(`http://127.0.0.1:${env.OFFICE_PORT}`).catch((e) => {
    console.error('seed failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
