import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  ActivityStep, Approval, Employee, EmployeeState, Env, Message, MessageKind, PlanStep, Task,
} from '../../shared/index.ts';
import type { Bus } from '../bus.ts';
import { OfficeError } from '../errors.ts';
import { newId } from '../ids.ts';
import { isRuntimeUnavailable } from '../runtime/errors.ts';
import type { EmployeeRuntime, GrantedApproval, InboxItem, RuntimeFactory, RuntimeHost, ToolFamily, TurnResult, ApprovalOutcome } from '../runtime/types.ts';
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
  'You have just been hired. Say hello to your manager in one short sentence with message_user: your first name, your role, and that you are ready for a first task. It is a greeting, not a question, so do not use ask_user.';
const NUDGE =
  'You stopped without finishing or asking. If the task is complete, call finish_task with a short summary. If you need a decision from your manager, call ask_user. If you are blocked with no way forward, call report_stuck. Otherwise carry on with the next unfinished step of your plan.';

/** How long an employee waits for a teammate before the office tells her to carry on. */
export const WAIT_TIMEOUT_MS = 150_000; // 2.5 min: long enough for a real piece of work, short enough that a lost message is not a dead desk

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
  private inTurn = false;
  private messaged = new Map<string, number>();
  private flags = { asked: false, finished: false, stuck: false, waited: false };
  /** Set by wait_for_colleague: who she is waiting for. Cleared by a manager or colleague message, the timeout, or a task close. */
  /** How long she waits for a teammate before the office nudges her on (tests shorten it). */
  waitTimeoutMs = WAIT_TIMEOUT_MS;
  private granted: { title: string; detail: string; atMs: number; taskId: string | null }[] = [];
  private waiting: { name: string; timer: NodeJS.Timeout | null } | null = null;
  private nudges = 0;
  private errorRestarts = 0;
  private lastStep: { id: string; sentence: string; startedMs: number; taskId: string | null } | null = null;
  /** While > 0, employee patches are written but announced once, when the outermost batch ends (one event per transition). */
  private holdDepth = 0;
  private heldEmployee = false;
  /** finish_task / report_stuck ran inside a turn: the task closes when the turn's result (and its cost) arrives, or after 3 s. */
  private pendingClose: { status: 'done' | 'failed'; outcome: string; stuck: string | null; timer: NodeJS.Timeout } | null = null;
  /** The hire turn: the employee shows `starting` until the greeting turn ends, and manager messages wait for it. */
  private greeting = false;
  private greetTimer: NodeJS.Timeout | null = null;
  private greetHeld: InboxItem[] = [];
  /** A turn's trailing plain text, held while the nudge that usually follows may turn it into a tool bubble. */
  private heldFinal: { text: string; timer: NodeJS.Timeout } | null = null;
  private nudgedThisTurn = false;
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
    if (this.holdDepth > 0) this.heldEmployee = true;
    else this.ctx.bus.emit({ type: 'employee', employee: e });
    return e;
  }

  private emitHeld(): void {
    if (!this.heldEmployee) return;
    this.heldEmployee = false;
    this.ctx.bus.emit({ type: 'employee', employee: this.employee() });
  }

  /** Runs `fn` with employee events held back, then announces the final employee once. */
  private batch<T>(fn: () => T): T {
    this.holdDepth++;
    try {
      return fn();
    } finally {
      this.holdDepth--;
      if (this.holdDepth === 0) this.emitHeld();
    }
  }

  private touch(): Partial<Employee> {
    return { lastActivityMs: this.now() };
  }

  private compute(): { state: EmployeeState; detail: string } {
    const e = this.employee();
    if (this.desktop === 'starting') return { state: 'starting', detail: 'Starting desktop' };
    if (this.desktop === 'down') return { state: 'offline', detail: this.bootFailed ? "Couldn't start desktop" : 'Desktop is off' };
    if (this.greeting) return { state: 'starting', detail: 'Starting desktop' };
    if (this.paused || e.controlledByUser) return { state: 'paused', detail: e.controlledByUser ? 'You have control' : 'Paused by you' };
    if (this.stuckReason) return { state: 'stuck', detail: this.stuckReason };
    const pending = this.ctx.store.pendingApprovals(this.id);
    if (pending.length > 0) return { state: 'needs_you', detail: pending[0].title };
    if (this.question) return { state: 'needs_you', detail: this.question };
    if (this.call) return { state: 'on_call', detail: 'On a call with you' };
    if (this.task) return { state: 'working', detail: this.waiting ? `Waiting for ${this.waiting.name}` : this.activity ?? this.task.title };
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

  private postEmployee(
    kind: MessageKind, text: string, notify: 'question' | 'done' | 'stuck' | 'message' | null = 'message', taskId?: string | null,
  ): Message {
    this.setTyping(false);
    const m: Message = {
      id: newId('msg'), employeeId: this.id, from: 'employee', kind, text,
      taskId: taskId !== undefined ? taskId : this.task?.id ?? this.turnTaskId, createdMs: this.now(), seenMs: null,
    };
    this.ctx.store.insertMessage(m);
    const e = this.employee();
    this.patch({ unread: e.unread + 1, ...this.touch() });
    this.emitHeld();
    this.ctx.bus.emit({ type: 'message', message: m });
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
    this.flushClose();
    this.flushHeldFinal();
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
    this.setStuckFlag(null); // the refresh at the end of this method announces the new state

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
    this.ensureRuntime();
    this.patch(this.touch());
    this.refresh();
    return m;
  }

  /** Put an item in the runtime's inbox, or hold it until the runtime is up. */
  deliver(item: InboxItem): void {
    // a teammate or the manager wrote: whoever she was waiting for no longer matters, she is awake again
    if (this.waiting && (item.kind === 'manager' || item.kind === 'colleague')) this.clearWaiting();
    // a new hire writes her greeting first: what people say to her in the meantime is handled right after it
    if (this.greeting && (item.kind === 'manager' || item.kind === 'colleague')) {
      this.greetHeld.push(item);
      return;
    }
    if (this.runtime) this.runtime.deliver(item);
    else this.pendingItems.push(item);
  }

  receiveColleague(from: EmployeeSupervisor, text: string): void {
    const p = from.employee().persona;
    const replied = this.now() - (this.messaged.get(from.id) ?? 0) < 10 * 60_000;
    this.addStep(`${p.firstName} ${replied ? 'replied' : 'asked something'}`, { peer: { employeeId: from.id, direction: 'from', text } });
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
    const now = this.now();
    const activeMs = this.task.activeMs + (this.workingSince !== null ? now - this.workingSince : 0);
    // A task reported done has a finished plan: employees often write the plan once and stop ticking it, and a done
    // task with open steps reads as unfinished work. A failed or cancelled task keeps its plan as it was.
    const plan = status === 'done' ? this.task.plan.map((p) => (p.status === 'done' ? p : { ...p, status: 'done' as const })) : this.task.plan;
    const closed: Task = { ...this.task, plan, status, outcome, finishedMs: now, activeMs };
    this.ctx.store.upsertTask(closed);
    this.ctx.bus.emit({ type: 'task', task: closed });
    this.lastClosedTask = closed;
    this.task = null;
    this.activity = null;
    this.clearWaiting(false);
    this.granted = [];
    this.workingSince = null;
    this.budgetPrompt = null;
    this.refresh();
    return closed;
  }

  /** Close a task as failed and mark the employee stuck in one transition (working to stuck, never through idle). */
  private failTask(outcome: string, stuck: string): void {
    this.flushClose();
    this.batch(() => {
      this.setStuckFlag(stuck);
      this.closeTask('failed', outcome);
      this.refresh();
    });
  }

  /**
   * finish_task and report_stuck. Inside a turn the cost of the task is only known when the turn's result arrives,
   * so the task closes then (at most 3 s later) with its real numbers; the bubble has already been posted.
   * Outside a turn it closes at once. Either way the state changes in one employee event.
   */
  private closeAfterTurn(status: 'done' | 'failed', outcome: string, stuck: string | null, post: (taskId: string | null) => void): void {
    this.flushClose();
    const taskId = this.task?.id ?? this.turnTaskId;
    if (!this.task || !this.inTurn) {
      this.batch(() => {
        this.setStuckFlag(stuck);
        this.closeTask(status, outcome);
        post(taskId);
        this.refresh();
      });
      return;
    }
    post(taskId);
    const timer = setTimeout(() => this.flushClose(), 3000);
    timer.unref();
    this.pendingClose = { status, outcome, stuck, timer };
  }

  private flushClose(): void {
    const c = this.pendingClose;
    if (!c) return;
    this.pendingClose = null;
    clearTimeout(c.timer);
    if (this.removed) return;
    this.batch(() => {
      this.setStuckFlag(c.stuck);
      this.closeTask(c.status, c.outcome);
      this.refresh();
    });
  }

  private saveTask(t: Task): void {
    if (this.task?.id === t.id) this.task = t;
    this.ctx.store.upsertTask(t);
    this.ctx.bus.emit({ type: 'task', task: t });
  }

  private addStep(sentence: string, opts: { status?: ActivityStep['status']; peer?: ActivityStep['peer'] } = {}): string {
    const now = this.now();
    if (this.lastStep && !opts.peer && this.lastStep.sentence === clip(sentence) && this.lastStep.taskId === (this.task?.id ?? null)) {
      // the same action again inside one task: one step while it runs, or for a moment after it ended in the same turn
      const prev = this.ctx.store.getStep(this.lastStep.id);
      if (prev && (prev.status === 'running' || (this.inTurn && prev.endedMs !== null && now - prev.endedMs < 2_000))) {
        return this.lastStep.id;
      }
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
    this.lastStep = { id: step.id, sentence: step.sentence, startedMs: now, taskId: step.taskId };
    this.patch(this.touch());
    return step.id;
  }

  // ------------------------------------------------------------------ RuntimeHost: office tools

  messageUser(text: string, opts?: { final?: boolean }): string {
    if (this.removed) return 'sent';
    if (opts?.final) {
      this.holdFinal(text);
      return 'sent';
    }
    this.flushHeldFinal();
    this.postEmployee('text', text, 'message');
    return 'sent';
  }

  /**
   * The trailing plain text of a turn. With a task open the employee is about to be nudged to finish or ask, and
   * she often does it with the same sentence: keep the text back until that tool bubble says whether it is a duplicate.
   */
  private holdFinal(text: string): void {
    if (this.heldFinal) {
      if (sameSaying(this.heldFinal.text, text)) return;
      this.flushHeldFinal();
    }
    if (!this.task) {
      this.postEmployee('text', text, 'message');
      return;
    }
    const timer = setTimeout(() => this.flushHeldFinal(), 20_000);
    timer.unref();
    this.heldFinal = { text, timer };
  }

  private flushHeldFinal(): void {
    const h = this.heldFinal;
    if (!h) return;
    this.heldFinal = null;
    clearTimeout(h.timer);
    if (!this.removed) this.postEmployee('text', h.text, 'message');
  }

  /** A tool bubble (question, done, stuck) is about to be posted: drop the held text when it says the same thing. */
  private settleHeldFinal(text: string): void {
    const h = this.heldFinal;
    if (!h) return;
    if (sameSaying(h.text, text)) {
      this.heldFinal = null;
      clearTimeout(h.timer);
    } else this.flushHeldFinal();
  }

  askUser(question: string): string {
    if (this.removed) return 'sent';
    this.flags.asked = true;
    this.settleHeldFinal(question);
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
    if (approved && existing.kind === 'big_step') {
      this.granted.push({ title: existing.title, detail: existing.detail, atMs: this.now(), taskId: existing.taskId });
      this.granted = this.granted.slice(-20);
    }
    waiter.resolve({ approved, note, scope });
    this.refresh();
    return resolved;
  }

  /** Approvals she raised herself and the manager approved, for the task that is open now (see the gate). */
  grantedApprovals(): GrantedApproval[] {
    const id = this.task?.id;
    if (!id) return [];
    return this.granted.filter((g) => g.taskId === id || g.taskId === null).map(({ title, detail, atMs }) => ({ title, detail, atMs }));
  }

  finishTask(summary: string): string {
    if (this.removed) return 'Task closed.';
    // Nothing is open (a greeting, a chat answer): there is no task to close and nothing more to tell the manager.
    // Without this a new hire says hello and then reports "I said hello" as finished work.
    if (!this.task) return 'There is no open task, so there is nothing to finish. You are done for now.';
    this.flags.finished = true;
    this.settleHeldFinal(summary);
    this.closeAfterTurn('done', summary, null, (taskId) => this.postEmployee('done', summary, 'done', taskId));
    return 'Task closed.';
  }

  reportStuck(reason: string, tried: string): string {
    if (this.removed) return 'Noted.';
    this.flags.stuck = true;
    const said = `${reason} ${tried}`.trim();
    this.settleHeldFinal(said);
    this.closeAfterTurn('failed', reason, reason, (taskId) => this.postEmployee('text', said, 'stuck', taskId));
    return 'Noted. Your manager has been told.';
  }

  private setStuckFlag(reason: string | null): void {
    if (this.stuckReason === reason) return;
    this.stuckReason = reason;
    this.ctx.store.setExtra(this.id, { stuckReason: reason });
  }

  private setStuck(reason: string | null): void {
    this.setStuckFlag(reason);
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
    this.messaged.set(target.id, this.now());
    this.addStep(`Messaged ${target.firstName}`, { status: 'ok', peer: { employeeId: target.id, direction: 'to', text } });
    target.receiveColleague(this, text);
    return `Sent to ${target.firstName}.`;
  }

  waitForColleague(name: string, _reason?: string): string {
    const e = this.employee();
    if (!e.permissions.teammates) return 'Messaging teammates is switched off for you.';
    const peers = this.ctx.peers(this.id);
    const target = peers.find((p) => p.firstName.toLowerCase() === name.trim().toLowerCase());
    if (!target) {
      const names = peers.map((p) => p.firstName).join(', ');
      return `No teammate called ${name}. ${names ? `Valid names: ${names}.` : 'You have no teammates yet.'}`;
    }
    this.clearWaiting(false);
    this.flags.waited = true;
    this.waiting = { name: target.firstName, timer: null };
    this.armWaitTimer();
    this.addStep(`Waiting for ${target.firstName}`, { status: 'ok' });
    this.refresh();
    return `Noted. Stop now: the office will wake you when ${target.firstName}'s message arrives.`;
  }

  private armWaitTimer(): void {
    const w = this.waiting;
    if (!w || this.paused) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => this.waitTimedOut(w), this.waitTimeoutMs);
    w.timer.unref();
  }

  /** Stops the clock but keeps the flag (pause: the clock starts again on resume). */
  private pauseWaitTimer(): void {
    if (this.waiting?.timer) clearTimeout(this.waiting.timer);
    if (this.waiting) this.waiting.timer = null;
  }

  private waitTimedOut(w: { name: string; timer: NodeJS.Timeout | null }): void {
    if (this.removed || this.waiting !== w) return;
    this.clearWaiting();
    this.deliver({
      kind: 'office',
      text: `${w.name} has not replied yet. Carry on with anything you can do without them, message them again, or ask your manager.`,
    });
  }

  /** Forget who she was waiting for and stop the clock. `announce` refreshes the state line. */
  private clearWaiting(announce = true): void {
    const w = this.waiting;
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    this.waiting = null;
    if (announce) this.refresh();
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

  /**
   * The runtime has taken waiting items into the model's hands. Called again for a message that steers a turn already
   * running: that only marks it seen and leaves the turn's flags alone.
   */
  turnStarted(): void {
    this.noteSdkMessage();
    if (!this.inTurn) {
      this.inTurn = true;
      this.turnTaskId = this.task?.id ?? null;
      this.flags = { asked: false, finished: false, stuck: false, waited: false };
      // a new turn is starting (a queued message, a note): she is no longer waiting
      this.clearWaiting();
    }
    if (this.greeting) return; // a message sent during the greeting has not reached her yet
    const now = this.now();
    for (const m of this.ctx.store.markSeen(this.id, now)) {
      this.ctx.bus.emit({ type: 'message_seen', id: m.id, employeeId: this.id, seenMs: now });
    }
  }

  toolUsed(_family: ToolFamily): void {
    this.noteSdkMessage();
    this.setTyping(false);
    this.nudges = 0;
    this.flushClose();
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
    this.nudgedThisTurn = false;
    try {
      this.turnEndedInner(result);
    } finally {
      this.turnTaskId = null;
      this.inTurn = false;
      this.flushClose();
      if (!this.nudgedThisTurn) this.flushHeldFinal();
      this.endGreeting();
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
    this.addTurnUsage(result, now);
    // finish_task / report_stuck ran in this turn: close the task now that it carries the turn's cost
    this.flushClose();
    if (result.interrupted) {
      this.refresh();
      return;
    }
    if (result.error) {
      this.handleErrorResult(result.error);
      return;
    }
    this.errorRestarts = 0;
    if (this.flags.asked || this.flags.finished || this.flags.stuck || this.flags.waited) {
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
      this.nudgedThisTurn = true;
      this.deliver({ kind: 'office', text: NUDGE });
      return;
    }
    this.flushHeldFinal();
    this.failTask('Stopped making progress', 'Stopped making progress');
  }

  private addTurnUsage(result: TurnResult, now: number): void {
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
    this.failTask('Something went wrong with my session.', 'Something went wrong with my session.');
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
    try {
      await runtime.start();
    } catch (err) {
      this.pendingItems.unshift(...intro);
      throw err;
    }
    if (markUp) {
      this.desktop = 'up';
      this.refresh();
    }
    runtime.deliver({ kind: 'office', text: await this.buildBriefingText() });
    for (const i of intro) runtime.deliver(i);
    const held = this.pendingItems;
    this.pendingItems = [];
    for (const i of held) this.deliver(i);
    const grant = this.employee().screenGrant;
    if (grant) await runtime.attachHost();
  }

  private async disposeRuntime(): Promise<void> {
    const rt = this.runtime;
    this.runtime = null;
    this.abort?.abort();
    this.abort = null;
    this.inTurn = false;
    this.clearWaiting(false);
    this.flushClose();
    this.flushHeldFinal();
    this.endGreeting(true);
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
      if (kind === 'hire') this.beginGreeting();
      await this.startRuntime(intro, true);
      if (kind === 'hire') this.setTyping(true);
    } catch (err) {
      if (isRuntimeUnavailable(err) && !this.removed) {
        // the desktop is up but the brain cannot start: she is stuck with a sentence the manager can read
        await this.disposeRuntime();
        this.desktop = 'up';
        this.runtimeUnavailable(err.message);
        return;
      }
      console.error(`[office] ${this.id} could not start:`, (err as Error).message);
      await this.disposeRuntime();
      this.desktop = 'down';
      this.bootFailed = true;
      this.patch({ desktopSinceMs: null });
      this.ctx.bus.emit({ type: 'toast', text: `Couldn't start ${this.firstName}'s desktop.`, tone: 'error' });
      this.refresh();
    }
  }

  /** Hire: she stays `starting` until her greeting turn ends (bounded), so `idle` never comes before her first message. */
  private beginGreeting(): void {
    this.greeting = true;
    if (this.greetTimer) clearTimeout(this.greetTimer);
    this.greetTimer = setTimeout(() => this.endGreeting(), 30_000);
    this.greetTimer.unref();
  }

  private endGreeting(quiet = false): void {
    if (!this.greeting) return;
    this.greeting = false;
    if (this.greetTimer) clearTimeout(this.greetTimer);
    this.greetTimer = null;
    const held = this.greetHeld.splice(0);
    if (!quiet) this.refresh();
    if (this.removed) return;
    if (held.some((i) => i.kind === 'manager') && !this.task && !this.paused) this.setTyping(true);
    for (const i of held) this.deliver(i);
  }

  private runtimeUnavailable(reason: string): void {
    this.setStuck(reason);
    this.postEmployee('text', reason, 'stuck');
  }

  /** The desktop is up but no runtime is: try to start one (a message, "Try again"). Held items go in when it starts. */
  private ensureRuntime(): void {
    if (this.runtime || this.desktop !== 'up' || this.removed) return;
    void this.enqueue(async () => {
      if (this.runtime || this.desktop !== 'up' || this.removed) return;
      try {
        await this.startRuntime([]);
      } catch (err) {
        await this.disposeRuntime();
        if (isRuntimeUnavailable(err)) this.runtimeUnavailable(err.message);
        else console.error(`[office] ${this.id} could not start the runtime:`, (err as Error).message);
      }
    });
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
    this.pauseWaitTimer();
    this.ctx.store.setExtra(this.id, { paused: true });
    void this.runtime?.setPaused(true);
    return this.refresh();
  }

  /** Resume; on a stuck employee this is "Try again". */
  resume(): Employee {
    return this.batch(() => {
      const wasStuck = !!this.stuckReason;
      this.paused = false;
      this.armWaitTimer();
      this.ctx.store.setExtra(this.id, { paused: false });
      if (wasStuck) {
        this.setStuckFlag(null);
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
      this.ensureRuntime();
      return this.refresh();
    });
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
    if (this.task && !this.waiting && this.employee().state === 'working' && this.runtime && now - this.lastSdkMs > 4 * 60_000) {
      this.stalls++;
      this.lastSdkMs = now;
      if (this.stalls >= 2) {
        this.failTask('Stalled', 'Stalled');
      } else {
        await this.runtime.interrupt();
        this.deliver({ kind: 'office', text: 'You stalled. Look at the screen first, then continue or call report_stuck.' });
      }
    }
  }

  // ------------------------------------------------------------------ removal

  private clearTimers(): void {
    this.clearWaiting(false);
    if (this.pendingClose) clearTimeout(this.pendingClose.timer);
    this.pendingClose = null;
    if (this.heldFinal) clearTimeout(this.heldFinal.timer);
    this.heldFinal = null;
    if (this.greetTimer) clearTimeout(this.greetTimer);
    this.greetTimer = null;
  }

  async remove(): Promise<void> {
    this.removed = true;
    this.clearTimers();
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
    this.clearTimers();
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

const STOP_WORDS = new Set(['the', 'a', 'an', 'i', 'to', 'and', 'of', 'in', 'on', 'it', 'is', 'my', 'you', 'for', 'that', 'this', 'me', 'be', 'so']);

function wordsOf(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOP_WORDS.has(w)));
}

/** True when two chat texts say substantially the same thing (one contains the other, or most of their words match). */
export function sameSaying(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = wordsOf(a), wb = wordsOf(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both) >= 0.4;
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
