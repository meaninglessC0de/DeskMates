import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ActivityStep, Approval, CallInfo, Candidate, Capabilities, Employee, Env, Message, Permissions, Persona,
  RolePreset, Settings, Task, TeamAskResponse, TeamReport, ThreadResponse, StreamResponse,
} from '../../shared/index.ts';
import { loadCast, personaFromCast } from '../cast.ts';
import type { Bus } from '../bus.ts';
import { CallError, type Calls, type CallsHost, type CallSituation } from '../calls/types.ts';
import { OfficeError } from '../errors.ts';
import { newId } from '../ids.ts';
import { DEFAULT_PERMISSIONS, buildPresets } from '../presets.ts';
import type { InboxItem, RuntimeFactory } from '../runtime/types.ts';
import type { HostDriver, Spaces } from '../spaces/types.ts';
import type { Store } from '../store/store.ts';
import { SyncError, type Sync } from '../sync/types.ts';
import { decodeToken, makeCandidate, type CandidateInput, type RoleClient } from './hiring.ts';
import { EmployeeSupervisor, type SupervisorContext } from './supervisor.ts';

export interface OfficeDeps {
  env: Env;
  store: Store;
  bus: Bus;
  spaces: Spaces;
  hostDriver: HostDriver;
  createRuntime: RuntimeFactory;
  sync: Sync;
  /** Absolute DATA_DIR. */
  dataDir: string;
  /** Tests: a fake for the Haiku call that turns a described role into a profile. */
  roleClient?: RoleClient;
}

export interface DevSeedBody {
  employees?: (Partial<Employee> & { id: string })[];
  messages?: Message[];
  steps?: ActivityStep[];
  tasks?: Task[];
  approvals?: Approval[];
}

const LEVEL_ORDER: Record<string, number> = { needs_you: 0, stuck: 1 };

function macFirstName(): string {
  try {
    const full = execFileSync('id', ['-F'], { encoding: 'utf8', timeout: 1500 }).trim();
    if (full) return full.split(/\s+/)[0];
  } catch {
    /* fall through */
  }
  const u = os.userInfo().username;
  return u ? u[0].toUpperCase() + u.slice(1) : 'You';
}

/** Everything with state, in one place: the supervisors, the screen mutex, the colleague guards, the capabilities. */
export class Office implements SupervisorContext {
  readonly env: Env;
  readonly store: Store;
  readonly bus: Bus;
  readonly spaces: Spaces;
  readonly hostDriver: HostDriver;
  readonly createRuntime: RuntimeFactory;
  readonly sync: Sync;
  readonly dataDir: string;
  private readonly roleClient?: RoleClient;
  calls!: Calls;

  private sups = new Map<string, EmployeeSupervisor>();
  private presets: RolePreset[];
  private holder: { employeeId: string; timer: NodeJS.Timeout | null } | null = null;
  private lastManagerMs = new Map<string, number>();
  private colleagueLog: { from: string; to: string; ms: number }[] = [];
  private wakeLog: number[] = [];
  private hostCache: { at: number; ok: boolean } | null = null;
  private capOverride: Partial<Capabilities> = {};
  private defaultUserName: string | null = null;
  /** Resolves once boot recovery has finished. */
  ready: Promise<void> = Promise.resolve();

  constructor(d: OfficeDeps) {
    this.env = d.env;
    this.store = d.store;
    this.bus = d.bus;
    this.spaces = d.spaces;
    this.hostDriver = d.hostDriver;
    this.createRuntime = d.createRuntime;
    this.sync = d.sync;
    this.dataDir = d.dataDir;
    this.roleClient = d.roleClient;
    this.presets = buildPresets(d.env);
    this.store.onWrite = (table, row) => this.sync.record(table, row);
  }

  attachCalls(calls: Calls): void {
    this.calls = calls;
  }

  // ------------------------------------------------------------------ boot and shutdown

  /** Repairs what a crash left behind and brings every employee back. Recovery continues in the background; await `ready`. */
  boot(): void {
    this.store.repairAfterCrash(Date.now());
    for (const e of this.store.listEmployees()) {
      if (e.screenGrant) this.store.updateEmployee(e.id, { screenGrant: null });
      this.sups.set(e.id, new EmployeeSupervisor(this, e.id));
    }
    this.ready = Promise.all([...this.sups.values()].map((s) => s.recover())).then(async () => {
      await Promise.all([...this.sups.values()].map((s) => s.settled()));
    });
  }

  async shutdown(): Promise<void> {
    if (this.holder?.timer) clearTimeout(this.holder.timer);
    this.holder = null;
    await this.calls?.stop().catch(() => {});
    await Promise.all([...this.sups.values()].map((s) => s.dispose()));
    await this.sync.stop().catch(() => {});
  }

  // ------------------------------------------------------------------ SupervisorContext

  userName(): string {
    const s = this.store.getSettings(this.defaultSettings());
    return s.userName;
  }

  peers(exceptId: string): EmployeeSupervisor[] {
    return [...this.sups.values()].filter((s) => s.id !== exceptId);
  }

  colleagueGuard(fromId: string, toId: string): string | null {
    const now = Date.now();
    this.wakeLog = this.wakeLog.filter((t) => now - t < 60_000);
    if (this.wakeLog.length >= 20) return 'Too many messages between teammates right now. Ask your manager instead.';
    const since = Math.max(this.lastManagerMs.get(fromId) ?? 0, this.lastManagerMs.get(toId) ?? 0);
    const chain = this.colleagueLog.filter((l) => l.ms > since && ((l.from === fromId && l.to === toId) || (l.from === toId && l.to === fromId)));
    if (chain.length >= 3) return 'Limit reached. Ask your manager instead.';
    this.colleagueLog.push({ from: fromId, to: toId, ms: now });
    this.colleagueLog = this.colleagueLog.slice(-200);
    this.wakeLog.push(now);
    return null;
  }

  noteManagerMessage(employeeId: string): void {
    this.lastManagerMs.set(employeeId, Date.now());
  }

  async hostOk(): Promise<boolean> {
    const now = Date.now();
    if (this.hostCache && now - this.hostCache.at < 5000) return this.hostCache.ok;
    let ok = false;
    try {
      const s = await this.hostDriver.status();
      ok = s.installed && s.permitted;
    } catch {
      ok = false;
    }
    this.hostCache = { at: now, ok };
    return ok;
  }

  async grantScreen(employeeId: string, minutes: number | null): Promise<Employee> {
    const sup = this.sup(employeeId);
    const caps = await this.capabilities();
    if (!caps.hostScreen) throw new OfficeError(409, 'host_off', "Your screen can't be lent on this Mac.");
    if (this.holder && this.holder.employeeId !== employeeId) {
      const other = this.store.getEmployee(this.holder.employeeId)?.persona.firstName ?? 'Someone';
      throw new OfficeError(409, 'screen_busy', `${other} is using your screen. Take it back first.`);
    }
    if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) throw new OfficeError(400, 'bad_request', 'Minutes must be more than zero.');
    if (this.holder?.timer) clearTimeout(this.holder.timer);
    const untilMs = minutes === null ? null : Date.now() + minutes * 60_000;
    const timer = untilMs === null ? null : setTimeout(() => void this.revokeScreen(employeeId, 'expired'), minutes! * 60_000);
    timer?.unref();
    const already = !!this.holder;
    this.holder = { employeeId, timer };
    if (already) {
      sup['patch']({ screenGrant: { untilMs } });
    } else {
      await sup.beginGrant(untilMs);
    }
    this.bus.emit({
      type: 'notify', employeeId, kind: 'screen', title: `${sup.firstName} has your screen`,
      body: untilMs === null ? 'Until you take it back.' : `For ${minutes} minutes.`,
    });
    return sup.employee();
  }

  async revokeScreen(employeeId: string, _reason: 'released' | 'expired' | 'taken_back' | 'removed'): Promise<void> {
    if (!this.holder || this.holder.employeeId !== employeeId) return;
    if (this.holder.timer) clearTimeout(this.holder.timer);
    this.holder = null;
    const sup = this.sups.get(employeeId);
    if (sup && _reason !== 'removed') await sup.endGrant();
  }

  // ------------------------------------------------------------------ capabilities and settings

  async capabilities(): Promise<Capabilities> {
    const s = this.sync.status();
    const caps: Capabilities = {
      llm: this.env.MOCK_LLM || !!this.env.ANTHROPIC_API_KEY,
      desktops: this.env.DESKTOPS,
      calls: this.calls?.mode() ?? 'off',
      databricks: s.databricks,
      genie: s.genie,
      hostScreen: await this.hostOk(),
    };
    return { ...caps, ...this.capOverride };
  }

  /** Dev only (MOCK_LLM=1): force capability values so disabled states can be seen. `{}` resets. */
  setCapabilityOverride(o: Partial<Capabilities>): void {
    this.capOverride = o;
  }

  private defaultSettings(): Settings {
    if (this.defaultUserName === null) this.defaultUserName = this.env.USER_NAME || macFirstName();
    return { userName: this.defaultUserName, appearance: 'system', notifyMessages: true, notifyDone: true, captions: true };
  }

  getSettings(): Settings {
    return this.store.getSettings(this.defaultSettings());
  }

  patchSettings(p: Partial<Settings>): Settings {
    this.store.patchSettings(p);
    return this.getSettings();
  }

  // ------------------------------------------------------------------ employees

  private sup(id: string): EmployeeSupervisor {
    const s = this.sups.get(id);
    if (!s) throw new OfficeError(404, 'not_found', 'That person is not on your team.');
    return s;
  }

  getEmployee(id: string): Employee {
    return this.sup(id).employee();
  }

  listEmployees(): Employee[] {
    return this.store.listEmployees().sort((a, b) => {
      const pa = LEVEL_ORDER[a.state] ?? 2;
      const pb = LEVEL_ORDER[b.state] ?? 2;
      return pa - pb || b.lastActivityMs - a.lastActivityMs;
    });
  }

  listPresets(): RolePreset[] {
    return this.presets;
  }

  candidate(input: CandidateInput): Promise<Candidate> {
    return makeCandidate(input, { env: this.env, store: this.store, presets: this.presets, maxTeam: this.env.MAX_TEAM, roleClient: this.roleClient });
  }

  async hire(token: string, overrides?: { name?: string; personality?: string; permissions?: Partial<Permissions> }): Promise<Employee> {
    const body = decodeToken(token);
    if (!body) throw new OfficeError(400, 'bad_request', 'That candidate is no longer valid. Pick someone again.');
    if (this.store.countEmployees() >= this.env.MAX_TEAM) {
      throw new OfficeError(409, 'team_full', 'Your team is full. Remove someone to hire again.');
    }
    if (this.store.castIdsInUse().includes(body.castId)) {
      throw new OfficeError(409, 'candidate_taken', 'That person was just hired. Pick someone else.');
    }
    // refresh what may have changed on disk since the candidate was shown (portrait, voice sample, avatar id)
    const member = loadCast().find((c) => c.id === body.castId);
    let persona: Persona = member
      ? { ...personaFromCast(member, { role: body.persona.role, roleKey: body.persona.roleKey, workingStyle: body.persona.workingStyle, starters: body.persona.starters }, body.persona.personality), name: body.persona.name, firstName: body.persona.firstName }
      : body.persona;
    if (overrides?.name?.trim()) persona = { ...persona, name: overrides.name.trim(), firstName: overrides.name.trim().split(/\s+/)[0] };
    if (overrides?.personality?.trim()) persona = { ...persona, personality: overrides.personality.trim() };
    const preset = this.presets.find((p) => p.key === persona.roleKey);
    const permissions: Permissions = { ...(preset?.defaultPermissions ?? DEFAULT_PERMISSIONS), ...overrides?.permissions };
    const now = Date.now();
    const e: Employee = {
      id: newId('emp'), persona, permissions, state: 'starting', stateDetail: 'Starting desktop', stateSinceMs: now,
      spaceId: null, sessionId: null, model: this.env.EMPLOYEE_MODEL, unread: 0, lastActivityMs: now, screenGrant: null,
      desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: now,
    };
    this.store.insertEmployee(e, { castId: body.castId });
    await mkdir(path.join(this.dataDir, 'employees', e.id), { recursive: true });
    const sup = new EmployeeSupervisor(this, e.id);
    this.sups.set(e.id, sup);
    this.bus.emit({ type: 'employee', employee: e });
    void sup.beginHire();
    return e;
  }

  async patchEmployee(id: string, p: { persona?: Partial<Persona>; permissions?: Partial<Permissions>; model?: string }): Promise<Employee> {
    return this.sup(id).applyPatch(p);
  }

  async removeEmployee(id: string): Promise<void> {
    const sup = this.sup(id);
    this.sups.delete(id);
    await sup.remove();
  }

  pause(id: string): Employee {
    return this.sup(id).pause();
  }
  resume(id: string): Employee {
    return this.sup(id).resume();
  }
  control(id: string, on: boolean): Employee {
    return this.sup(id).control(on);
  }

  async desktopAction(id: string, action: 'restart' | 'reset' | 'start' | 'stop'): Promise<Employee> {
    const sup = this.sup(id);
    if (action === 'restart') void sup.restartDesktop();
    else if (action === 'reset') void sup.resetDesktop();
    else if (action === 'start') void sup.startDesktop();
    else await sup.stopDesktop();
    return sup.employee();
  }

  // ------------------------------------------------------------------ thread and messages

  thread(id: string, opts: { before?: number; limit?: number }): ThreadResponse {
    const sup = this.sup(id);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const messages = this.store.listMessages(id, { before: opts.before, limit });
    const fromMs = messages.length >= limit ? messages[0].createdMs : 0;
    const toMs = opts.before ?? Number.MAX_SAFE_INTEGER;
    return {
      messages,
      steps: this.store.listSteps(id, fromMs, toMs),
      approvals: this.store.listApprovals(id, fromMs, toMs),
      task: this.store.openTask(sup.id) ?? this.store.latestTask(sup.id) ?? null,
    };
  }

  sendMessage(id: string, text: string): Message {
    return this.sup(id).sendMessage(text);
  }

  markRead(id: string): void {
    this.sup(id).markRead();
  }

  decideApproval(approvalId: string, decision: 'approve' | 'deny', scope: 'once' | 'task', note?: string): Approval {
    const a = this.store.getApproval(approvalId);
    if (!a) throw new OfficeError(404, 'not_found', 'That request does not exist.');
    const sup = this.sups.get(a.employeeId);
    if (!sup) throw new OfficeError(409, 'not_pending', 'That request has already been handled.');
    return sup.decideApproval(approvalId, decision, scope, note);
  }

  // ------------------------------------------------------------------ desktop media

  private async requireUp(id: string): Promise<void> {
    this.sup(id);
    if (!(await this.spaces.healthy(id).catch(() => false))) throw new OfficeError(404, 'desktop_off', 'This desktop is off.');
  }

  private thumbCache = new Map<string, { at: number; buf: Buffer }>();
  private frameCache = new Map<string, { at: number; buf: Buffer }>();

  async thumbnail(id: string): Promise<Buffer> {
    await this.requireUp(id);
    const hit = this.thumbCache.get(id);
    if (hit && Date.now() - hit.at < 3000) return hit.buf;
    const buf = await this.spaces.thumbnail(id);
    this.thumbCache.set(id, { at: Date.now(), buf });
    return buf;
  }

  /** A fresh screenshot per call, at most four per second per employee (extra calls get the last one). */
  async frame(id: string): Promise<Buffer> {
    await this.requireUp(id);
    const hit = this.frameCache.get(id);
    if (hit && Date.now() - hit.at < 250) return hit.buf;
    const buf = await this.spaces.screenshot(id);
    this.frameCache.set(id, { at: Date.now(), buf });
    return buf;
  }

  async openStream(id: string, mode: 'view' | 'control'): Promise<StreamResponse> {
    await this.requireUp(id);
    try {
      return await this.spaces.openStream(id, mode);
    } catch {
      return { kind: 'frames', url: `/api/employees/${id}/frame.jpg` };
    }
  }

  // ------------------------------------------------------------------ calls

  async startCall(employeeIds: string[]): Promise<CallInfo> {
    const caps = await this.capabilities();
    if (caps.calls === 'off') throw new CallError(409, 'calls_off', 'Add LiveKit keys to make calls.');
    return this.calls.start(employeeIds);
  }

  callsHost(): CallsHost {
    const self = this;
    return {
      env: this.env,
      emit: (e) => this.bus.emit(e),
      employee: (id) => this.store.getEmployee(id),
      setOnCall: (id, callId) => this.sups.get(id)?.setOnCall(callId),
      postSystemMessage: (id, text) => this.sup(id).postSystem(text),
      deliverToWorker: (id, item: InboxItem) => this.sups.get(id)?.deliver(item),
      situation(id): CallSituation {
        const employee = self.getEmployee(id);
        const task = self.store.openTask(id) ?? null;
        const pending = self.store.pendingApprovals(id)[0];
        const lastQ = self.store.lastMessage(id);
        return {
          employee,
          task,
          plan: task?.plan ?? [],
          recentSteps: self.store.recentSteps(id, 8).map((s) => s.sentence),
          recentChat: self.store.recentMessages(id, 6).map((m) => ({ from: m.from === 'user' ? 'user' : 'employee', text: m.text })),
          waitingOn: pending ? pending.title : lastQ?.kind === 'question' && employee.state === 'needs_you' ? lastQ.text : null,
          notes: self.store.listNotes(id, 15),
          userName: self.userName(),
        };
      },
      screenshot: (id) => this.spaces.screenshot(id),
    };
  }

  // ------------------------------------------------------------------ team

  team(range: TeamReport['range']): Promise<TeamReport> {
    return this.sync.teamReport(range);
  }

  async ask(question: string, conversationId?: string): Promise<TeamAskResponse> {
    const caps = await this.capabilities();
    if (!caps.genie) throw new SyncError(409, 'genie_off', 'Ask is not set up. Add Databricks keys to use it.');
    return this.sync.ask(question, conversationId);
  }

  // ------------------------------------------------------------------ dev seed (MOCK_LLM=1 only; the route guards)

  devSeed(body: DevSeedBody): void {
    for (const e of body.employees ?? []) {
      const { id, ...rest } = e;
      const updated = this.store.updateEmployee(id, rest);
      this.bus.emit({ type: 'employee', employee: updated });
    }
    for (const t of body.tasks ?? []) this.store.upsertTask(t);
    for (const m of body.messages ?? []) this.store.insertMessage(m);
    for (const s of body.steps ?? []) this.store.upsertStep(s);
    for (const a of body.approvals ?? []) this.store.insertApproval(a);
  }
}
