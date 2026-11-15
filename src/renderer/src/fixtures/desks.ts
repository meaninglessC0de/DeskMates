import type { Employee } from '../../../shared';
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
  const t = (tk: typeof maya, steps: ThreadFixture['steps'], approvals: ThreadFixture['approvals'] = []): ThreadFixture => ({ messages: [], steps, approvals, task: tk });
  const threads: Record<string, ThreadFixture> = {
    [EMP.maya]: t(maya, [
      step(21, EMP.maya, maya.id, 'Set up the page', ago(12 * MIN)),
      step(22, EMP.maya, maya.id, 'Added the plans table', ago(9 * MIN)),
      step(23, EMP.maya, maya.id, 'Messaged Ines', ago(5 * MIN), 'ok', { peer: peer(EMP.ines, 'Which hero layout did you pick? I am starting on the page structure.') }),
      step(24, EMP.maya, maya.id, 'Ran the tests', ago(40 * SEC)),
    ], [approval('dw-maya', EMP.maya, maya.id, { title: 'Publish with git push', detail: 'Pushes the page to staging', createdMs: ago(20 * SEC) })]),
    [EMP.priya]: t(priya, [
      step(21, EMP.priya, priya.id, 'Read the product notes', ago(12 * MIN)),
      step(22, EMP.priya, priya.id, 'Messaged Jonas', ago(9 * MIN), 'ok', { peer: peer(EMP.jonas, 'Can you pull competitor pricing for the three plans? I need numbers for the copy.') }),
      step(23, EMP.priya, priya.id, 'Wrote the plan descriptions', ago(2 * MIN)),
      step(24, EMP.priya, priya.id, 'Messaged Maya', ago(1500), 'ok', { peer: peer(EMP.maya, 'Headline and the three plan descriptions are ready. I am pasting them into the shared doc you have open now. The annual price note still needs a decision, so I left a gap under the table and flagged it in yellow.') }),
    ]),
    [EMP.jonas]: t(jonas, [
      step(21, EMP.jonas, jonas.id, 'Listed the competitors', ago(8 * MIN)),
      step(22, EMP.jonas, jonas.id, 'Messaged Priya', ago(7 * MIN), 'ok', { peer: peer(EMP.priya, 'Two of the three publish their prices. Sending the table now. The third is behind a sales form, so I will estimate from a review site and mark it as an estimate.') }),
    ]),
    [EMP.ines]: t(ines, [
      step(21, EMP.ines, ines.id, 'Reviewed the brand', ago(8 * MIN)),
      step(22, EMP.ines, ines.id, 'Sketched the table', ago(5 * MIN)),
      step(23, EMP.ines, ines.id, 'Messaged Maya', ago(3 * MIN), 'ok', { peer: peer(EMP.maya, 'Go with the second layout, the table gets more room. Colours are in the shared folder.') }),
      step(24, EMP.ines, ines.id, 'Sketched the hero section', ago(20 * SEC)),
    ]),
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

export function desksFixture(name: string): { employees: Employee[]; threads: Record<string, ThreadFixture> } | null {
  if (name.startsWith('working')) return working();
  if (name === 'quiet') return quiet();
  return null;
}
