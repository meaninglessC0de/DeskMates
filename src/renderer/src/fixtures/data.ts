import type {
  ActivityStep, Approval, CallInfo, Candidate, Capabilities, Employee, Message, Permissions,
  Persona, RolePreset, Settings, Task, TeamReport,
} from '../../../shared';

/** Fixed clock for the fixtures; everything else is relative to it. */
export const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const ago = (ms: number): number => NOW - ms;

const id = (prefix: string, tag: string): string => `${prefix}_${tag.toUpperCase().padEnd(26, '0')}`;

export const defaultPermissions: Permissions = {
  level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true,
};

interface CastEntry {
  key: string; role: string; blurb: string; icon: string; first: string; name: string;
  personality: string; workingStyle: string; voiceLabel: string; starters: string[];
}

/** UX spec section 6.3: the eight presets and their cast members. */
const CAST: CastEntry[] = [
  { key: 'web_developer', role: 'Web developer', blurb: 'Builds and fixes software', icon: 'Code2', first: 'Maya', name: 'Maya Okafor', personality: 'Calm and exact. Asks one good question, then ships.', workingStyle: 'Small steps, runs the tests before saying done, shows the staging link.', voiceLabel: 'Warm alto, unhurried', starters: ['Fix a bug', 'Build a page', 'Review my code'] },
  { key: 'marketer', role: 'Marketer', blurb: 'Plans and writes campaigns', icon: 'Megaphone', first: 'Priya', name: 'Priya Raman', personality: 'Warm and curious. Thinks in audiences.', workingStyle: 'Offers three options, checks competitors, never posts without approval.', voiceLabel: 'Bright mezzo, quick', starters: ['Plan a campaign', 'Write a launch email', 'Research competitors'] },
  { key: 'researcher', role: 'Researcher', blurb: 'Finds and checks the facts', icon: 'Search', first: 'Jonas', name: 'Jonas Weber', personality: 'Patient and sceptical. Cites everything.', workingStyle: 'Reads widely, keeps running notes, flags what is uncertain.', voiceLabel: 'Even baritone, measured', starters: ['Find the facts', 'Compare options', 'Summarise a paper'] },
  { key: 'designer', role: 'Designer', blurb: 'Sketches and refines layouts', icon: 'PenTool', first: 'Ines', name: 'Ines Moreau', personality: 'Opinionated, and kind about it.', workingStyle: 'Sketches two directions, explains the why, asks before polishing.', voiceLabel: 'Soft, expressive', starters: ['Sketch a layout', 'Improve this page', 'Make a logo'] },
  { key: 'data_analyst', role: 'Data analyst', blurb: 'Cleans data and finds trends', icon: 'BarChart3', first: 'Kenji', name: 'Kenji Watanabe', personality: 'Quiet and precise. Loves a clean chart.', workingStyle: 'Checks the data first, states assumptions, ends with one paragraph.', voiceLabel: 'Low, calm', starters: ['Clean this data', 'Find the trend', 'Build a chart'] },
  { key: 'operations', role: 'Operations', blurb: 'Keeps work organised', icon: 'ClipboardList', first: 'Amara', name: 'Amara Diallo', personality: 'Organised and unflappable.', workingStyle: 'Keeps checklists, chases loose ends, reports once a day.', voiceLabel: 'Clear, steady', starters: ['Plan the week', 'Chase this up', 'Tidy my inbox'] },
  { key: 'sales', role: 'Sales', blurb: 'Finds leads and drafts outreach', icon: 'Handshake', first: 'Marcus', name: 'Marcus Reyes', personality: 'Friendly and direct. Never pushy.', workingStyle: 'Researches the lead first, drafts in your voice, asks before sending.', voiceLabel: 'Warm tenor, relaxed', starters: ['Find leads', 'Draft outreach', 'Prepare for a call'] },
  { key: 'writer', role: 'Writer', blurb: 'Drafts and edits text', icon: 'FileText', first: 'Hannah', name: 'Hannah Brooks', personality: 'Dry wit, tight prose.', workingStyle: 'Outlines first, edits twice, keeps your voice.', voiceLabel: 'Crisp, light', starters: ['Draft a post', 'Edit this', 'Write the docs'] },
];

export const presets: RolePreset[] = CAST.map((c) => ({
  key: c.key, role: c.role, blurb: c.blurb, icon: c.icon,
  workingStyle: c.workingStyle, starters: c.starters,
  defaultPermissions: defaultPermissions, defaultModel: 'claude-sonnet-5-5',
}));

export function personaOf(c: CastEntry): Persona {
  return {
    name: c.name, firstName: c.first, role: c.role, roleKey: c.key,
    personality: c.personality, workingStyle: c.workingStyle, starters: c.starters,
    portraitUrl: `/media/portraits/${c.first.toLowerCase()}.jpg`,
    voice: { provider: 'livekit', voiceId: `voice-${c.first.toLowerCase()}`, label: c.voiceLabel, sampleUrl: null },
    avatarId: null,
  };
}

/** One candidate per cast member, for the hire dialog. */
export const candidates: Candidate[] = CAST.map((c) => ({ token: `cand_${c.key}`, persona: personaOf(c) }));

const maya = personaOf(CAST[0]!);
const priya = personaOf(CAST[1]!);
const jonas = personaOf(CAST[2]!);
const ines = personaOf(CAST[3]!);

export const EMP = {
  maya: id('emp', 'maya'),
  priya: id('emp', 'priya'),
  jonas: id('emp', 'jonas'),
  ines: id('emp', 'ines'),
} as const;

function employee(p: Persona, eid: string, o: Partial<Employee>): Employee {
  return {
    id: eid, persona: p, permissions: defaultPermissions,
    state: 'idle', stateDetail: p.role, stateSinceMs: ago(HOUR),
    spaceId: `local:emp-${p.firstName.toLowerCase()}`, sessionId: null, model: 'claude-sonnet-5-5',
    unread: 0, lastActivityMs: ago(HOUR), screenGrant: null, desktopSinceMs: ago(3 * HOUR),
    pendingRestart: false, controlledByUser: false, createdMs: ago(3 * DAY),
    ...o,
  };
}

/** Sidebar order of the demo (UX spec 6.3): Maya needs you, Priya working, Jonas idle, Ines idle. */
export const employees: Employee[] = [
  employee(maya, EMP.maya, { state: 'needs_you', stateDetail: 'Deploy to staging', stateSinceMs: ago(2 * MIN), unread: 2, lastActivityMs: ago(2 * MIN) }),
  employee(priya, EMP.priya, { state: 'working', stateDetail: 'Drafting the launch email', stateSinceMs: ago(40 * MIN), unread: 1, lastActivityMs: ago(HOUR) }),
  employee(jonas, EMP.jonas, { state: 'idle', stateDetail: 'Researcher', lastActivityMs: ago(2 * DAY) }),
  employee(ines, EMP.ines, { state: 'idle', stateDetail: 'Designer', lastActivityMs: ago(2 * DAY + 3 * HOUR) }),
];

export interface ThreadFixture {
  messages: Message[]; steps: ActivityStep[]; approvals: Approval[]; task: Task | null;
}

function msg(n: number, eid: string, from: Message['from'], text: string, createdMs: number, o: Partial<Message> = {}): Message {
  return {
    id: id('msg', `${eid.slice(4, 8)}${n}`), employeeId: eid, from, kind: 'text', text,
    taskId: null, createdMs, seenMs: from === 'user' ? createdMs + 2000 : null, ...o,
  };
}
function step(n: number, eid: string, taskId: string, sentence: string, startedMs: number, status: ActivityStep['status'] = 'ok', o: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: id('evt', `${eid.slice(4, 8)}${n}`), employeeId: eid, taskId, sentence, status,
    startedMs, endedMs: status === 'running' ? null : startedMs + 40_000, ...o,
  };
}
function task(tag: string, eid: string, o: Partial<Task>): Task {
  return {
    id: id('tsk', tag), employeeId: eid, title: '', assignedBy: 'user', status: 'running', plan: [],
    outcome: null, assignedMs: ago(HOUR), finishedMs: null, activeMs: 0, costUsd: 0,
    inputTokens: 0, outputTokens: 0, numTurns: 0, traceId: null, ...o,
  };
}

const mayaTask = task('maya1', EMP.maya, {
  title: 'Fix the checkout button on mobile', status: 'blocked', assignedMs: ago(55 * MIN), activeMs: 6 * MIN,
  costUsd: 0.42, inputTokens: 51_200, outputTokens: 4_800, numTurns: 14,
  plan: [
    { title: 'Reproduce the bug', status: 'done' },
    { title: 'Find the cause', status: 'done' },
    { title: 'Fix the button handler', status: 'done' },
    { title: 'Run the tests', status: 'done' },
    { title: 'Deploy to staging', status: 'in_progress' },
  ],
});
const priyaTask = task('priya1', EMP.priya, {
  title: 'Write the launch email', status: 'running', assignedMs: ago(40 * MIN), activeMs: 21 * MIN,
  costUsd: 0.31, inputTokens: 38_900, outputTokens: 6_100, numTurns: 11,
  plan: [
    { title: 'Read the product notes', status: 'done' },
    { title: 'Check three competitor emails', status: 'done' },
    { title: 'Draft three subject lines', status: 'in_progress' },
    { title: 'Write the email body', status: 'pending' },
    { title: 'Send a test to you', status: 'pending' },
  ],
});
const jonasTask = task('jonas1', EMP.jonas, {
  title: 'Compare the three hosting vendors', status: 'done', assignedMs: ago(2 * DAY + 2 * HOUR), finishedMs: ago(2 * DAY),
  activeMs: 34 * MIN, costUsd: 0.78, inputTokens: 96_000, outputTokens: 9_400, numTurns: 22,
  outcome: 'Vendor B is cheapest at your scale; vendor C has the best uptime record.',
  plan: [
    { title: 'List the vendors', status: 'done' },
    { title: 'Collect pricing', status: 'done' },
    { title: 'Check uptime reports', status: 'done' },
    { title: 'Write the comparison', status: 'done' },
  ],
});
const inesTask = task('ines1', EMP.ines, {
  title: 'Sketch two homepage layouts', status: 'done', assignedMs: ago(2 * DAY + 5 * HOUR), finishedMs: ago(2 * DAY + 3 * HOUR),
  activeMs: 27 * MIN, costUsd: 0.55, inputTokens: 70_000, outputTokens: 7_800, numTurns: 17,
  outcome: 'Two layouts ready in the shared folder; I prefer the second.',
  plan: [
    { title: 'Review the current page', status: 'done' },
    { title: 'Sketch direction one', status: 'done' },
    { title: 'Sketch direction two', status: 'done' },
  ],
});

function approval(tag: string, eid: string, taskId: string, o: Partial<Approval>): Approval {
  return {
    id: id('apr', tag), employeeId: eid, taskId, title: '', detail: '', kind: 'big_step',
    status: 'pending', createdMs: ago(MIN), resolvedMs: null, ...o,
  };
}

export const threads: Record<string, ThreadFixture> = {
  [EMP.maya]: {
    task: mayaTask,
    messages: [
      msg(1, EMP.maya, 'user', 'The checkout button does nothing on mobile. Can you fix it?', ago(55 * MIN), { taskId: mayaTask.id }),
      msg(2, EMP.maya, 'employee', 'On it. I will reproduce it first, then fix it.', ago(54 * MIN), { taskId: mayaTask.id }),
      msg(3, EMP.maya, 'employee', 'Found it: the handler throws when the cart is empty. Fixed, and the tests pass.', ago(8 * MIN), { taskId: mayaTask.id }),
      msg(4, EMP.maya, 'employee', 'The fix is ready. I need your approval to deploy it to staging.', ago(2 * MIN), { taskId: mayaTask.id }),
    ],
    steps: [
      step(1, EMP.maya, mayaTask.id, 'Opened the staging site', ago(53 * MIN)),
      step(2, EMP.maya, mayaTask.id, 'Reproduced the bug', ago(48 * MIN)),
      step(3, EMP.maya, mayaTask.id, 'Read the checkout code', ago(40 * MIN)),
      step(4, EMP.maya, mayaTask.id, 'Fixed the button handler', ago(25 * MIN)),
      step(5, EMP.maya, mayaTask.id, 'Ran the tests', ago(10 * MIN)),
      step(6, EMP.maya, mayaTask.id, 'Asked Priya about the copy', ago(6 * MIN), 'ok', { peer: { employeeId: EMP.priya, direction: 'to', text: 'Is the new button label approved?' } }),
    ],
    approvals: [
      approval('maya1', EMP.maya, mayaTask.id, { title: 'Deploy to staging', detail: 'Runs deploy.sh on staging.example.com', createdMs: ago(2 * MIN) }),
    ],
  },
  [EMP.priya]: {
    task: priyaTask,
    messages: [
      msg(1, EMP.priya, 'user', 'Write the launch email for the new pricing page.', ago(40 * MIN), { taskId: priyaTask.id }),
      msg(2, EMP.priya, 'employee', 'Happy to. I will look at three competitor emails first.', ago(39 * MIN), { taskId: priyaTask.id }),
      msg(3, EMP.priya, 'employee', 'Two directions so far: plain and friendly, or short and bold. Which do you prefer?', ago(HOUR - 20 * MIN), { taskId: priyaTask.id, kind: 'question' }),
    ],
    steps: [
      step(1, EMP.priya, priyaTask.id, 'Read the product notes', ago(38 * MIN)),
      step(2, EMP.priya, priyaTask.id, 'Opened three competitor emails', ago(30 * MIN)),
      step(3, EMP.priya, priyaTask.id, 'Drafting three subject lines', ago(3 * MIN), 'running'),
    ],
    approvals: [
      approval('priya1', EMP.priya, priyaTask.id, { title: 'Send a test email to you', detail: 'Sends one email to your address', status: 'approved', createdMs: ago(15 * MIN), resolvedMs: ago(14 * MIN) }),
    ],
  },
  [EMP.jonas]: {
    task: jonasTask,
    messages: [
      msg(1, EMP.jonas, 'user', 'Compare the three hosting vendors for us.', ago(2 * DAY + 2 * HOUR), { taskId: jonasTask.id }),
      msg(2, EMP.jonas, 'employee', 'Vendor B is cheapest at your scale; vendor C has the best uptime record. Sources are in my notes.', ago(2 * DAY), { taskId: jonasTask.id, kind: 'done' }),
      msg(3, EMP.jonas, 'system', 'Call with Jonas · 8 min', ago(DAY + 2 * HOUR), { kind: 'system' }),
    ],
    steps: [
      step(1, EMP.jonas, jonasTask.id, 'Listed the three vendors', ago(2 * DAY + HOUR + 40 * MIN)),
      step(2, EMP.jonas, jonasTask.id, 'Collected the pricing', ago(2 * DAY + HOUR + 20 * MIN)),
      step(3, EMP.jonas, jonasTask.id, 'Checked the uptime reports', ago(2 * DAY + HOUR)),
      step(4, EMP.jonas, jonasTask.id, 'Wrote the comparison', ago(2 * DAY + 10 * MIN)),
    ],
    approvals: [
      approval('jonas1', EMP.jonas, jonasTask.id, { title: 'Open a paid report', detail: 'Opens a report that needs a free account', status: 'approved', createdMs: ago(2 * DAY + HOUR), resolvedMs: ago(2 * DAY + HOUR - MIN) }),
    ],
  },
  [EMP.ines]: {
    task: inesTask,
    messages: [
      msg(1, EMP.ines, 'user', 'Sketch two layouts for the homepage.', ago(2 * DAY + 5 * HOUR), { taskId: inesTask.id }),
      msg(2, EMP.ines, 'employee', 'Two layouts ready in the shared folder. I prefer the second, it gives the pricing more room.', ago(2 * DAY + 3 * HOUR), { taskId: inesTask.id, kind: 'done' }),
    ],
    steps: [
      step(1, EMP.ines, inesTask.id, 'Reviewed the current page', ago(2 * DAY + 4 * HOUR + 30 * MIN)),
      step(2, EMP.ines, inesTask.id, 'Sketched direction one', ago(2 * DAY + 4 * HOUR)),
      step(3, EMP.ines, inesTask.id, 'Sketched direction two', ago(2 * DAY + 3 * HOUR + 30 * MIN)),
    ],
    approvals: [
      approval('ines1', EMP.ines, inesTask.id, { title: 'Install a font tool', detail: 'Runs npm install in her desktop', status: 'denied', createdMs: ago(2 * DAY + 4 * HOUR), resolvedMs: ago(2 * DAY + 4 * HOUR - MIN) }),
    ],
  },
};

export function teamReport(range: TeamReport['range']): TeamReport {
  const k = range === 'today' ? 1 : range === 'week' ? 5 : 20;
  const rows = [
    { e: employees[0]!, active: 62, done: 2, failed: 0, cost: 0.84 },
    { e: employees[1]!, active: 48, done: 1, failed: 0, cost: 0.61 },
    { e: employees[2]!, active: 34, done: 1, failed: 0, cost: 0.78 },
    { e: employees[3]!, active: 27, done: 1, failed: 1, cost: 0.55 },
  ].map((r) => ({
    employeeId: r.e.id, name: r.e.persona.name, role: r.e.persona.role, portraitUrl: r.e.persona.portraitUrl,
    activeMs: r.active * k * MIN, tasksDone: r.done * k, tasksFailed: r.failed * (k > 1 ? k - 1 : 0),
    costUsd: Math.round(r.cost * k * 100) / 100, lastActivityMs: r.e.lastActivityMs,
  }));
  const sum = (f: (r: (typeof rows)[number]) => number): number => rows.reduce((a, r) => a + f(r), 0);
  return {
    range,
    totals: { activeMs: sum((r) => r.activeMs), tasksDone: sum((r) => r.tasksDone), costUsd: Math.round(sum((r) => r.costUsd) * 100) / 100 },
    previous: range === 'month' ? null : { activeMs: Math.round(sum((r) => r.activeMs) * 0.8), tasksDone: Math.max(sum((r) => r.tasksDone) - 2, 0), costUsd: Math.round(sum((r) => r.costUsd) * 0.9 * 100) / 100 },
    rows, source: 'local', syncedMs: null,
  };
}

export const settings: Settings = {
  userName: 'Suhaan', appearance: 'system', notifyMessages: true, notifyDone: true, captions: true,
};

export const capabilities: Capabilities = {
  llm: true, desktops: 'mock', calls: 'audio', databricks: false, genie: false, hostScreen: true,
};

export function callInfo(employeeIds: string[]): CallInfo {
  return {
    id: id('call', 'fixture'), employeeIds, livekitUrl: '', token: '', room: 'fixture',
    mode: 'audio', mock: true, startedMs: ago(2 * MIN),
  };
}
