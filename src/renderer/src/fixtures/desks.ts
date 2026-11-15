import type { Employee, Message } from '../../../shared';
import { EMP, ago, approval, employees, step, task } from './data';
import type { ThreadFixture } from './data';

/**
 * Fixture states for the Desks view without an office (`?shot=desks/working`, `desks/quiet`).
 * `working`: four people mid-task on one project, a live bubble (the newest message, a moment old) and five messages
 * between desks. `quiet`: nobody is talking; the messages rail shows its empty state.
 */
const SEC = 1000;
const MIN = 60 * SEC;

const byId = (id: string): Employee => employees.find((e) => e.id === id)!;
const peer = (to: string, text: string) => ({ employeeId: to, direction: 'to' as const, text });

const say = (n: number, eid: string, from: Message['from'], kind: Message['kind'], text: string, createdMs: number): Message => ({
  id: `msg_DW${String(n).padStart(2, '0')}${eid.slice(4, 8).toUpperCase()}`.padEnd(30, '0'), employeeId: eid, from, kind, text, taskId: null, createdMs, seenMs: null,
});

function working(): { employees: Employee[]; threads: Record<string, ThreadFixture> } {
  const maya = task('dw-maya', EMP.maya, {
    title: 'Build the pricing page', assignedMs: ago(14 * MIN),
    plan: [
      { title: 'Set up the page', status: 'done' }, { title: 'Add the plans table', status: 'done' }, { title: 'Wire up the toggle', status: 'done' },
      { title: 'Run the tests', status: 'done' }, { title: 'Publish to staging', status: 'in_progress' },
    ],
  });
  const priya = task('dw-priya', EMP.priya, {
    title: 'Write the pricing page copy', assignedMs: ago(13 * MIN),
    plan: [
      { title: 'Read the notes', status: 'done' }, { title: 'Draft the headline', status: 'done' }, { title: 'Write the plan descriptions', status: 'done' }, { title: 'Hand over to Maya', status: 'in_progress' },
    ],
  });
  const jonas = task('dw-jonas', EMP.jonas, {
    title: 'Check competitor pricing', assignedMs: ago(12 * MIN),
    plan: [{ title: 'List the competitors', status: 'done' }, { title: 'Collect their prices', status: 'in_progress' }, { title: 'Write the summary', status: 'pending' }],
  });
  const ines = task('dw-ines', EMP.ines, {
    title: 'Design the pricing table', assignedMs: ago(11 * MIN),
    plan: [{ title: 'Review the brand', status: 'done' }, { title: 'Sketch the table', status: 'done' }, { title: 'Pick the colours', status: 'in_progress' }],
  });
  const t = (tk: typeof maya, steps: ThreadFixture['steps'], approvals: ThreadFixture['approvals'] = [], messages: Message[] = []): ThreadFixture => ({ messages, steps, approvals, task: tk });
  const brief = 'Launch the new pricing page by the end of the day. Maya builds it, Priya writes the copy, Jonas checks competitors, Ines designs the table.';
  const threads: Record<string, ThreadFixture> = {
    [EMP.maya]: t(maya, [
      step(21, EMP.maya, maya.id, 'Set up the page', ago(12 * MIN)),
      step(22, EMP.maya, maya.id, 'Added the plans table', ago(9 * MIN)),
      step(23, EMP.maya, maya.id, 'Messaged Ines', ago(5 * MIN), 'ok', { peer: peer(EMP.ines, 'Which hero layout did you pick? I am starting on the page structure.') }),
      step(24, EMP.maya, maya.id, 'Ran the tests', ago(40 * SEC)),
    ], [approval('dw-maya', EMP.maya, maya.id, { title: 'Publish with git push', detail: 'Pushes the page to staging', createdMs: ago(20 * SEC) })], [
      say(1, EMP.maya, 'user', 'text', brief, ago(14 * MIN)),
      say(2, EMP.maya, 'user', 'text', 'Maya, use the staging site for the first publish.', ago(4 * MIN)),
      say(3, EMP.maya, 'employee', 'question', 'The tests pass. Can I publish this to staging with git push?', ago(15 * SEC)),
    ]),
    [EMP.priya]: t(priya, [
      step(21, EMP.priya, priya.id, 'Read the product notes', ago(12 * MIN)),
      step(22, EMP.priya, priya.id, 'Messaged Jonas', ago(9 * MIN), 'ok', { peer: peer(EMP.jonas, 'Can you pull competitor pricing for the three plans? I need numbers for the copy.') }),
      step(23, EMP.priya, priya.id, 'Wrote the plan descriptions', ago(2 * MIN)),
      step(24, EMP.priya, priya.id, 'Messaged Maya', ago(1500), 'ok', { peer: peer(EMP.maya, 'Headline and the three plan descriptions are ready. I am pasting them into the shared doc you have open now. The annual price note still needs a decision, so I left a gap under the table and flagged it in yellow.') }),
    ], [], [say(1, EMP.priya, 'user', 'text', brief, ago(14 * MIN))]),
    [EMP.jonas]: t(jonas, [
      step(21, EMP.jonas, jonas.id, 'Listed the competitors', ago(8 * MIN)),
      step(22, EMP.jonas, jonas.id, 'Messaged Priya', ago(7 * MIN), 'ok', { peer: peer(EMP.priya, 'Two of the three publish their prices. Sending the table now. The third is behind a sales form, so I will estimate from a review site and mark it as an estimate.') }),
    ], [], [
      say(1, EMP.jonas, 'user', 'text', brief, ago(14 * MIN)),
      say(2, EMP.jonas, 'employee', 'done', 'The competitor table is in the shared folder. Two prices are published, one is an estimate.', ago(6 * MIN)),
    ]),
    [EMP.ines]: t(ines, [
      step(21, EMP.ines, ines.id, 'Reviewed the brand', ago(8 * MIN)),
      step(22, EMP.ines, ines.id, 'Sketched the table', ago(5 * MIN)),
      step(23, EMP.ines, ines.id, 'Messaged Maya', ago(3 * MIN), 'ok', { peer: peer(EMP.maya, 'Go with the second layout, the table gets more room. Colours are in the shared folder.') }),
      step(24, EMP.ines, ines.id, 'Sketched the hero section', ago(20 * SEC)),
    ], [], [say(1, EMP.ines, 'user', 'text', brief, ago(14 * MIN))]),
  };
  const state = (id: string, o: Partial<Employee>): Employee => ({ ...byId(id), unread: 0, ...o });
  return {
    employees: [
      state(EMP.maya, { state: 'needs_you', stateDetail: 'Publish with git push', lastActivityMs: ago(20 * SEC) }),
      state(EMP.priya, { state: 'working', stateDetail: 'Waiting for Maya', lastActivityMs: ago(1500) }),
      state(EMP.jonas, { state: 'working', stateDetail: 'Waiting for Priya', lastActivityMs: ago(7 * MIN) }),
      state(EMP.ines, { state: 'working', stateDetail: 'Picking the colours', lastActivityMs: ago(20 * SEC) }),
    ],
    threads,
  };
}

function quiet(): { employees: Employee[]; threads: Record<string, ThreadFixture> } {
  const done = (eid: string, tag: string, title: string, outcome: string): ThreadFixture => ({
    messages: [], steps: [], approvals: [],
    task: task(tag, eid, { title, status: 'done', outcome, finishedMs: ago(30 * MIN), plan: [{ title: 'Do it', status: 'done' }] }),
  });
  return {
    employees: employees.map((e) => ({ ...e, state: 'idle' as const, stateDetail: e.persona.role, unread: 0 })),
    threads: {
      [EMP.maya]: done(EMP.maya, 'dq-maya', 'Build the pricing page', 'The pricing page is live on staging and the tests pass.'),
      [EMP.priya]: { messages: [], steps: [], approvals: [], task: null },
      [EMP.jonas]: done(EMP.jonas, 'dq-jonas', 'Check competitor pricing', 'Two of three competitors publish prices; the table is in the shared folder.'),
      [EMP.ines]: { messages: [], steps: [], approvals: [], task: null },
    },
  };
}

/** The worst case for the pill: a long Working sentence, a long approval title, a Done desk, a Waiting desk. */
function worst(): { employees: Employee[]; threads: Record<string, ThreadFixture> } {
  const base = working();
  const maya = task('dx-maya', EMP.maya, { title: 'Write the launch post', assignedMs: ago(14 * MIN), plan: [{ title: 'Draft', status: 'done' }, { title: 'Style it', status: 'done' }, { title: 'Check it', status: 'in_progress' }] });
  const ines = task('dx-ines', EMP.ines, { title: 'Design the pricing table', assignedMs: ago(11 * MIN), plan: [{ title: 'Sketch', status: 'done' }, { title: 'Publish', status: 'in_progress' }] });
  const priya = task('dx-priya', EMP.priya, { title: 'Write the pricing page copy', status: 'done', assignedMs: ago(13 * MIN), finishedMs: ago(MIN), outcome: 'The launch post is now a styled web page, open in Firefox, and the copy is in the shared doc.', plan: [{ title: 'Write', status: 'done' }] });
  const t = (tk: typeof maya, steps: ThreadFixture['steps'], approvals: ThreadFixture['approvals'] = []): ThreadFixture => ({ messages: [], steps, approvals, task: tk });
  const threads: Record<string, ThreadFixture> = {
    ...base.threads,
    [EMP.maya]: t(maya, [step(31, EMP.maya, maya.id, 'The launch post is now a styled web page, open in Firefox and checked on a narrow window', ago(10 * SEC))]),
    [EMP.priya]: t(priya, []),
    [EMP.ines]: t(ines, [], [approval('dx-ines', EMP.ines, ines.id, { title: 'Publish the pricing page to the public website with git push', detail: '', createdMs: ago(20 * SEC) })]),
  };
  const employeesOut = base.employees.map((e) =>
    e.id === EMP.maya ? { ...e, state: 'working' as const, stateDetail: 'Checking the post' }
    : e.id === EMP.priya ? { ...e, state: 'idle' as const, stateDetail: 'Marketer' }
    : e.id === EMP.ines ? { ...e, state: 'needs_you' as const, stateDetail: 'Publish' }
    : e);
  return { employees: employeesOut, threads };
}

export function desksFixture(name: string): { employees: Employee[]; threads: Record<string, ThreadFixture> } | null {
  if (name === 'worst') return worst();
  if (name.startsWith('working')) return working();
  if (name === 'quiet') return quiet();
  return null;
}
