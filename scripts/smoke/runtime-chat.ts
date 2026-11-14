// "hi, who are you?" -> one bubble, state idle, no task. Needs ANTHROPIC_API_KEY. About one cent.
import { Client, OfficeProc, Report, bootAndHire, isMsg, parseArgs, run, skipWithoutKey, type Ev } from './runtime-lib.ts';

const report = new Report('runtime-chat');
skipWithoutKey(report.name);
const args = parseArgs();
let office: OfficeProc | null = null;
let client: Client | null = null;

await run(report, () => office, () => client, async () => {
  const b = await bootAndHire(args, 'web_developer');
  office = b.office;
  client = b.c;
  const { c, e } = b;
  const before = c.mark();
  await c.say(e.id, 'hi, who are you?');
  const reply = await c.waitFor('a reply bubble', isMsg(e.id, 'employee', 'text'), before, 90_000);
  await new Promise((r) => setTimeout(r, 3000));
  const bubbles = c.events('message', before).filter((m) => m.message.from === 'employee');
  const thread = await c.thread(e.id);
  const now = await c.employee(e.id);
  report.check(bubbles.length === 1, 'exactly one bubble', `"${reply.message.text.slice(0, 100)}"`);
  report.check(reply.message.text.toLowerCase().includes(e.persona.firstName.toLowerCase()), 'the reply says who she is', e.persona.firstName);
  report.check(!/^#|\*\*|\|---/m.test(reply.message.text), 'no markdown headings or tables');
  report.check(now.state === 'idle', 'state is idle', now.state);
  report.check(thread.task === null || thread.task.status !== 'running', 'no open task', JSON.stringify(thread.task && { title: thread.task.title, status: thread.task.status }));
  report.check(!!now.sessionId && !now.sessionId.startsWith('mock-'), 'session id captured', now.sessionId ?? 'none');
  const tasks = c.events('task').length;
  report.check(tasks === 0, 'no task event for small talk', `${tasks} task events`);
  void (undefined as unknown as Ev<'step'>);
});
