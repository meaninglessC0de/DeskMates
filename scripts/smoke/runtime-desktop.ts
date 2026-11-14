// The whole chain on a real Cua Space: session, tools loaded up front, the allow-list, HTTP MCP to the Space, screenshots, activity lines.
//   npx tsx scripts/smoke/runtime-desktop.ts [--model claude-sonnet-5-5]
// Creates one Space (hired employee) and deletes it at the end. Needs DESKTOPS=cua to work (set by default here).
import { Client, OfficeProc, Report, bootAndHire, isMsg, isState, parseArgs, run, skipWithoutKey } from './runtime-lib.ts';

const report = new Report('runtime-desktop');
skipWithoutKey(report.name);
const args = parseArgs({ desktops: 'cua' });
let office: OfficeProc | null = null;
let client: Client | null = null;
let hiredId: string | null = null;

await run(report, () => office, () => client, async () => {
  try {
    const b = await bootAndHire(args, 'web_developer');
    office = b.office;
    client = b.c;
    const { c, e } = b;
    hiredId = e.id;
    const up = await c.employee(e.id);
    report.check(up.spaceId?.startsWith('local:emp-'), 'her desktop is a real Space', up.spaceId ?? 'none');
    const before = c.mark();
    const t0 = Date.now();
    await c.say(e.id, 'Open example.com in the browser and tell me the page heading.');
    // she may answer with a done bubble (finish_task) or a plain text bubble
    const answer = await c.waitFor('an answer', (ev): ev is Extract<typeof ev, { type: 'message' }> =>
      ev.type === 'message' && ev.message.employeeId === e.id && ev.message.from === 'employee' && /example domain/i.test(ev.message.text), before, 420_000);
    report.check(true, 'the answer mentions "Example Domain"', `after ${((Date.now() - t0) / 1000).toFixed(0)} s: "${answer.message.text.slice(0, 140)}"`);
    await c.waitFor('idle', isState(e.id, 'idle'), before, 120_000).catch(() => {});
    const steps = [...new Map(c.events('step', before).map((s) => [s.step.id, s.step])).values()];
    const sentences = steps.map((s) => `${s.sentence} [${s.status}]`);
    report.check(steps.some((s) => /opened example\.com/i.test(s.sentence)), 'a step "Opened example.com"', sentences.join(' | '));
    report.check(!steps.some((s) => /mcp__|_|\/|~/.test(s.sentence)), 'no tool names or paths in step sentences');
    const frame = await fetch(`${office.base}/api/employees/${e.id}/frame.jpg`);
    report.check(frame.status === 200, 'frame.jpg shows her desktop', `HTTP ${frame.status}, ${(await frame.arrayBuffer()).byteLength} bytes`);
    const task = await c.taskWhen(e.id, (t) => t.costUsd > 0);
    report.check((task?.costUsd ?? 0) > 0, 'cost recorded', `${task?.costUsd} USD, ${task?.numTurns} turns`);
    console.log(`INFO model ${args.model}; employee state ${(await c.employee(e.id)).state}`);
  } finally {
    if (hiredId && client) {
      report.cost = (await client.api<{ totals: { costUsd: number } }>('GET', '/api/team?range=today')).data.totals.costUsd;
      await client.remove(hiredId).catch(() => {});
      console.log('INFO removed the employee and deleted her Space');
    }
  }
});
