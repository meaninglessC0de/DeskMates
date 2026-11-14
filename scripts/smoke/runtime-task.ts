// A small task on the mock desktop: a plan or steps, a done bubble, the file present, cost recorded. About 2 cents with Haiku.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, OfficeProc, Report, bootAndHire, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-task');
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
  await c.say(e.id, "Create a file called hello.txt in ~/work containing today's date, then tell me you're done");
  const done = await c.waitFor('a done bubble', isMsg(e.id, 'employee', 'done'), before, 180_000);
  await c.waitFor('idle', isState(e.id, 'idle'), before, 30_000);
  const file = path.join(office.dataDir, 'mock-spaces', e.id, 'work', 'hello.txt');
  const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  report.check(existsSync(file), 'hello.txt exists in the desktop', text);
  report.check(/2026|nov|14|11/i.test(text), 'it contains a date', text);
  const steps = c.events('step', before);
  const plans = c.events('task', before).filter((t) => t.task.plan.length > 0);
  report.check(steps.length > 0 || plans.length > 0, 'steps or a plan were reported', `${new Set(steps.map((s) => s.step.id)).size} steps, ${plans.length} plan updates; ${[...new Set(steps.map((s) => s.step.sentence))].join(' | ')}`);
  report.check(done.message.text.length > 10, 'the done bubble has a summary', `"${done.message.text.slice(0, 120)}"`);
  const task = await c.taskWhen(e.id, (t) => t.costUsd > 0 && t.status === 'done');
  report.check(task?.status === 'done', 'the task closed as done', task?.status);
  report.check((task?.costUsd ?? 0) > 0 && (task?.numTurns ?? 0) > 0, 'cost and turns recorded', `${task?.costUsd} USD, ${task?.numTurns} turns, ${task?.inputTokens}/${task?.outputTokens} tokens`);
  report.check(/^[\w .,'"-]{1,40}$/.test(steps.at(-1)?.step.sentence ?? 'x'), 'step sentences carry no paths or tool names', '');
  report.check(!steps.some((s) => /mcp__|\/|~/.test(s.step.sentence)), 'no path or tool name in any step sentence', '');
});
