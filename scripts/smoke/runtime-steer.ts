// Steering: a slow task, then "actually name it hi.txt" while she is mid-way; the final file is hi.txt. About 3 cents with Haiku.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, OfficeProc, Report, bootAndHire, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-steer');
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
  await c.say(e.id, 'Run `sleep 25` in the shell first, and only after it has finished create a file called hello.txt in ~/work containing the word hello. Then tell me you are done.');
  const sleeping = await c.waitFor('a step', (ev): ev is Extract<typeof ev, { type: 'step' }> => ev.type === 'step' && ev.step.employeeId === e.id, before, 120_000);
  report.pass('she started working', `step "${sleeping.step.sentence}"`);
  await new Promise((r) => setTimeout(r, 4000));
  const sentAt = Date.now();
  const mark = c.mark();
  const msg = await c.say(e.id, 'actually name it hi.txt');
  const seen = await c.waitFor('message_seen', (ev): ev is Extract<typeof ev, { type: 'message_seen' }> => ev.type === 'message_seen' && ev.id === msg.id, mark, 120_000);
  report.pass('the steering message was marked seen', `${((seen.seenMs - sentAt) / 1000).toFixed(1)} s after sending`);
  await c.waitFor('a done bubble', isMsg(e.id, 'employee', 'done'), before, 240_000);
  await c.waitFor('idle', isState(e.id, 'idle'), before, 30_000);
  const dir = path.join(office.dataDir, 'mock-spaces', e.id, 'work');
  const hi = path.join(dir, 'hi.txt');
  report.check(existsSync(hi), 'hi.txt exists', existsSync(hi) ? readFileSync(hi, 'utf8').trim() : 'missing');
  report.check(!existsSync(path.join(dir, 'hello.txt')), 'hello.txt does not exist (she followed the change)', existsSync(path.join(dir, 'hello.txt')) ? 'it exists too' : '');
  await c.taskWhen(e.id, (t) => t.costUsd > 0);
});
