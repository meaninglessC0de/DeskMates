// Shared plumbing for scripts/e2e/real.ts and scripts/e2e/soak.ts: an office of our own on a real-desktop setup,
// a Client on the WebSocket, direct access to each employee's Space (for checks the product cannot answer), cost
// tracking with a budget, evidence files, process and memory sampling.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { embedded } from '@trycua/cua';
import type { Employee, Message, Permissions, ServerEvent } from '../../../src/shared/index.ts';
import { readEnv } from '../../../src/shared/index.ts';
import { createCuaSpaces } from '../../../src/office/spaces/cuaSpaces.ts';
import type { Spaces } from '../../../src/office/spaces/types.ts';
import { Client, OfficeProc, ROOT, hasKey, money, type Args, type Ev } from '../../smoke/runtime-lib.ts';

export { Client, OfficeProc, ROOT, hasKey, money };
export type { Ev };

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RunOptions {
  port: number;
  data: string;
  model: string;
  budget: number;
  keep: boolean;
}

export function flag(name: string): string | undefined {
  const a = process.argv.slice(2);
  const i = a.indexOf(`--${name}`);
  return i >= 0 ? a[i + 1] : undefined;
}
export const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);

export function parseOptions(): RunOptions {
  return {
    port: Number(flag('port') ?? 4330),
    data: flag('data') ?? 'data-w10',
    model: flag('model') ?? 'claude-haiku-5-5',
    budget: Number(flag('budget') ?? 3),
    keep: hasFlag('keep'),
  };
}

/** Every Space id the SDK knows about (all of them, not only ours). */
export async function sdkSpaceIds(): Promise<string[]> {
  process.env.CUA_TELEMETRY ??= '0';
  process.env.DO_NOT_TRACK ??= '1';
  return (await embedded().spaces().list()).map((s) => s.id);
}

export interface Hired {
  id: string;
  firstName: string;
  roleKey: string;
}

export class BudgetExceeded extends Error {}

export class Run {
  readonly args: Args;
  office: OfficeProc;
  c: Client;
  spaces: Spaces;
  readonly hired = new Map<string, Hired>();
  readonly spaceIds = new Set<string>();
  baselineSpaces: string[] = [];
  banked = 0;
  budgetHit = false;
  readonly evidenceRoot: string;
  private costTimer: NodeJS.Timeout | null = null;
  lastCost = 0;

  constructor(readonly opts: RunOptions, extraEnv: Record<string, string> = {}) {
    this.args = { port: opts.port, data: opts.data, desktops: 'cua', model: opts.model, attach: false };
    this.office = new OfficeProc(this.args, { MAX_TEAM: '4', ...extraEnv });
    this.c = new Client(this.office.base);
    this.spaces = createCuaSpaces({ dataDir: this.office.dataDir, env: readEnv({ ...process.env, DESKTOPS: 'cua' }) });
    this.evidenceRoot = path.join(ROOT, 'shots/e2e');
  }

  get base(): string {
    return this.office.base;
  }

  async boot(): Promise<void> {
    this.baselineSpaces = await sdkSpaceIds();
    this.office.clean();
    await this.office.start();
    await this.c.connect();
    this.costTimer = setInterval(() => void this.refreshCost(), 20_000);
    this.costTimer.unref();
  }

  /** The SDK keeps a stale connection per Space id inside one process: after a reset (delete and create under the same name) use a fresh one. */
  freshSpaces(): void {
    this.spaces = createCuaSpaces({ dataDir: this.office.dataDir, env: readEnv({ ...process.env, DESKTOPS: 'cua' }) });
  }

  /** The office process died (we killed it): start it again on the same data and listen again. */
  async restartOffice(): Promise<void> {
    await this.office.start();
    await this.c.connect();
  }

  evidenceDir(scenario: string): string {
    const d = path.join(this.evidenceRoot, scenario);
    mkdirSync(d, { recursive: true });
    return d;
  }

  async hire(roleKey: string, permissions?: Partial<Permissions>): Promise<Employee> {
    const e = await this.c.hire(roleKey, permissions ? { permissions } : undefined);
    this.hired.set(e.id, { id: e.id, firstName: e.persona.firstName, roleKey });
    return e;
  }

  /** Waits for the employee's desktop to come up (idle) and her first message. */
  async waitReady(id: string, timeoutMs = 180_000): Promise<void> {
    await this.c.waitFor('desktop up', (e): e is Ev<'employee'> => e.type === 'employee' && e.employee.id === id && e.employee.state === 'idle', 0, timeoutMs);
    const e = await this.c.employee(id);
    if (e.spaceId) this.spaceIds.add(e.spaceId);
  }

  /** Cost of all work so far: banked (removed employees) plus the team report, never less than what task events showed. */
  async refreshCost(): Promise<number> {
    try {
      const r = await this.c.api<{ totals: { costUsd: number } }>('GET', '/api/team?range=today');
      if (r.status === 200) this.lastCost = Math.max(this.lastCost, this.banked + r.data.totals.costUsd, this.c.totalCost());
    } catch {
      this.lastCost = Math.max(this.lastCost, this.c.totalCost());
    }
    if (this.lastCost > this.opts.budget) this.budgetHit = true;
    return this.lastCost;
  }

  async remove(id: string): Promise<void> {
    try {
      const r = await this.c.api<{ rows: { employeeId: string; costUsd: number }[] }>('GET', '/api/team?range=today');
      this.banked += r.data.rows.find((x) => x.employeeId === id)?.costUsd ?? 0;
    } catch {
      /* cost is only informative */
    }
    const e = await this.c.api<Employee>('GET', `/api/employees/${id}`);
    if (e.status === 200 && e.data.spaceId) this.spaceIds.add(e.data.spaceId);
    await this.c.remove(id);
    this.hired.delete(id);
  }

  /** Saves a full-size frame of the employee's desktop; returns what it saw. */
  async frame(id: string, scenario: string, name = 'frame.jpg'): Promise<{ ok: boolean; bytes: number; file: string }> {
    const file = path.join(this.evidenceDir(scenario), name);
    const res = await fetch(`${this.base}/api/employees/${id}/frame.jpg`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ok = res.status === 200 && buf[0] === 0xff && buf[1] === 0xd8;
    if (ok) writeFileSync(file, buf);
    return { ok, bytes: buf.length, file: path.relative(ROOT, file) };
  }

  async saveThread(id: string, scenario: string, name: string): Promise<string> {
    const t = await this.c.thread(id);
    const file = path.join(this.evidenceDir(scenario), name);
    writeFileSync(file, JSON.stringify(t, null, 2));
    return path.relative(ROOT, file);
  }

  saveEvents(scenario: string, fromIndex: number, last = 20, name = 'last-events.json'): string {
    const evs = this.c.log.slice(fromIndex).slice(-last).map((x) => ({ at: new Date(x.at).toISOString(), ...briefEvent(x.e) }));
    const file = path.join(this.evidenceDir(scenario), name);
    writeFileSync(file, JSON.stringify(evs, null, 2));
    return path.relative(ROOT, file);
  }

  saveOfficeLog(scenario: string, lines = 120, name = 'office-log.txt'): string {
    const file = path.join(this.evidenceDir(scenario), name);
    writeFileSync(file, this.office.logs.split('\n').slice(-lines).join('\n'));
    return path.relative(ROOT, file);
  }

  async sh(id: string, cmd: string, timeoutMs = 30_000): Promise<{ out: string; code: number }> {
    const r = await this.spaces.exec(id, cmd, { timeoutMs });
    return { out: (r.stdout + (r.stderr ? `\n${r.stderr}` : '')).trim(), code: r.exitCode };
  }

  /** The window titles on the employee's desktop (wmctrl) and the active one. */
  async windows(id: string): Promise<{ titles: string[]; active: string; browserArgs: string }> {
    const w = await this.sh(id, 'wmctrl -l 2>/dev/null | cut -d" " -f5- ; echo "@@"; xdotool getactivewindow getwindowname 2>/dev/null; echo "@@"; ps -eo args | grep -E "firefox|chromium" | grep -v grep | head -3');
    const [titles, active, args] = w.out.split('@@').map((s) => s.trim());
    return { titles: (titles ?? '').split('\n').map((s) => s.trim()).filter(Boolean), active: active ?? '', browserArgs: args ?? '' };
  }

  async cleanup(): Promise<{ left: string[]; port: boolean }> {
    if (this.costTimer) clearInterval(this.costTimer);
    if (!this.opts.keep) {
      await this.refreshCost().catch(() => {});
      let alive = true;
      try {
        await fetch(`${this.base}/api/health`);
      } catch {
        alive = false;
      }
      if (!alive) {
        try {
          await this.office.start();
        } catch {
          /* cannot start: fall through to deleting Spaces directly */
        }
      }
      for (const id of [...this.hired.keys()]) {
        try {
          await this.remove(id);
        } catch (e) {
          console.log(`WARN could not remove ${id} through the office: ${(e as Error).message}`);
        }
      }
      this.c.close();
      await this.office.stop();
    }
    // whatever is still in the SDK list that is ours: delete directly. "Ours" is a Space this run hired (by id) or one whose
    // employee folder is in this run's data folder. Never "anything new since we started": the app or another test may be
    // running on this machine, and its desktops are not ours to delete.
    const now = await sdkSpaceIds();
    const inOurData = (s: string): boolean => existsSync(path.join(this.office.dataDir, 'employees', `emp_${s.replace(/^local:emp-/, '').toUpperCase()}`));
    let left = now.filter((s) => /^local:emp-/.test(s) && (this.spaceIds.has(s) || inOurData(s)));
    if (!this.opts.keep && left.length) {
      for (const s of left) {
        try {
          await embedded().spaces().delete_(s);
        } catch {
          /* reported below */
        }
      }
      left = (await sdkSpaceIds()).filter((s) => left.includes(s));
    }
    return { left, port: portInUse(this.opts.port) };
  }
}

export function portInUse(port: number): boolean {
  try {
    return execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

export function briefEvent(e: ServerEvent): Record<string, unknown> {
  switch (e.type) {
    case 'employee': return { type: e.type, who: e.employee.persona.firstName, state: e.employee.state, detail: e.employee.stateDetail };
    case 'message': return { type: e.type, who: e.message.employeeId, from: e.message.from, kind: e.message.kind, text: e.message.text.slice(0, 200) };
    case 'message_seen': return { ...e };
    case 'step': return { type: e.type, who: e.step.employeeId, sentence: e.step.sentence, status: e.step.status, peer: e.step.peer ? { to: e.step.peer.direction, other: e.step.peer.employeeId } : undefined };
    case 'task': return { type: e.type, who: e.task.employeeId, status: e.task.status, plan: e.task.plan.map((p) => `${p.status}:${p.title}`), cost: e.task.costUsd };
    case 'approval': return { type: e.type, who: e.approval.employeeId, status: e.approval.status, title: e.approval.title, detail: e.approval.detail };
    case 'notify': return { ...e };
    case 'toast': return { ...e };
    default: return { type: e.type };
  }
}

// ---------- text checks ----------

/** Activity sentences must read like sentences: no tool names, paths or commands. */
export function badSentence(s: string): string | null {
  if (/mcp__|\b(?:TodoWrite|WebFetch|WebSearch|Bash|read_file|write_file|set_activity|finish_task)\b/.test(s)) return 'tool name';
  if (/[/~\\]|\b[A-Za-z0-9_-]+_[A-Za-z0-9_]+\b/.test(s)) return 'path or identifier';
  if (/\b(?:curl|npm|npx|git|sudo|chmod|mkdir|python3?|node|xdotool|wmctrl)\b|\$\s|&&|\|\|/.test(s)) return 'command';
  return null;
}

const NAMED_BLUE = /blue|navy|azure|cobalt|indigo/i;

function parseRgb(v: string): [number, number, number] | null {
  const s = v.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (m) {
    const h = Number(m[1]) / 360, sat = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const f = (t: number) => {
      const x = (t + 1) % 1;
      return Math.round(255 * (x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p));
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  return null;
}

export function isBlueish(value: string): boolean {
  const v = value.replace(/!important/i, '').trim();
  if (NAMED_BLUE.test(v) && !/^(?:rgb|hsl|#)/i.test(v)) return true;
  const rgb = parseRgb(v);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return b >= 100 && b >= r + 40 && b >= g + 15;
}

/** The colours given to a heading (h1, or h2/h3 when there is no h1 rule) in a page's HTML and CSS, last one first. */
export function headingColors(html: string, css: string): string[] {
  const all = `${css}\n${[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')}`.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = new Map<string, string>();
  for (const m of all.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) vars.set(m[1], m[2].trim());
  const resolve = (v: string): string => {
    const m = v.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/);
    return m ? resolve(vars.get(m[1]) ?? m[2] ?? v) : v;
  };
  const h1: string[] = [];
  const other: string[] = [];
  for (const m of all.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    const isH1 = /(^|[\s,>+~.#\]])h1\b|\.hero\b|\.title\b|\.heading\b/i.test(sel);
    const isOther = /(^|[\s,>+~])h[23]\b/i.test(sel);
    if (!isH1 && !isOther) continue;
    for (const d of m[2].matchAll(/(?:^|[;\s])color\s*:\s*([^;}]+)/g)) (isH1 ? h1 : other).push(resolve(d[1].trim()));
  }
  for (const m of html.matchAll(/<h1\b[^>]*style\s*=\s*"([^"]*)"/gi)) {
    for (const d of m[1].matchAll(/(?:^|[;\s])color\s*:\s*([^;]+)/g)) h1.push(resolve(d[1].trim()));
  }
  return (h1.length ? h1 : other).reverse();
}

export function stripHtml(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Candidate taglines inside a colleague's reply: quoted strings first, then the whole reply. */
export function taglineCandidates(reply: string): string[] {
  const out: string[] = [];
  for (const m of reply.matchAll(/["“”]([^"“”]{8,140})["“”]/g)) out.push(m[1].trim());
  if (!out.length) for (const m of reply.matchAll(/(?:^|[\s(])['‘]([^'‘’]{8,140})['’](?=[\s.,;:)]|$)/g)) out.push(m[1].trim());
  const whole = reply.replace(/^[^:]{0,60}:\s*/, '').replace(/["“”]/g, '').trim();
  if (whole) out.push(whole);
  return out;
}

export function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
}

export function overlap(candidate: string, page: string): number {
  const cw = words(candidate);
  if (!cw.length) return 0;
  const pw = new Set(words(page));
  return cw.filter((w) => pw.has(w)).length / cw.length;
}

// ---------- event helpers ----------

export const empMessages = (c: Client, from: number, id: string, kind?: Message['kind']): Message[] =>
  c.events('message', from).map((m) => m.message).filter((m) => m.employeeId === id && m.from === 'employee' && (kind === undefined || m.kind === kind));

/** Steps of one employee since a mark, deduplicated by id (the last update wins), in the order first seen. */
export function stepsOf(c: Client, from: number, id: string) {
  const m = new Map<string, Ev<'step'>['step']>();
  for (const s of c.events('step', from)) if (s.step.employeeId === id) m.set(s.step.id, s.step);
  return [...m.values()];
}

export const stateEvents = (c: Client, from: number, id: string) =>
  c.events('employee', from).filter((e) => e.employee.id === id).map((e) => e.employee.state);

// ---------- processes and memory ----------

export interface Proc {
  pid: number;
  ppid: number;
  rssMb: number;
  cmd: string;
}

export function allProcs(): Proc[] {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return out.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rssMb: Math.round(Number(m[3]) / 1024), cmd: m[4] }));
  } catch {
    return [];
  }
}

/** `claude` processes whose working folder is under `<dataDir>/employees/`: the employee runtimes, mapped to employee ids. */
export function employeeProcs(dataDir: string): { pid: number; employeeId: string; rssMb: number; ppid: number }[] {
  const root = path.join(dataDir, 'employees');
  const claude = allProcs().filter((p) => /claude/.test(p.cmd));
  if (!claude.length) return [];
  let out = '';
  try {
    out = execFileSync('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', claude.map((p) => p.pid).join(',')], { encoding: 'utf8' });
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? '';
  }
  const rows: { pid: number; employeeId: string; rssMb: number; ppid: number }[] = [];
  let pid = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && line.slice(1).startsWith(root + path.sep)) {
      const id = line.slice(1 + root.length + 1).split(path.sep)[0];
      const p = claude.find((x) => x.pid === pid);
      if (p) rows.push({ pid, employeeId: id, rssMb: p.rssMb, ppid: p.ppid });
    }
  }
  return rows;
}

/** The Linux VM that holds every Cua desktop: the Virtualization.framework process plus the Lima host agent. */
export function vmRssMb(): number {
  return allProcs().filter((p) => /com\.apple\.Virtualization\.VirtualMachine|\.cua\/runtimes\/.*limactl/.test(p.cmd)).reduce((s, p) => s + p.rssMb, 0);
}

export function hostMemory(): { freeGb: number; inactiveGb: number; availGb: number } {
  try {
    const out = execFileSync('vm_stat', { encoding: 'utf8' });
    const page = Number(out.match(/page size of (\d+) bytes/)?.[1] ?? 16384);
    const get = (k: string) => Number(out.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? 0) * page / 1024 ** 3;
    const free = get('Pages free');
    const inactive = get('Pages inactive');
    return { freeGb: +free.toFixed(2), inactiveGb: +inactive.toFixed(2), availGb: +(free + inactive).toFixed(2) };
  } catch {
    return { freeGb: -1, inactiveGb: -1, availGb: -1 };
  }
}

export function removeDir(p: string): void {
  rmSync(p, { recursive: true, force: true });
}
