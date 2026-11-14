// Approvals at level "asks first": an Approval appears, approve through the API, it completes; then deny one and she says so.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, OfficeProc, Report, bootAndHire, isApproval, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-approval');
skipWithoutKey(report.name);
const args = parseArgs();
let office: OfficeProc | null = null;
let client: Client | null = null;

await run(report, () => office, () => client, async () => {
  const b = await bootAndHire(args, 'web_developer', { permissions: { level: 'asks_first' } });
  office = b.office;
  client = b.c;
  const { c, e } = b;
  const dir = path.join(office.dataDir, 'mock-spaces', e.id, 'work');
  report.check((await c.employee(e.id)).permissions.level === 'asks_first', 'level is asks_first');

  // 1. approve
  let mark = c.mark();
  await c.say(e.id, 'Create a file called note.txt in ~/work containing the word ok, then tell me you are done.');
  const pending = await c.waitFor('an approval', isApproval(e.id, 'pending'), mark, 120_000);
  report.check(pending.approval.kind === 'tool', 'an approval appeared', `${pending.approval.kind}: "${pending.approval.title}" / "${pending.approval.detail}"`);
  const state = await c.employee(e.id);
  report.check(state.state === 'needs_you', 'state is needs_you while it waits', state.state);
  report.check(!existsSync(path.join(dir, 'note.txt')), 'nothing was written before the answer');
  let approvals = 1;
  await c.decide(pending.approval.id, 'approve', 'task');
  // approvals of other families (shell then file) may follow: approve them for this task too
  const stop = Date.now() + 240_000;
  while (Date.now() < stop) {
    const ev = await Promise.race([
      c.waitFor('done', isMsg(e.id, 'employee', 'done'), mark, 2000).then(() => 'done' as const).catch(() => null),
      c.waitFor('another approval', isApproval(e.id, 'pending'), mark, 2000).then((x) => x).catch(() => null),
    ]);
    if (ev === 'done') break;
    const next = (await c.thread(e.id)).approvals.find((a) => a.status === 'pending');
    if (next) {
      approvals++;
      await c.decide(next.id, 'approve', 'task');
    }
  }
  report.check(existsSync(path.join(dir, 'note.txt')), 'the file exists after approval', existsSync(path.join(dir, 'note.txt')) ? readFileSync(path.join(dir, 'note.txt'), 'utf8').trim() : 'missing');
  report.check(approvals <= 3, 'a task needs a handful of questions at most (scope task is remembered)', `${approvals} approval(s)`);
  await c.waitFor('idle', isState(e.id, 'idle'), mark, 60_000);

  // 2. deny
  mark = c.mark();
  await c.say(e.id, 'Create a file called second.txt in ~/work containing the word no, then tell me you are done.');
  let denied = 0;
  const end = Date.now() + 240_000;
  let finished = false;
  while (Date.now() < end && !finished) {
    const next = (await c.thread(e.id)).approvals.find((a) => a.status === 'pending' && a.createdMs >= Date.now() - 600_000 && !a.title.includes('zzz'));
    if (next) {
      denied++;
      await c.decide(next.id, 'deny', 'once', 'not now');
    }
    finished = c.events('message', mark).some((m) => m.message.employeeId === e.id && m.message.from === 'employee' && (m.message.kind === 'done' || m.message.kind === 'text') && denied > 0 && Date.now() - mark > 0 && c.log.length > 0 && (m.message.kind === 'done' || /won't|will not|understood|not going|couldn't|can't|declin|stopp|no problem|okay/i.test(m.message.text)));
    await new Promise((r) => setTimeout(r, 1500));
  }
  const bubbles = c.events('message', mark).filter((m) => m.message.from === 'employee').map((m) => m.message.text);
  report.check(denied >= 1, 'a request was denied through the API', `${denied} denial(s)`);
  report.check(!existsSync(path.join(dir, 'second.txt')), 'second.txt was not created', '');
  report.check(finished, 'she said so and stopped (or found another way)', `"${(bubbles.at(-1) ?? '').slice(0, 140)}"`);
  const resolved = (await c.thread(e.id)).approvals.filter((a) => a.status === 'denied');
  report.check(resolved.length >= 1, 'the denied approval is recorded as denied', `${resolved.length}`);
});
