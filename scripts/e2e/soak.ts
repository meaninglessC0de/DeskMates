// Layer 6 soak test: three employees, three different long tasks at once, on real desktops with the real model.
//   npx tsx scripts/e2e/soak.ts [--minutes 30] [--budget 3] [--model claude-haiku-5-5] [--min-gb 6] [--port 4330] [--data data-w10] [--keep] [--force]
// Starts its own office (clean data folder), hires Maya (a small site), Jonas (a research note with sources saved to a
// file) and Kenji (a messy data file cleaned with a script). When one finishes and time remains, he gets a follow-up so
// all three stay busy. Every minute it samples host memory (vm_stat), the resident memory of each employee process and of
// the runtime VM, and each employee's state. It stops early if free plus inactive memory falls under --min-gb (default 6),
// prints the table and a verdict, removes every employee and stops office. Exit 0 = pass, 1 = fail, 2 = refused to start.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Employee } from '../../src/shared/index.ts';
import { Run, ROOT, employeeProcs, flag, hasFlag, hasKey, hostMemory, money, parseOptions, sleep, vmRssMb } from './lib/harness.ts';

const opts = parseOptions();
const minutes = Number(flag('minutes') ?? 30);
const minGb = Number(flag('min-gb') ?? 6);

if (!hasKey()) {
  console.log('SKIP soak: no ANTHROPIC_API_KEY in .env.local (exit code 3, not a pass)');
  process.exit(3);
}

interface Person {
  key: 'maya' | 'jonas' | 'kenji';
  role: string;
  tasks: string[];
  id?: string;
  sentTasks: number;
  stuckResumes: number;
  lastIdleAt: number;
}

const people: Person[] = [
  {
    key: 'maya', role: 'web_developer', sentTasks: 0, stuckResumes: 0, lastIdleAt: 0,
    tasks: [
      'Build a small multi-page website for a fictional coffee roastery in ~/work/roastery: home, menu, about and contact pages with one shared stylesheet. Write a short script that checks every link works, run it, then open the home page in the browser to look at it.',
      'Good. Make the layout responsive for narrow screens, add a FAQ page linked from the menu, re-run your link check and show me the result in the browser.',
      'Add a simple opening-hours table and a footer to every page, keep the style consistent, re-run the link check.',
      'Review all the pages for typos and inconsistent wording, fix what you find and tell me what changed.',
    ],
  },
  {
    key: 'jonas', role: 'researcher', sentTasks: 0, stuckResumes: 0, lastIdleAt: 0,
    tasks: [
      'Research how small teams use AI agents for everyday office work. Find at least five reputable sources on the web, read them, and write a research note to ~/work/research/note.md with a short summary of each and a list of the source URLs at the end.',
      'Good. Add a section on risks and what to watch for, with at least three more sources, and keep the URL list up to date.',
      'Add a one-paragraph conclusion and a table that compares the sources by what they claim. Keep every claim tied to a source URL.',
      'Proofread the note, check each URL in the list still opens (use a command), and remove any that fail.',
    ],
  },
  {
    key: 'kenji', role: 'data_analyst', sentTasks: 0, stuckResumes: 0, lastIdleAt: 0,
    tasks: [
      'Create a deliberately messy CSV of 400 customer orders in ~/work/data/raw.csv (duplicate rows, missing values, dates in three formats, inconsistent country names). Then write a Python script ~/work/data/clean.py that cleans it into ~/work/data/clean.csv and prints a report of what it fixed. Run it and check the result.',
      'Good. Add a second script that prints revenue per country from clean.csv and run it. Save the output to ~/work/data/summary.txt.',
      'Write a few checks (in a script) that prove clean.csv has no duplicates, no missing values and one date format. Run them.',
      'Make clean.py a little more robust: handle an empty input file and a missing column, and show it working on both.',
    ],
  },
];

interface Sample {
  min: number;
  availGb: number;
  freeGb: number;
  vmMb: number;
  cost: number;
  who: Record<string, { state: string; rssMb: number | null }>;
}

const R = new Run(opts);
const samples: Sample[] = [];
let stopReason: string | null = null;

function pad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function row(s: Sample): string {
  const cell = (k: string) => {
    const w = s.who[k];
    return `${(w?.state ?? '-').padEnd(9)} ${pad(w?.rssMb ?? '-', 4)}`;
  };
  return `${pad(s.min, 4)} ${pad(s.availGb.toFixed(1), 7)} ${pad(s.freeGb.toFixed(1), 6)} ${pad(s.vmMb, 7)} | ${cell('maya')} | ${cell('jonas')} | ${cell('kenji')} | ${pad(money(s.cost), 8)}`;
}
const HEADER = 'min  free+in   free  vm MB  | maya state rss MB | jonas state rss MB | kenji state rss MB | cost';

async function sample(minute: number): Promise<Sample> {
  const mem = hostMemory();
  const list = (await R.c.api<Employee[]>('GET', '/api/employees')).data;
  const procs = employeeProcs(R.office.dataDir);
  const who: Sample['who'] = {};
  for (const p of people) {
    const e = list.find((x) => x.id === p.id);
    const rss = procs.filter((x) => x.employeeId === p.id).reduce((s, x) => s + x.rssMb, 0);
    who[p.key] = { state: e?.state ?? 'missing', rssMb: e ? rss : null };
  }
  const s: Sample = { min: minute, availGb: mem.availGb, freeGb: mem.freeGb, vmMb: vmRssMb(), cost: await R.refreshCost(), who };
  samples.push(s);
  console.log(row(s));
  return s;
}

async function main(): Promise<number> {
  const start = hostMemory();
  console.log(`soak.ts: ${minutes} min, model ${opts.model}, budget ${money(opts.budget)}, stops under ${minGb} GB free+inactive. Host memory now: free ${start.freeGb} GB, inactive ${start.inactiveGb} GB`);
  if (start.availGb < minGb && !hasFlag('force')) {
    console.log(`REFUSED: free plus inactive memory (${start.availGb} GB) is already under ${minGb} GB (use --force to run anyway)`);
    return 2;
  }
  await R.boot();
  const t0 = Date.now();
  const endAt = t0 + minutes * 60_000;
  try {
    // hire all three
    for (const p of people) {
      const e = await R.hire(p.role, { level: 'independent' });
      p.id = e.id;
    }
    await Promise.all(people.map((p) => R.waitReady(p.id!, 240_000)));
    console.log(`hired ${people.length} employees; desktops up after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await sleep(3000);
    for (const p of people) {
      await R.c.say(p.id!, p.tasks[0]);
      p.sentTasks = 1;
    }
    console.log(HEADER);
    await sample(0);
    for (let minute = 1; ; minute++) {
      // wait one minute, handling follow-ups and stuck employees every 10 s
      const until = Math.min(t0 + minute * 60_000 + 0, endAt);
      const tickStart = Date.now();
      void tickStart;
      while (Date.now() < until) {
        await sleep(Math.min(10_000, Math.max(0, until - Date.now())));
        const list = (await R.c.api<Employee[]>('GET', '/api/employees')).data;
        for (const p of people) {
          const e = list.find((x) => x.id === p.id);
          if (!e) continue;
          // approvals never block the soak
          if (e.state === 'needs_you') {
            const th = await R.c.thread(p.id!);
            for (const a of th.approvals.filter((x) => x.status === 'pending')) await R.c.decide(a.id, 'approve', 'task');
          }
          if (e.state === 'idle') {
            if (!p.lastIdleAt) p.lastIdleAt = Date.now();
            if (Date.now() - p.lastIdleAt > 15_000 && p.sentTasks < p.tasks.length && endAt - Date.now() > 90_000) {
              await R.c.say(p.id!, p.tasks[p.sentTasks++]);
              p.lastIdleAt = 0;
            }
          } else p.lastIdleAt = 0;
          if (e.state === 'stuck' && p.stuckResumes < 3) {
            p.stuckResumes++;
            await R.c.api('POST', `/api/employees/${p.id}/resume`);
          }
        }
        if (R.budgetHit) {
          stopReason = `budget of ${money(opts.budget)} passed`;
          break;
        }
        if (hostMemory().availGb < minGb) break;
      }
      const s = await sample(minute);
      if (s.availGb < minGb) {
        stopReason = `free plus inactive memory fell to ${s.availGb} GB (limit ${minGb} GB)`;
        break;
      }
      if (stopReason || Date.now() >= endAt) break;
    }
    // what did they produce
    const out: Record<string, string> = {};
    const sh = async (p: Person, cmd: string) => (await R.sh(p.id!, cmd).catch((e) => ({ out: `error: ${(e as Error).message}`, code: 1 }))).out.replace(/\n/g, ' ');
    out.maya = await sh(people[0], 'ls ~/work/roastery 2>/dev/null | head -12; echo "html:"; ls ~/work/roastery/*.html 2>/dev/null | wc -l');
    out.jonas = await sh(people[1], 'ls ~/work/research 2>/dev/null; echo "urls:"; grep -oE "https?://[^ )>\\"]+" ~/work/research/note.md 2>/dev/null | sort -u | wc -l');
    out.kenji = await sh(people[2], 'ls ~/work/data 2>/dev/null; echo "clean rows:"; wc -l < ~/work/data/clean.csv 2>/dev/null');
    const tasks: Record<string, { n: number; done: number; cost: number }> = {};
    for (const p of people) {
      const th = await R.c.thread(p.id!);
      tasks[p.key] = { n: th.task ? 1 : 0, done: th.task?.status === 'done' ? 1 : 0, cost: th.task?.costUsd ?? 0 };
    }
    const planEvents = people.map((p) => `${p.key} ${R.c.events('task').filter((t) => t.task.employeeId === p.id && t.task.plan.length > 0).length}`).join(', ');
    console.log(`task events that carried a plan (the checklist mirror): ${planEvents}`);
    const finalList = (await R.c.api<Employee[]>('GET', '/api/employees')).data;
    const finalStates = people.map((p) => `${p.key}:${finalList.find((x) => x.id === p.id)?.state ?? 'missing'}`).join(' ');
    // table and verdict
    console.log(`\n${HEADER}`);
    for (const s of samples) console.log(row(s));
    const minAvail = Math.min(...samples.map((s) => s.availGb));
    const maxVm = Math.max(...samples.map((s) => s.vmMb));
    const peakRss = (k: string) => Math.max(0, ...samples.map((s) => s.who[k]?.rssMb ?? 0));
    const bad = finalList.filter((e) => people.some((p) => p.id === e.id) && (e.state === 'offline' || e.state === 'stuck'));
    const ranMin = (Date.now() - t0) / 60_000;
    console.log(`\nran ${ranMin.toFixed(1)} of ${minutes} min; follow-ups sent: ${people.map((p) => `${p.key} ${p.sentTasks - 1}`).join(', ')}; stuck resumes: ${people.map((p) => `${p.key} ${p.stuckResumes}`).join(', ')}`);
    console.log(`lowest free+inactive ${minAvail} GB; peak VM ${maxVm} MB; peak employee process ${people.map((p) => `${p.key} ${peakRss(p.key)} MB`).join(', ')}; spend ${money(R.lastCost)}`);
    console.log(`final states: ${finalStates}`);
    for (const k of Object.keys(out)) console.log(`output ${k}: ${out[k]}`);
    const problems: string[] = [];
    if (stopReason) problems.push(`stopped early: ${stopReason}`);
    if (ranMin < minutes - 1) problems.push(`ran only ${ranMin.toFixed(1)} of ${minutes} minutes`);
    if (bad.length) problems.push(`ended offline or stuck: ${bad.map((b) => b.persona.firstName).join(', ')}`);
    if (!/html:\s*[1-9]/.test(out.maya)) problems.push('Maya produced no html pages');
    if (!/urls:\s*[1-9]/.test(out.jonas)) problems.push('Jonas wrote no note with URLs');
    if (!/clean\.csv/.test(out.kenji)) problems.push('Kenji produced no clean.csv');
    console.log(problems.length ? `VERDICT FAIL: ${problems.join('; ')}` : `VERDICT PASS: ${ranMin.toFixed(1)} minutes, three employees working, lowest free+inactive ${minAvail} GB`);
    mkdirSync(path.join(ROOT, 'shots/e2e'), { recursive: true });
    writeFileSync(path.join(ROOT, 'shots/e2e/soak.json'), JSON.stringify({ at: new Date().toISOString(), minutes, ranMin, stopReason, samples, out, tasks, problems, costUsd: R.lastCost }, null, 2));
    return problems.length ? 1 : 0;
  } finally {
    const clean = await R.cleanup().catch((e) => ({ left: [`cleanup failed: ${(e as Error).message}`], port: false }));
    console.log(`cleanup: ${opts.keep ? 'kept (--keep)' : 'every employee removed, office stopped'}; Spaces of ours left: ${clean.left.length ? clean.left.join(', ') : 'none'}; port ${opts.port} ${clean.port ? 'STILL IN USE' : 'free'}`);
    if (!opts.keep && (clean.left.length || clean.port)) process.exitCode = 1;
  }
}

main().then((code) => process.exit(process.exitCode ? process.exitCode : code), async (err) => {
  console.log(`FAIL soak.ts crashed: ${(err as Error).stack ?? err}`);
  await R.cleanup().catch(() => {});
  process.exit(1);
});
