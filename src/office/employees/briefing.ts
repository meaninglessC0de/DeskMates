import type { Employee, PlanStep, Task } from '../../shared/index.ts';

const LEVELS: Record<Employee['permissions']['level'], string> = {
  asks_first: 'asks first',
  asks_big_steps: 'asks before big steps',
  independent: 'works independently',
};

export function permissionLine(p: Employee['permissions']): string {
  const on = (b: boolean) => (b ? 'on' : 'off');
  return `Permission level: ${LEVELS[p.level]}. Internet: ${on(p.internet)}. Commands: ${on(p.commands)}. Manager's screen: ${
    p.myScreen ? 'only if you ask' : 'off'
  }. Messaging teammates: ${on(p.teammates)}.`;
}

function planLine(plan: PlanStep[]): string {
  if (plan.length === 0) return 'none';
  return plan.map((s, i) => `${i + 1}. ${s.title} (${s.status === 'in_progress' ? 'in progress' : s.status})`).join('; ');
}

export interface BriefingInput {
  now: Date;
  userName: string;
  employee: Employee;
  teammates: { firstName: string; role: string; state: string }[];
  notes: string[];
  task: Task | null;
}

/** The first item of every new or resumed session (employee-runtime.md 4.7). No tags: the runtime wraps it. */
export function buildBriefing(i: BriefingInput): string {
  const date = i.now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/,/g, '');
  const mates = i.teammates.length
    ? i.teammates.map((t) => `${t.firstName} (${t.role}, ${t.state.replace('_', ' ')})`).join(', ')
    : 'none yet';
  return [
    'Briefing for this session.',
    `Date: ${date}.`,
    `Your manager: ${i.userName}.`,
    permissionLine(i.employee.permissions),
    `Your teammates: ${mates}.`,
    'Your notes:',
    ...(i.notes.length ? i.notes.slice(-40).map((n) => `- ${n}`) : ['- none']),
    `Open task: ${i.task ? i.task.title : 'none'}.`,
    `Plan so far: ${i.task ? planLine(i.task.plan) : 'none'}.`,
  ].join('\n');
}
