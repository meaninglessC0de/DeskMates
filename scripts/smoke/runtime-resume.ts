// Kill office (SIGKILL) in the middle of a task and start it again on the same data: the session resumes and finishes.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, OfficeProc, Report, bootAndHire, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-resume');
skipWithoutKey(report.name);
const args = parseArgs();
let office: OfficeProc | null = null;
let client: Client | null = null;

await run(report, () => office, () => client, async () => {
  const b = await bootAndHire(args, 'web_developer');
  office = b.office;
  let c = (client = b.c);
  const { e } = b;
  const sessionBefore = (await c.employee(e.id)).sessionId;
  const costBefore = () => c.api<{ totals: { costUsd: number } }>('GET', '/api/team?range=today').then((r) => r.data.totals.costUsd);
  const mark = c.mark();
  await c.say(e.id, 'Run `sleep 40` in the shell first, then create a file called done.txt in ~/work containing the word resumed. Then tell me you are done.');
  await c.waitFor('she starts the command', (ev): ev is Extract<typeof ev, { type: 'step' }> => ev.type === 'step' && ev.step.employeeId === e.id, mark, 120_000);
  await new Promise((r) => setTimeout(r, 3000));
  const taskBefore = await c.taskOf(e.id);
  report.check(taskBefore?.status === 'running', 'a task is open and running', taskBefore?.title);
  const spent = await costBefore();
  office.kill();
  c.close();
  console.log('INFO office killed with SIGKILL mid-task');
  await new Promise((r) => setTimeout(r, 1500));
  await office.start();
  c = client = new Client(office.base);
  await c.connect();
  const restartedAt = c.mark();
  const done = await c.waitFor('a done bubble after the restart', isMsg(e.id, 'employee', 'done'), restartedAt, 300_000);
  await c.waitFor('idle', isState(e.id, 'idle'), restartedAt, 60_000).catch(() => {});
  const file = path.join(office.dataDir, 'mock-spaces', e.id, 'work', 'done.txt');
  report.check(existsSync(file), 'done.txt exists after the restart', existsSync(file) ? readFileSync(file, 'utf8').trim() : 'missing');
  const emp = await c.employee(e.id);
  report.check(emp.sessionId === sessionBefore, 'the same session resumed', `${sessionBefore} -> ${emp.sessionId}`);
  report.check(done.message.text.length > 5, 'she finished and reported', `"${done.message.text.slice(0, 120)}"`);
  const total = await costBefore();
  report.check(total >= spent && total - spent < 1, 'cost after the resume is the delta, not a double count', `${spent.toFixed(4)} -> ${total.toFixed(4)} USD`);
  const task = await c.taskWhen(e.id, (t) => t.status === 'done');
  report.check(task?.status === 'done', 'the task closed as done', task?.status);
});
