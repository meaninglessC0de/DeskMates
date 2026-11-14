// Two employees: one exchange through message_colleague, then a ping-pong that the guard must stop. About 5 cents with Haiku.
import { Client, OfficeProc, Report, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-colleagues');
skipWithoutKey(report.name);
const args = parseArgs();
let office: OfficeProc | null = null;
let client: Client | null = null;

await run(report, () => office, () => client, async () => {
  office = new OfficeProc(args);
  if (!args.attach) {
    office.clean();
    await office.start();
  }
  const c = (client = new Client(office.base));
  await c.connect();
  const maya = await c.hire('web_developer');
  await c.waitFor('Maya greeting', isMsg(maya.id, 'employee', 'text'), 0, 240_000);
  const ines = await c.hire('designer');
  await c.waitFor('Ines greeting', isMsg(ines.id, 'employee', 'text'), 0, 240_000);
  await Promise.all([c.waitFor('Maya idle', isState(maya.id, 'idle')), c.waitFor('Ines idle', isState(ines.id, 'idle'))]);

  // 1. one exchange
  let mark = c.mark();
  await c.say(maya.id, 'Ask Ines (the designer) which colour the main button should be, using message_colleague, wait for her reply, then tell me what she said.');
  const asked = await c.waitFor('Maya messages Ines', (e): e is Extract<typeof e, { type: 'step' }> =>
    e.type === 'step' && e.step.employeeId === maya.id && e.step.peer?.direction === 'to', mark, 180_000);
  report.check(true, 'Maya messaged Ines', `step "${asked.step.sentence}" text "${asked.step.peer?.text.slice(0, 80)}"`);
  const arrived = await c.waitFor('Ines gets it', (e): e is Extract<typeof e, { type: 'step' }> =>
    e.type === 'step' && e.step.employeeId === ines.id && e.step.peer?.direction === 'from', mark, 60_000);
  report.check(true, 'it arrived in Ines\' thread', `step "${arrived.step.sentence}"`);
  const replied = await c.waitFor('Ines replies', (e): e is Extract<typeof e, { type: 'step' }> =>
    e.type === 'step' && e.step.employeeId === maya.id && e.step.peer?.direction === 'from', mark, 180_000).catch(() => null);
  report.check(!!replied, 'Ines answered through message_colleague and it reached Maya', replied ? `step "${replied.step.sentence}": "${replied.step.peer?.text.slice(0, 80)}"` : 'no reply');
  const repliedAt = replied ? c.log.findIndex((x) => x.e === replied) : mark;
  const answer = await c.waitFor('Maya reports Ines\'s answer', isMsg(maya.id, 'employee'), repliedAt, 180_000).catch(() => null);
  report.check(!!answer, 'after the reply Maya told her manager', `"${answer?.message.text.slice(0, 140)}"`);
  await Promise.all([c.waitFor('Maya idle', isState(maya.id, 'idle'), mark, 120_000), c.waitFor('Ines idle', isState(ines.id, 'idle'), mark, 120_000).catch(() => null)]);

  // 2. a loop the guard must stop
  mark = c.mark();
  await c.say(maya.id, 'Play ping-pong with Ines: message her "ping" with message_colleague, and tell her to answer "pong" and message you "ping" back, and so on. Never stop; always answer her messages with message_colleague.');
  await new Promise((r) => setTimeout(r, 90_000));
  const sent = new Map<string, string>();
  for (const s of c.events('step', mark)) if (s.step.peer?.direction === 'to') sent.set(s.step.id, s.step.employeeId);
  report.check(sent.size >= 2, 'the ping-pong started', `${sent.size} messages between them`);
  report.check(sent.size <= 4, 'the guard stopped the chain (at most 3 employee-to-employee messages, plus one slack)', `${sent.size} messages`);
  const before = sent.size;
  await new Promise((r) => setTimeout(r, 30_000));
  const after = new Set(c.events('step', mark).filter((s) => s.step.peer?.direction === 'to').map((s) => s.step.id)).size;
  report.check(after === before, 'no more messages once stopped', `${before} -> ${after}`);
  const [m, i] = await Promise.all([c.employee(maya.id), c.employee(ines.id)]);
  console.log(`INFO final states: Maya ${m.state}, Ines ${i.state}`);
  await c.api('POST', `/api/employees/${maya.id}/pause`);
  await c.api('POST', `/api/employees/${ines.id}/pause`);
  report.cost = (await c.api<{ totals: { costUsd: number } }>('GET', '/api/team?range=today')).data.totals.costUsd;
});
