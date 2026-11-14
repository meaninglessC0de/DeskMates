// Shared plumbing for scripts/smoke/runtime-*.ts: start a clean office, talk to it over HTTP and the WebSocket,
// print PASS or FAIL lines with evidence, report the cost, exit non-zero on failure.
//   npx tsx scripts/smoke/runtime-chat.ts [--port 4322] [--data data-w2] [--desktops mock|cua] [--model claude-haiku-5-5] [--attach]
// Exit codes: 0 all passed, 1 a check failed, 3 skipped (no ANTHROPIC_API_KEY in .env.local).
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Approval, Candidate, Employee, Message, ServerEvent, Task, ThreadResponse } from '../../src/shared/index.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');

export type Ev<K extends ServerEvent['type']> = Extract<ServerEvent, { type: K }>;

export interface Args {
  port: number;
  data: string;
  desktops: 'mock' | 'cua';
  model: string;
  attach: boolean;
}

export function parseArgs(defaults: Partial<Args> = {}): Args {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    port: Number(get('port') ?? defaults.port ?? 4322),
    data: get('data') ?? defaults.data ?? 'data-w2',
    desktops: (get('desktops') ?? defaults.desktops ?? 'mock') as 'mock' | 'cua',
    model: get('model') ?? defaults.model ?? 'claude-haiku-5-5',
    attach: a.includes('--attach'),
  };
}

export function hasKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  const f = path.join(ROOT, '.env.local');
  if (!existsSync(f)) return false;
  return readFileSync(f, 'utf8').split('\n').some((l) => /^ANTHROPIC_API_KEY=.+/.test(l.trim()));
}

export function money(n: number): string {
  return `$${n.toFixed(4)}`;
}

export class Report {
  failed = 0;
  /** Set by a script that deletes its employees before the end (the team report forgets removed people). */
  cost: number | undefined;
  private t0 = Date.now();
  constructor(readonly name: string) {}
  pass(what: string, evidence = ''): void {
    console.log(`PASS ${what}${evidence ? ` - ${evidence}` : ''}`);
  }
  fail(what: string, evidence = ''): void {
    this.failed++;
    console.log(`FAIL ${what}${evidence ? ` - ${evidence}` : ''}`);
  }
  check(cond: unknown, what: string, evidence = ''): boolean {
    if (cond) this.pass(what, evidence);
    else this.fail(what, evidence);
    return !!cond;
  }
  finish(extra: { costUsd?: number; rssMb?: number } = {}): never {
    const secs = ((Date.now() - this.t0) / 1000).toFixed(1);
    console.log(
      `${this.failed === 0 ? 'PASS' : 'FAIL'} ${this.name}: ${this.failed === 0 ? 'all checks passed' : `${this.failed} check(s) failed`} in ${secs}s` +
        (extra.costUsd !== undefined ? ` | cost ${money(extra.costUsd)}` : '') +
        (extra.rssMb !== undefined ? ` | employee process memory ${extra.rssMb} MB` : ''),
    );
    process.exit(this.failed === 0 ? 0 : 1);
  }
}

export function skipWithoutKey(name: string): void {
  if (hasKey()) return;
  console.log(`SKIP ${name}: no ANTHROPIC_API_KEY in .env.local, so nothing was run (exit code 3, not a pass)`);
  process.exit(3);
}

export class OfficeProc {
  child: ChildProcess | null = null;
  logs = '';
  constructor(readonly args: Args, readonly extraEnv: Record<string, string> = {}) {}

  get base(): string {
    return `http://127.0.0.1:${this.args.port}`;
  }

  get dataDir(): string {
    return path.isAbsolute(this.args.data) ? this.args.data : path.join(ROOT, this.args.data);
  }

  clean(): void {
    rmSync(this.dataDir, { recursive: true, force: true });
  }

  async start(): Promise<void> {
    const env = {
      ...process.env,
      MOCK_LLM: '0',
      DATABRICKS_SYNC: 'off', // never mirror test employees into a real workspace
      DESKTOPS: this.args.desktops,
      EMPLOYEE_MODEL: this.args.model,
      OFFICE_PORT: String(this.args.port),
      DATA_DIR: this.args.data,
      ...this.extraEnv,
    };
    this.child = spawn(process.execPath, ['--import', 'tsx', 'src/office/main.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child.stdout?.on('data', (d) => (this.logs += String(d)));
    this.child.stderr?.on('data', (d) => (this.logs += String(d)));
    const start = Date.now();
    for (;;) {
      try {
        const r = await fetch(`${this.base}/api/health`);
        if (r.ok) return;
      } catch {
        /* not up yet */
      }
      if (this.child.exitCode !== null) throw new Error(`office exited: ${this.logs.slice(-400)}`);
      if (Date.now() - start > 60_000) throw new Error(`office did not start: ${this.logs.slice(-400)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /** SIGKILL, as a crash would. */
  kill(): void {
    if (this.child?.pid) {
      try {
        process.kill(-this.child.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
    this.child = null;
  }

  async stop(): Promise<void> {
    if (!this.child?.pid) return;
    const pid = this.child.pid;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* gone */
    }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        process.kill(pid, 0);
      } catch {
        this.child = null;
        return;
      }
    }
    this.kill();
  }

  /** Resident memory in MB of every `claude` process under this office. */
  employeeRssMb(): number {
    try {
      const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' });
      const rows = out.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter((m): m is RegExpMatchArray => !!m)
        .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), cmd: m[4] }));
      const root = this.child?.pid;
      const under = new Set<number>();
      if (root) {
        under.add(root);
        for (let changed = true; changed; ) {
          changed = false;
          for (const r of rows) if (!under.has(r.pid) && under.has(r.ppid)) (under.add(r.pid), (changed = true));
        }
      }
      const kb = rows.filter((r) => under.has(r.pid) && /claude/.test(r.cmd) && !/tsx|main\.ts/.test(r.cmd)).reduce((s, r) => s + r.rss, 0);
      return Math.round(kb / 1024);
    } catch {
      return -1;
    }
  }
}

export class Client {
  readonly log: { at: number; e: ServerEvent }[] = [];
  private ws: WebSocket | null = null;
  readonly costs = new Map<string, number>();

  constructor(readonly base: string) {}

  async connect(): Promise<void> {
    const ws = new WebSocket(this.base.replace('http', 'ws') + '/ws');
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')));
    });
    ws.addEventListener('message', (m) => {
      const e = JSON.parse(String(m.data)) as ServerEvent;
      this.log.push({ at: Date.now(), e });
      if (e.type === 'task') this.costs.set(e.task.id, e.task.costUsd);
    });
  }

  close(): void {
    this.ws?.close();
  }

  totalCost(): number {
    return [...this.costs.values()].reduce((a, b) => a + b, 0);
  }

  mark(): number {
    return this.log.length;
  }

  events<K extends ServerEvent['type']>(type: K, from = 0): Ev<K>[] {
    return this.log.slice(from).map((x) => x.e).filter((e): e is Ev<K> => e.type === type);
  }

  async waitFor<T extends ServerEvent>(what: string, pred: (e: ServerEvent) => e is T, from = 0, timeoutMs = 120_000): Promise<T> {
    const start = Date.now();
    let i = from;
    for (;;) {
      while (i < this.log.length) {
        const e = this.log[i++].e;
        if (pred(e)) return e;
      }
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async api<T = unknown>(method: string, p: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(this.base + p, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data: data as T };
  }

  async hire(roleKey: string, overrides?: Record<string, unknown>): Promise<Employee> {
    const c = await this.api<Candidate>('POST', '/api/candidates', { roleKey });
    if (c.status !== 200) throw new Error(`candidate: ${c.status} ${JSON.stringify(c.data)}`);
    const h = await this.api<Employee>('POST', '/api/employees', { token: c.data.token, overrides });
    if (h.status !== 200) throw new Error(`hire: ${h.status} ${JSON.stringify(h.data)}`);
    return h.data;
  }

  async employee(id: string): Promise<Employee> {
    return (await this.api<Employee>('GET', `/api/employees/${id}`)).data;
  }

  async thread(id: string): Promise<ThreadResponse> {
    return (await this.api<ThreadResponse>('GET', `/api/employees/${id}/thread?limit=200`)).data;
  }

  async say(id: string, text: string): Promise<Message> {
    return (await this.api<Message>('POST', `/api/employees/${id}/messages`, { text })).data;
  }

  async decide(approvalId: string, decision: 'approve' | 'deny', scope: 'once' | 'task' = 'once', note?: string): Promise<Approval> {
    return (await this.api<Approval>('POST', `/api/approvals/${approvalId}`, { decision, scope, note })).data;
  }

  async patch(id: string, body: unknown): Promise<Employee> {
    return (await this.api<Employee>('PATCH', `/api/employees/${id}`, body)).data;
  }

  async remove(id: string): Promise<void> {
    await this.api('DELETE', `/api/employees/${id}`);
  }

  async taskOf(id: string): Promise<Task | null> {
    return (await this.thread(id)).task;
  }

  /** The latest task once `pred` holds (the cost of a turn lands just after `finish_task` closes the task). */
  async taskWhen(id: string, pred: (t: Task) => boolean, timeoutMs = 20_000): Promise<Task | null> {
    const start = Date.now();
    for (;;) {
      const t = await this.taskOf(id);
      if ((t && pred(t)) || Date.now() - start > timeoutMs) return t;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

export const isMsg = (id: string, from: Message['from'], kind?: Message['kind']) => (e: ServerEvent): e is Ev<'message'> =>
  e.type === 'message' && e.message.employeeId === id && e.message.from === from && (kind === undefined || e.message.kind === kind);
export const isState = (id: string, state: Employee['state']) => (e: ServerEvent): e is Ev<'employee'> =>
  e.type === 'employee' && e.employee.id === id && e.employee.state === state;
export const isApproval = (id: string, status: Approval['status']) => (e: ServerEvent): e is Ev<'approval'> =>
  e.type === 'approval' && e.approval.employeeId === id && e.approval.status === status;

/** Boots a clean office, connects, hires one employee and waits for her greeting. */
export async function bootAndHire(
  args: Args,
  roleKey: string,
  opts: { permissions?: Record<string, unknown>; extraEnv?: Record<string, string> } = {},
): Promise<{ office: OfficeProc; c: Client; e: Employee }> {
  const office = new OfficeProc(args, opts.extraEnv);
  if (!args.attach) {
    office.clean();
    await office.start();
  }
  const c = new Client(office.base);
  await c.connect();
  const e = await c.hire(roleKey, opts.permissions ? { permissions: opts.permissions } : undefined);
  await c.waitFor('greeting', isMsg(e.id, 'employee', 'text'), 0, 240_000);
  await c.waitFor('idle', isState(e.id, 'idle'), 0, 60_000).catch(() => {});
  return { office, c, e };
}

/** Runs `main`, always stops the office and exits with the report's code. */
export async function run(report: Report, office: () => OfficeProc | null, c: () => Client | null, main: () => Promise<void>): Promise<never> {
  let rss = -1;
  try {
    await main();
  } catch (err) {
    report.fail('script error', (err as Error).message);
  }
  const o = office();
  if (o) rss = o.employeeRssMb();
  let cost: number | undefined = report.cost;
  if (cost === undefined) try {
    cost = (await c()?.api<{ totals: { costUsd: number } }>('GET', '/api/team?range=today'))?.data.totals.costUsd;
  } catch {
    cost = c()?.totalCost();
  }
  c()?.close();
  if (o && !o.args.attach) {
    if (report.failed > 0) console.log(`--- office log tail ---\n${o.logs.slice(-1500)}`);
    await o.stop();
  }
  return report.finish({ costUsd: cost, rssMb: rss >= 0 ? rss : undefined });
}
