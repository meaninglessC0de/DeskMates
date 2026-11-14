import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  ActivityStep, Approval, Employee, EmployeeState, Env, Message, MessageKind, PlanStep, Task,
} from '../../shared/index.ts';
import type { Bus } from '../bus.ts';
import { OfficeError } from '../errors.ts';
import { newId } from '../ids.ts';
import type { EmployeeRuntime, InboxItem, RuntimeFactory, RuntimeHost, ToolFamily, TurnResult, ApprovalOutcome } from '../runtime/types.ts';
import type { HostDriver, Spaces } from '../spaces/types.ts';
import type { Store } from '../store/store.ts';
import { buildBriefing } from './briefing.ts';

/** What a supervisor may ask of the office it lives in. Implemented by the Office class. */
export interface SupervisorContext {
  env: Env;
  store: Store;
  bus: Bus;
  spaces: Spaces;
  hostDriver: HostDriver;
  createRuntime: RuntimeFactory;
  dataDir: string;
  userName(): string;
  /** Other employees' supervisors (never including `exceptId`). */
  peers(exceptId: string): EmployeeSupervisor[];
  /** Null when allowed; otherwise the refusal sentence the model sees. Records the message when allowed. */
  colleagueGuard(fromId: string, toId: string): string | null;
  noteManagerMessage(employeeId: string): void;
  grantScreen(employeeId: string, minutes: number | null): Promise<Employee>;
  revokeScreen(employeeId: string, reason: 'released' | 'expired' | 'taken_back' | 'removed'): Promise<void>;
}

interface Waiter {
  resolve: (o: ApprovalOutcome) => void;
  renotified: boolean;
}

const HIRED_NOTE =
  'You have just been hired. Introduce yourself to your manager in one short sentence and ask what to start on.';
const NUDGE =
  'You stopped without finishing or asking. If the task is complete, call finish_task with a short summary. If you need your manager, call ask_user. Otherwise carry on with the next unfinished step of your plan.';

const MAX_DETAIL = 40;
function clip(s: string, n = MAX_DETAIL): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

function cleanTitle(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

type StartKind = 'hire' | 'start' | 'restart' | 'reset' | 'recover' | 'rebuild';

/**
 * One per employee. Owns the state machine, the inbox hand-off, tasks, approvals, steps and the lifecycle of the
 * desktop and the runtime. Written against the Spaces and EmployeeRuntime interfaces, so it is the real thing in mock
 * mode and in real mode.
 */
export class EmployeeSupervisor implements RuntimeHost {
  private runtime: EmployeeRuntime | null = null;
  private abort: AbortController | null = null;
  private desktop: 'down' | 'starting' | 'up';
  private bootFailed = false;
  private paused: boolean;
  private stuckReason: string | null;
  private question: string | null = null;
  private budgetPrompt: 'cost' | 'turns' | null = null;
  private budgetExtraUsd = 0;
  private turnsExtra = 0;
  private waiters = new Map<string, Waiter>();
  private call: string | null = null;
  private pendingItems: InboxItem[] = [];
  private typingOn = false;
  private typingTimer: NodeJS.Timeout | null = null;
  private task: Task | null = null;
  private lastClosedTask: Task | null = null;
  private lastAssignment = '';
  private activity: string | null = null;
  private workingSince: number | null = null;
  private turnTaskId: string | null = null;
  private flags = { asked: false, finished: false, stuck: false };
  private nudges = 0;
  private errorRestarts = 0;
  private lastStep: { id: string; sentence: string; startedMs: number } | null = null;
  private lastSdkMs = Date.now();
  private stalls = 0;
  private removed = false;
  private chain: Promise<void> = Promise.resolve();
  private watchdogTimer: NodeJS.Timeout | null = null;

  constructor(private ctx: SupervisorContext, readonly id: string) {
    const extra = ctx.store.getExtra(id);
    this.paused = extra.paused;
    this.stuckReason = extra.stuckReason;
    this.desktop = 'down';
    this.task = ctx.store.openTask(id) ?? null;
    if (this.task) this.lastAssignment = this.task.title;
    const last = ctx.store.lastMessage(id);
    const lastUser = ctx.store.lastMessage(id, 'user');
    if (last && last.from === 'employee' && last.kind === 'question' && (!lastUser || lastUser.createdMs <= last.createdMs)) {
      this.question = last.text;
    }
    this.watchdogTimer = setInterval(() => void this.watchdogTick(), 30_000);
    this.watchdogTimer.unref();
  }

  // ------------------------------------------------------------------ basics

  employee(): Employee {
    const e = this.ctx.store.getEmployee(this.id);
    if (!e) throw new Error(`No employee ${this.id}`);
    return e;
  }

  get firstName(): string {
    return this.employee().persona.firstName;
  }

  get currentState(): EmployeeState {
    return this.employee().state;
  }

  /** Resolves when every queued lifecycle operation has finished (tests, shutdown). */
  settled(): Promise<void> {
    return this.chain;
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn).catch((e) => {
      console.error(`[office] ${this.id} lifecycle error:`, e);
    });
    this.chain = run;
    return run;
  }

  private now(): number {
    return Date.now();
  }

  private patch(p: Partial<Employee>): Employee {
    const e = this.ctx.store.updateEmployee(this.id, p);
    this.ctx.bus.emit({ type: 'employee', employee: e });
    return e;
  }

  private touch(): Partial<Employee> {
    return { lastActivityMs: this.now() };
  }

  private compute(): { state: EmployeeState; detail: string } {
    const e = this.employee();
    if (this.desktop === 'starting') return { state: 'starting', detail: 'Starting desktop' };
    if (this.desktop === 'down') return { state: 'offline', detail: this.bootFailed ? "Couldn't start desktop" : 'Desktop is off' };
    if (this.paused || e.controlledByUser) return { state: 'paused', detail: e.controlledByUser ? 'Waiting for you' : 'Paused by you' };
    if (this.stuckReason) return { state: 'stuck', detail: this.stuckReason };
    const pending = this.ctx.store.pendingApprovals(this.id);
    if (pending.length > 0) return { state: 'needs_you', detail: pending[0].title };
    if (this.question) return { state: 'needs_you', detail: this.question };
    if (this.call) return { state: 'on_call', detail: 'On a call with you' };
    if (this.task) return { state: 'working', detail: this.activity ?? this.task.title };
    return { state: 'idle', detail: e.persona.role };
  }

  /** Recomputes state and stateDetail from the supervisor's flags, writes and emits when they changed. */
  refresh(): Employee {
    const prev = this.employee();
    const { state, detail } = this.compute();
    const now = this.now();
    if (prev.state === 'working' && state !== 'working') this.flushActive(now);
    if (state === 'working' && prev.state !== 'working') this.workingSince = now;
    const blockedWanted = state === 'needs_you';
    if (this.task && state !== 'offline') {
      const want: Task['status'] = blockedWanted ? 'blocked' : 'running';
      if (this.task.status !== want && (this.task.status === 'running' || this.task.status === 'blocked')) {
        this.task = { ...this.task, status: want };
        this.ctx.store.upsertTask(this.task);
        this.ctx.bus.emit({ type: 'task', task: this.task });
      }
    }
    const d = clip(detail);
    if (state !== prev.state || d !== prev.stateDetail) {
      return this.patch({ state, stateDetail: d, stateSinceMs: state !== prev.state ? now : prev.stateSinceMs });
    }
    return prev;
  }

  private flushActive(now: number): void {
    if (this.workingSince !== null && this.task) {
      this.task = { ...this.task, activeMs: this.task.activeMs + (now - this.workingSince) };
      this.ctx.store.upsertTask(this.task);
      this.ctx.bus.emit({ type: 'task', task: this.task });
    }
    this.workingSince = this.employee().state === 'working' ? now : null;
  }

  // ------------------------------------------------------------------ messages

  private notify(kind: 'approval' | 'question' | 'done' | 'stuck' | 'screen' | 'message', title: string, body: string): void {
    this.ctx.bus.emit({ type: 'notify', employeeId: this.id, title, body: body.slice(0, 160), kind });
  }

  private setTyping(on: boolean): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = null;
    if (on) {
      this.typingTimer = setTimeout(() => this.setTyping(false), 90_000);
      this.typingTimer.unref();
    }
    if (on !== this.typingOn) {
      this.typingOn = on;
      this.ctx.bus.emit({ type: 'typing', employeeId: this.id, on });
    }
  }

  private postEmployee(kind: MessageKind, text: string, notify: 'question' | 'done' | 'stuck' | 'message' | null = 'message'): Message {
    this.setTyping(false);
    const m: Message = {
      id: newId('msg'), employeeId: this.id, from: 'employee', kind, text,
      taskId: this.task?.id ?? this.turnTaskId, createdMs: this.now(), seenMs: null,
    };
    this.ctx.store.insertMessage(m);
    this.ctx.bus.emit({ type: 'message', message: m });
    const e = this.employee();
    this.patch({ unread: e.unread + 1, ...this.touch() });
    if (notify) {
      const first = e.persona.firstName;
      const title = notify === 'done' ? `${first} finished a task` : notify === 'question' ? `${first} has a question` : notify === 'stuck' ? `${first} is stuck` : first;
      this.notify(notify, title, text);
    }
    return m;
  }

  postSystem(text: string): Message {
    const m: Message = {
      id: newId('msg'), employeeId: this.id, from: 'system', kind: 'system', text,
      taskId: null, createdMs: this.now(), seenMs: null,
    };
    this.ctx.store.insertMessage(m);
    this.ctx.bus.emit({ type: 'message', message: m });
    return m;
  }

  /** The user typed a message. Delivers it, steers if working, wakes the desktop if it is off. */
  sendMessage(text: string): Message {
    const wasQuestion = !!this.question;
    const m: Message = {
      id: newId('msg'), employeeId: this.id, from: 'user', kind: 'text', text,
      taskId: this.task?.id ?? null, createdMs: this.now(), seenMs: null,
    };
    this.ctx.store.insertMessage(m);
    this.ctx.bus.emit({ type: 'message', message: m });
    this.ctx.noteManagerMessage(this.id);
    this.lastAssignment = text;
    this.question = null;
    if (this.stuckReason) this.setStuck(null);

    if (this.budgetPrompt) {
      const stop = /^\s*(no|stop|cancel|nope|don'?t)\b/i.test(text);
      const kind = this.budgetPrompt;
      this.budgetPrompt = null;
      if (stop) {
        this.closeTask('cancelled', 'Stopped by you.');
        this.deliver({ kind: 'office', text: 'Your manager said to stop. Drop this task and wait for the next one.' });
      } else {
        if (kind === 'cost') this.budgetExtraUsd += this.ctx.env.EMPLOYEE_TASK_BUDGET_USD;
        else this.turnsExtra += 300;
        this.deliver({ kind: 'office', text: 'Continue.' });
      }
      this.patch(this.touch());
      this.refresh();
      return m;
    }

    if (this.desktop === 'down') void this.startDesktop();
    if (!this.task && !wasQuestion && !this.paused) this.setTyping(true);
    this.deliver({ kind: 'manager', text, messageId: m.id, via: 'chat' });
    this.patch(this.touch());
    this.refresh();
    return m;
  }

  /** Put an item in the runtime's inbox, or hold it until the runtime is up. */
  deliver(item: InboxItem): void {
    if (this.runtime) this.runtime.deliver(item);
    else this.pendingItems.push(item);
  }

  receiveColleague(from: EmployeeSupervisor, text: string): void {
    const p = from.employee().persona;
    this.addStep(`${p.firstName} asked something`, { peer: { employeeId: from.id, direction: 'from', text } });
    this.deliver({ kind: 'colleague', fromId: from.id, fromName: p.firstName, fromRole: p.role, text });
    if (this.desktop === 'down') void this.startDesktop();
  }

  markRead(): void {
    if (this.employee().unread !== 0) this.patch({ unread: 0 });
  }

  // ------------------------------------------------------------------ tasks, steps, plan

  private openTask(): Task {
    const task: Task = {
      id: newId('tsk'), employeeId: this.id, title: cleanTitle(this.lastAssignment) || 'Task', assignedBy: 'user',
      status: 'running', plan: [], outcome: null, assignedMs: this.now(), finishedMs: null, activeMs: 0, costUsd: 0,
      inputTokens: 0, outputTokens: 0, numTurns: 0, traceId: null,
    };
    this.task = task;
    this.turnTaskId = task.id;
    this.nudges = 0;
    this.budgetExtraUsd = 0;
    this.turnsExtra = 0;
    this.ctx.store.upsertTask(task);
    this.ctx.bus.emit({ type: 'task', task });
    this.refresh();
    return task;
  }

  private closeTask(status: 'done' | 'failed' | 'cancelled', outcome: string | null): Task | null {
    if (!this.task) return null;
    this.flushActive(this.now());
    const closed: Task = { ...this.task!, status, outcome, finishedMs: this.now() };
    this.ctx.store.upsertTask(closed);
    this.ctx.bus.emit({ type: 'task', task: closed });
    this.lastClosedTask = closed;
    this.task = null;
    this.activity = null;
    this.workingSince = null;
    this.budgetPrompt = null;
    this.refresh();
    return closed;
  }

  private saveTask(t: Task): void {
    if (this.task?.id === t.id) this.task = t;
    this.ctx.store.upsertTask(t);
    this.ctx.bus.emit({ type: 'task', task: t });
  }

  private addStep(sentence: string, opts: { status?: ActivityStep['status']; peer?: ActivityStep['peer'] } = {}): string {
    const now = this.now();
    if (this.lastStep && this.lastStep.sentence === sentence && now - this.lastStep.startedMs < 60_000 && !opts.peer) {
      return this.lastStep.id;
    }
    for (const s of this.ctx.store.recentSteps(this.id, 5)) {
      if (s.status === 'running') {
        const closed: ActivityStep = { ...s, status: 'ok', endedMs: now };
        this.ctx.store.upsertStep(closed);
        this.ctx.bus.emit({ type: 'step', step: closed });
      }
    }
    const step: ActivityStep = {
      id: newId('evt'), employeeId: this.id, taskId: this.task?.id ?? null, sentence: clip(sentence),
      status: opts.status ?? 'running', startedMs: now, endedMs: opts.status && opts.status !== 'running' ? now : null,
    };
    if (opts.peer) step.peer = opts.peer;
    this.ctx.store.upsertStep(step);
    this.ctx.bus.emit({ type: 'step', step });
    this.lastStep = { id: step.id, sentence: step.sentence, startedMs: now };
    this.patch(this.touch());
    return step.id;
  }

  // ------------------------------------------------------------------ RuntimeHost: office tools

  messageUser(text: string): string {
    if (this.removed) return 'sent';
    this.postEmployee('text', text, 'message');
    return 'sent';
  }

  askUser(question: string): string {
    if (this.removed) return 'sent';
    this.flags.asked = true;
    this.postEmployee('question', question, 'question');
    this.question = question;
    this.refresh();
    return 'Asked. The answer will arrive as a new message. Continue other useful work if there is any, otherwise end your turn.';
  }

  requestApproval(a: { title: string; detail: string; kind?: 'tool' | 'big_step' }): Promise<ApprovalOutcome> {
    return this.createApproval({ title: a.title, detail: a.detail, kind: a.kind ?? 'big_step' });
  }

  private createApproval(a: { title: string; detail: string; kind: Approval['kind']; screenMinutes?: number }): Promise<ApprovalOutcome> {
    this.setTyping(false);
    const approval: Approval = {
      id: newId('apr'), employeeId: this.id, taskId: this.task?.id ?? null, title: a.title, detail: a.detail, kind: a.kind,
      status: 'pending', createdMs: this.now(), resolvedMs: null,
    };
    if (a.screenMinutes !== undefined) approval.screenMinutes = a.screenMinutes;
    this.ctx.store.insertApproval(approval);
    this.ctx.bus.emit({ type: 'approval', approval });
    const p = new Promise<ApprovalOutcome>((resolve) => this.waiters.set(approval.id, { resolve, renotified: false }));
    this.refresh();
    this.patch(this.touch());
    this.notify(a.kind === 'screen' ? 'screen' : 'approval', `${this.firstName} ${a.kind === 'screen' ? 'wants your screen' : 'needs approval'}`, a.title);
    return p;
  }

  /** The user answered an approval. Throws 409 when it is no longer pending. */
  decideApproval(approvalId: string, decision: 'approve' | 'deny', scope: 'once' | 'task', note?: string): Approval {
    const waiter = this.waiters.get(approvalId);
    const existing = this.ctx.store.getApproval(approvalId);
    if (!existing || existing.status !== 'pending' || !waiter) {
      throw new OfficeError(409, 'not_pending', 'That request has already been handled.');
    }
    const approved = decision === 'approve';
    const resolved = this.ctx.store.updateApproval(approvalId, approved ? 'approved' : 'denied', this.now());
    this.waiters.delete(approvalId);
    this.ctx.bus.emit({ type: 'approval', approval: resolved });
    waiter.resolve({ approved, note, scope });
    this.refresh();
    return resolved;
  }

  finishTask(summary: string): string {
    if (this.removed) return 'Task closed.';
    this.flags.finished = true;
    this.postEmployee('done', summary, 'done');
    this.closeTask('done', summary);
    this.setStuck(null);
    return 'Task closed.';
  }

  reportStuck(reason: string, tried: string): string {
    if (this.removed) return 'Noted.';
    this.flags.stuck = true;
    this.postEmployee('text', `${reason} ${tried}`.trim(), 'stuck');
    this.closeTask('failed', reason);
    this.setStuck(reason);
    return 'Noted. Your manager has been told.';
  }

  private setStuck(reason: string | null): void {
    this.stuckReason = reason;
    this.ctx.store.setExtra(this.id, { stuckReason: reason });
    this.refresh();
  }

  setActivity(sentence: string): string {
    this.activity = clip(sentence);
    this.addStep(sentence);
    this.refresh();
    return 'ok';
  }

  messageColleague(to: string, text: string): string {
    const e = this.employee();
    if (!e.permissions.teammates) return 'Messaging teammates is switched off for you.';
    const peers = this.ctx.peers(this.id);
    const target = peers.find((p) => p.firstName.toLowerCase() === to.trim().toLowerCase());
    if (!target) {
      const names = peers.map((p) => p.firstName).join(', ');
      return `No teammate called ${to}. ${names ? `Valid names: ${names}.` : 'You have no teammates yet.'}`;
    }
    const refusal = this.ctx.colleagueGuard(this.id, target.id);
    if (refusal) return refusal;
    this.addStep(`Messaged ${target.firstName}`, { status: 'ok', peer: { employeeId: target.id, direction: 'to', text } });
    target.receiveColleague(this, text);
    return `Sent to ${target.firstName}.`;
  }

  listColleagues(): string {
    const peers = this.ctx.peers(this.id);
    if (peers.length === 0) return 'You have no teammates yet.';
    return peers
      .map((p) => {
        const e = p.employee();
        return `${e.persona.firstName}, ${e.persona.role}, ${e.state.replace('_', ' ')}`;
      })
      .join('\n');
  }

  saveNote(text: string): string {
    this.ctx.store.addNote(this.id, text, this.now());
    return 'Saved.';
  }

  async requestScreen(reason: string, minutes: number): Promise<string> {
    const e = this.employee();
    if (!e.permissions.myScreen) return "You are not allowed to ask for your manager's screen.";
    const st = await this.ctx.hostDriver.status();
    if (!st.installed || !st.permitted) return "Your manager's screen is not available on this Mac.";
    const outcome = await this.createApproval({
      title: 'Use your screen', detail: `${reason} · ${minutes} minutes`, kind: 'screen', screenMinutes: minutes,
    });
    if (!outcome.approved) return `denied${outcome.note ? `: ${outcome.note}` : ''}`;
    try {
      await this.ctx.grantScreen(this.id, minutes);
    } catch (err) {
      return `denied: ${(err as Error).message}`;
    }
    return 'approved';
  }

  releaseScreen(): string {
    if (!this.employee().screenGrant) return "You do not have your manager's screen.";
    void this.ctx.revokeScreen(this.id, 'released');
    return 'Given back.';
  }

  // ------------------------------------------------------------------ RuntimeHost: reports

  sessionStarted(sessionId: string): void {
    if (this.removed) return;
    this.patch({ sessionId });
  }

  noteSdkMessage(): void {
    this.lastSdkMs = this.now();
  }

  turnStarted(): void {
    this.noteSdkMessage();
    this.turnTaskId = this.task?.id ?? null;
    this.flags = { asked: false, finished: false, stuck: false };
    const now = this.now();
    for (const m of this.ctx.store.markSeen(this.id, now)) {
      this.ctx.bus.emit({ type: 'message_seen', id: m.id, employeeId: this.id, seenMs: now });
    }
  }

  toolUsed(_family: ToolFamily): void {
    this.noteSdkMessage();
    this.setTyping(false);
    this.nudges = 0;
    if (!this.task) this.openTask();
  }

  step(sentence: string, opts?: { status?: 'running' | 'ok' | 'error'; peer?: ActivityStep['peer'] }): string {
    this.noteSdkMessage();
    return this.addStep(sentence, opts);
  }

  endStep(stepId: string, status: 'ok' | 'error', sentence?: string): void {
    this.noteSdkMessage();
    const s = this.ctx.store.getStep(stepId);
    if (!s) return;
    const closed: ActivityStep = { ...s, status, endedMs: this.now(), sentence: sentence ? clip(sentence) : s.sentence };
    this.ctx.store.upsertStep(closed);
    this.ctx.bus.emit({ type: 'step', step: closed });
  }

  setPlan(steps: PlanStep[]): void {
    this.noteSdkMessage();
    const task = this.task ?? this.openTask();
    this.saveTask({ ...task, plan: steps });
  }

  turnEnded(result: TurnResult): void {
    try {
      this.turnEndedInner(result);
    } finally {
      this.turnTaskId = null;
    }
  }

  private turnEndedInner(result: TurnResult): void {
    if (this.removed) return;
    this.noteSdkMessage();
    this.setTyping(false);
    const now = this.now();
    for (const s of this.ctx.store.recentSteps(this.id, 6)) {
      if (s.status === 'running') this.endStep(s.id, 'ok');
    }
    if ((result.costUsd ?? 0) > 0 || (result.inputTokens ?? 0) > 0 || (result.outputTokens ?? 0) > 0) {
      this.ctx.store.addUsage({
        employeeId: this.id, taskId: this.turnTaskId, tsMs: now, costUsd: result.costUsd ?? 0,
        inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0,
      });
      const t = this.turnTaskId ? this.ctx.store.getTask(this.turnTaskId) : undefined;
      if (t) {
        this.saveTask({
          ...t,
          costUsd: t.costUsd + (result.costUsd ?? 0),
          inputTokens: t.inputTokens + (result.inputTokens ?? 0),
          outputTokens: t.outputTokens + (result.outputTokens ?? 0),
          numTurns: t.numTurns + (result.numTurns ?? 1),
        });
      }
    }
    if (result.interrupted) {
      this.refresh();
      return;
    }
    if (result.error) {
      this.handleErrorResult(result.error);
      return;
    }
    this.errorRestarts = 0;
    if (this.flags.asked || this.flags.finished || this.flags.stuck) {
      this.refresh();
      return;
    }
    if (!this.task) {
      this.refresh();
      return;
    }
    if (this.checkLimits()) return;
    if (this.employee().state === 'paused') return;
    if (this.nudges < 2) {
      this.nudges++;
      this.deliver({ kind: 'office', text: NUDGE });
      return;
    }
    this.closeTask('failed', 'Stopped making progress');
    this.setStuck('Stopped making progress');
  }

  private handleErrorResult(error: string): void {
    if (error === 'error_max_turns' || error === 'error_max_budget_usd') {
      this.enqueue(async () => {
        await this.restartRuntime();
        this.deliver({ kind: 'office', text: 'Continue.' });
      });
      return;
    }
    if (this.errorRestarts < 1) {
      this.errorRestarts++;
      this.enqueue(async () => {
        await this.restartRuntime();
        if (this.task) this.deliver({ kind: 'office', text: 'Your last turn failed. Carry on with your task.' });
      });
      return;
    }
    this.closeTask('failed', 'Something went wrong with my session.');
    this.setStuck('Something went wrong with my session.');
  }

  private checkLimits(): boolean {
    const t = this.task;
    if (!t) return false;
    const limit = this.ctx.env.EMPLOYEE_TASK_BUDGET_USD + this.budgetExtraUsd;
    if (t.costUsd >= limit) return this.askLimit('cost', `I've used ${money(t.costUsd)} on this. Keep going?`);
    if (t.numTurns >= 300 + this.turnsExtra) return this.askLimit('turns', "I've been at this a long time. Keep going?");
    return false;
  }

  private askLimit(kind: 'cost' | 'turns', text: string): boolean {
    void this.runtime?.interrupt();
    this.budgetPrompt = kind;
    this.postEmployee('question', text, 'question');
    this.question = text;
    this.refresh();
    return true;
  }

  // ------------------------------------------------------------------ lifecycle

  private async buildBriefingText(): Promise<string> {
    const e = this.employee();
    return buildBriefing({
      now: new Date(),
      userName: this.ctx.userName(),
      employee: e,
      teammates: this.ctx.peers(this.id).map((p) => {
        const pe = p.employee();
        return { firstName: pe.persona.firstName, role: pe.persona.role, state: pe.state };
      }),
      notes: this.ctx.store.listNotes(this.id, 40),
      task: this.task,
    });
  }

  private home(): string {
    return path.join(this.ctx.dataDir, 'employees', this.id);
  }

  private async startRuntime(intro: InboxItem[], markUp = false): Promise<void> {
    await mkdir(this.home(), { recursive: true });
    const abort = new AbortController();
    const runtime = this.ctx.createRuntime({
      env: this.ctx.env, host: this, spaces: this.ctx.spaces, hostDriver: this.ctx.hostDriver, home: this.home(), signal: abort.signal,
    });
    this.abort = abort;
    this.runtime = runtime;
    await runtime.setPaused(this.paused || this.employee().controlledByUser);
    await runtime.start();
    if (markUp) {
      this.desktop = 'up';
      this.refresh();
    }
    runtime.deliver({ kind: 'office', text: await this.buildBriefingText() });
    for (const i of intro) runtime.deliver(i);
    const held = this.pendingItems;
    this.pendingItems = [];
    for (const i of held) runtime.deliver(i);
    const grant = this.employee().screenGrant;
    if (grant) await runtime.attachHost();
  }

  private async disposeRuntime(): Promise<void> {
    const rt = this.runtime;
    this.runtime = null;
    this.abort?.abort();
    this.abort = null;
    this.setTyping(false);
    if (rt) await rt.dispose().catch(() => {});
    this.expirePending('The desktop was stopped.');
    for (const s of this.ctx.store.recentSteps(this.id, 6)) if (s.status === 'running') this.endStep(s.id, 'ok');
  }

  private expirePending(note: string): void {
    for (const [id, w] of this.waiters) {
      const a = this.ctx.store.updateApproval(id, 'expired', this.now());
      this.ctx.bus.emit({ type: 'approval', approval: a });
      w.resolve({ approved: false, note, scope: 'once' });
    }
    this.waiters.clear();
  }

  private async restartRuntime(): Promise<void> {
    await this.disposeRuntime();
    if (this.desktop === 'up' && !this.removed) await this.startRuntime([]);
  }

  private async bringUp(kind: StartKind): Promise<void> {
    this.desktop = 'starting';
    this.bootFailed = false;
    this.refresh();
    try {
      const e = this.employee();
      const opts = { internet: e.permissions.internet, onProgress: () => {} };
      const info = kind === 'reset' ? await this.ctx.spaces.reset(this.id, opts) : await this.ctx.spaces.ensure(this.id, opts);
      if (this.removed) return;
      this.patch({ spaceId: info.id, desktopSinceMs: this.now(), pendingRestart: false });
      const intro = this.introFor(kind);
      await this.startRuntime(intro, true);
      if (kind === 'hire') this.setTyping(true);
    } catch (err) {
      console.error(`[office] ${this.id} could not start:`, (err as Error).message);
      await this.disposeRuntime();
      this.desktop = 'down';
      this.bootFailed = true;
      this.patch({ desktopSinceMs: null });
      this.ctx.bus.emit({ type: 'toast', text: `Couldn't start ${this.firstName}'s desktop.`, tone: 'error' });
      this.refresh();
    }
  }

  private introFor(kind: StartKind): InboxItem[] {
    const openTask = !!this.task && !this.question;
    switch (kind) {
      case 'hire':
        return [{ kind: 'office', text: HIRED_NOTE }];
      case 'recover': {
        if (!this.task || this.question) return [];
        const hadApproval = this.ctx.store.listApprovals(this.id, 0, Number.MAX_SAFE_INTEGER).some((a) => a.status === 'expired' && a.taskId === this.task!.id);
        return [{
          kind: 'office',
          text: hadApproval
            ? 'The app restarted and your approval request was lost. Ask again if you still need it, otherwise carry on.'
            : 'The app restarted. Carry on with your task.',
        }];
      }
      case 'reset':
      case 'rebuild':
        return [{
          kind: 'office',
          text: `Your computer had to be rebuilt. Files under ~/work are gone; your notes and plan are intact.${openTask ? ' Carry on.' : ''}`,
        }];
      case 'start':
      case 'restart':
        return openTask ? [{ kind: 'office', text: 'Your desktop was restarted. Carry on with your task.' }] : [];
    }
  }

  /** Hire: the desktop and runtime come up in the background. */
  beginHire(): Promise<void> {
    this.desktop = 'starting';
    return this.enqueue(() => this.bringUp('hire'));
  }

  /** Office boot: bring a running desktop's employee back (employee-runtime.md 4.8). */
  async recover(): Promise<void> {
    const st = await this.ctx.spaces.state(this.id).catch(() => 'absent' as const);
    if (st === 'running') {
      this.desktop = 'starting';
      this.refresh();
      return this.enqueue(() => this.bringUp('recover'));
    }
    this.desktop = 'down';
    this.patch({ desktopSinceMs: null });
    this.refresh();
  }

  startDesktop(): Promise<void> {
    if (this.desktop !== 'down') return this.chain;
    this.desktop = 'starting';
    this.refresh();
    return this.enqueue(async () => {
      await this.disposeRuntime();
      await this.bringUp('start');
    });
  }

  stopDesktop(): Promise<void> {
    return this.enqueue(async () => {
      await this.ctx.revokeScreen(this.id, 'taken_back').catch(() => {});
      await this.disposeRuntime();
      await this.ctx.spaces.sleep(this.id).catch(() => {});
      this.desktop = 'down';
      this.bootFailed = false;
      this.patch({ desktopSinceMs: null });
      this.refresh();
    });
  }

  restartDesktop(): Promise<void> {
    this.desktop = 'starting';
    this.refresh();
    return this.enqueue(async () => {
      await this.ctx.revokeScreen(this.id, 'taken_back').catch(() => {});
      await this.disposeRuntime();
      await this.ctx.spaces.sleep(this.id).catch(() => {});
      await this.bringUp('restart');
    });
  }

  resetDesktop(): Promise<void> {
    this.desktop = 'starting';
    this.refresh();
    return this.enqueue(async () => {
      await this.ctx.revokeScreen(this.id, 'taken_back').catch(() => {});
      await this.disposeRuntime();
      await this.bringUp('reset');
    });
  }

  // ------------------------------------------------------------------ user controls

  pause(): Employee {
    this.paused = true;
    this.ctx.store.setExtra(this.id, { paused: true });
    void this.runtime?.setPaused(true);
    return this.refresh();
  }

  /** Resume; on a stuck employee this is "Try again". */
  resume(): Employee {
    const wasStuck = !!this.stuckReason;
    this.paused = false;
    this.ctx.store.setExtra(this.id, { paused: false });
    if (wasStuck) {
      this.setStuck(null);
      if (this.lastClosedTask?.status === 'failed' && !this.task) {
        const reopened: Task = { ...this.lastClosedTask, status: 'running', finishedMs: null, outcome: null };
        this.task = reopened;
        this.ctx.store.upsertTask(reopened);
        this.ctx.bus.emit({ type: 'task', task: reopened });
      }
      this.nudges = 0;
      this.deliver({ kind: 'office', text: 'Your manager asked you to try again. Look at the screen first, then carry on.' });
    }
    void this.runtime?.setPaused(this.employee().controlledByUser);
    if (this.desktop === 'down') void this.startDesktop();
    return this.refresh();
  }

  control(on: boolean): Employee {
    this.patch({ controlledByUser: on });
    void this.runtime?.setPaused(on || this.paused);
    if (!on) this.deliver({ kind: 'office', text: 'Your manager used your desktop for a moment. Look at the screen before you continue.' });
    return this.refresh();
  }

  async applyPatch(p: { persona?: Partial<Employee['persona']>; permissions?: Partial<Employee['permissions']>; model?: string }): Promise<Employee> {
    const before = this.employee();
    const patch: Partial<Employee> = {};
    let pending = before.pendingRestart;
    if (p.persona) {
      patch.persona = { ...before.persona, ...p.persona };
      if (this.desktop === 'up' && (p.persona.personality !== undefined || p.persona.workingStyle !== undefined)) pending = true;
    }
    if (p.model !== undefined && p.model !== before.model) {
      patch.model = p.model;
      if (this.desktop === 'up') pending = true;
    }
    if (p.permissions) {
      patch.permissions = { ...before.permissions, ...p.permissions };
      if (p.permissions.internet !== undefined && p.permissions.internet !== before.permissions.internet && this.desktop === 'up') {
        try {
          await this.ctx.spaces.setInternet(this.id, p.permissions.internet);
        } catch {
          pending = true;
        }
      }
    }
    patch.pendingRestart = pending;
    this.patch(patch);
    if (p.permissions) {
      this.runtime?.onPermissionsChanged();
      if (p.permissions.myScreen === false && this.employee().screenGrant) await this.ctx.revokeScreen(this.id, 'taken_back');
    }
    return this.refresh();
  }

  // ------------------------------------------------------------------ screen grant (called by the Office, which holds the mutex)

  async beginGrant(untilMs: number | null): Promise<void> {
    this.patch({ screenGrant: { untilMs } });
    await this.runtime?.attachHost();
    const until = untilMs ? new Date(untilMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
    this.deliver({
      kind: 'office',
      text: `You have your manager's screen${until ? ` until ${until}` : ' until they take it back'}. Use the host tools. Work in the background where you can; they are still using it.`,
    });
    this.refresh();
  }

  async endGrant(): Promise<void> {
    if (!this.employee().screenGrant) return;
    this.patch({ screenGrant: null });
    await this.runtime?.detachHost();
    this.deliver({ kind: 'office', text: "Your manager's screen has been returned. You are back on your own computer." });
    this.refresh();
  }

  // ------------------------------------------------------------------ calls

  setOnCall(callId: string | null): void {
    this.call = callId;
    this.refresh();
  }

  // ------------------------------------------------------------------ watchdog

  /** Every 30 s. Public so tests can drive it. */
  async watchdogTick(): Promise<void> {
    if (this.removed) return;
    const now = this.now();
    for (const a of this.ctx.store.pendingApprovals(this.id)) {
      const w = this.waiters.get(a.id);
      if (w && !w.renotified && now - a.createdMs > 10 * 60_000) {
        w.renotified = true;
        this.notify('approval', `${this.firstName} still needs approval`, a.title);
      }
    }
    if (this.desktop === 'up' && !(await this.ctx.spaces.healthy(this.id).catch(() => false))) {
      this.enqueue(async () => {
        await this.disposeRuntime();
        await this.bringUp('rebuild');
      });
      return;
    }
    if (this.task && this.employee().state === 'working' && this.runtime && now - this.lastSdkMs > 4 * 60_000) {
      this.stalls++;
      this.lastSdkMs = now;
      if (this.stalls >= 2) {
        this.closeTask('failed', 'Stalled');
        this.setStuck('Stalled');
      } else {
        await this.runtime.interrupt();
        this.deliver({ kind: 'office', text: 'You stalled. Look at the screen first, then continue or call report_stuck.' });
      }
    }
  }

  // ------------------------------------------------------------------ removal

  async remove(): Promise<void> {
    this.removed = true;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    await this.chain.catch(() => {});
    await this.ctx.revokeScreen(this.id, 'removed').catch(() => {});
    await this.disposeRuntime();
    await this.ctx.spaces.remove(this.id).catch(() => {});
    this.ctx.store.deleteEmployee(this.id);
    await rm(this.home(), { recursive: true, force: true }).catch(() => {});
    this.ctx.bus.emit({ type: 'employee_removed', id: this.id });
  }

  /** Shutdown without deleting anything. */
  async dispose(): Promise<void> {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.setTyping(false);
    await this.chain.catch(() => {});
    const rt = this.runtime;
    this.runtime = null;
    this.abort?.abort();
    await rt?.dispose().catch(() => {});
    for (const w of this.waiters.values()) w.resolve({ approved: false, note: 'The app is closing.', scope: 'once' });
    this.waiters.clear();
  }
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
