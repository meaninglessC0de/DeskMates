// Test helpers for the runtime. Not imported by production code.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ActivityStep, Employee, Permissions, PlanStep } from '../../shared/index.ts';
import { readEnv } from '../../shared/index.ts';
import { buildPresets, DEFAULT_PERMISSIONS } from '../presets.ts';
import { MockHost } from '../spaces/mock/mockHost.ts';
import { createMockSpaces } from '../spaces/mock/mockSpaces.ts';
import type { ApprovalOutcome, RuntimeDeps, RuntimeHost, ToolFamily, TurnResult } from './types.ts';
import type { ApprovalRequest } from './gateTypes.ts';

process.env.MOCK_SPEED = process.env.MOCK_SPEED ?? '400';

export function makeEmployee(over: Omit<Partial<Employee>, 'permissions'> & { permissions?: Partial<Permissions> } = {}): Employee {
  const preset = buildPresets({ EMPLOYEE_MODEL: 'claude-haiku-5-5' })[0];
  const { permissions, ...rest } = over;
  return {
    id: 'emp_01TEST',
    persona: {
      name: 'Maya Chen', firstName: 'Maya', role: 'Web developer', roleKey: preset.key,
      personality: 'Calm and exact. Asks one good question, then ships.', workingStyle: preset.workingStyle,
      starters: preset.starters, portraitUrl: '', voice: { provider: 'livekit', voiceId: '', label: 'x', sampleUrl: null }, avatarId: null,
    },
    permissions: { ...DEFAULT_PERMISSIONS, ...permissions },
    state: 'idle', stateDetail: 'Web developer', stateSinceMs: 0, spaceId: null, sessionId: null, model: 'claude-haiku-5-5',
    unread: 0, lastActivityMs: 0, screenGrant: null, desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: 0,
    ...rest,
  };
}

export interface RecordedStep { id: string; sentence: string; status: ActivityStep['status']; peer?: ActivityStep['peer'] }

/** A RuntimeHost that records everything a runtime reports and lets a test answer approvals. */
export class FakeHost implements RuntimeHost {
  emp: Employee;
  messages: string[] = [];
  questions: string[] = [];
  finished: string[] = [];
  stuck: Array<{ reason: string; tried: string }> = [];
  activities: string[] = [];
  notes: string[] = [];
  colleagueCalls: Array<{ to: string; text: string }> = [];
  screenRequests: Array<{ reason: string; minutes: number }> = [];
  screenAnswer = 'approved';
  released = 0;
  sessionIds: string[] = [];
  turnsStarted = 0;
  turnsEnded: TurnResult[] = [];
  toolFamilies: ToolFamily[] = [];
  plans: PlanStep[][] = [];
  steps: RecordedStep[] = [];
  sdkMessages = 0;
  approvals: Array<ApprovalRequest & { resolve: (o: ApprovalOutcome) => void }> = [];
  order: string[] = [];
  /** Answers approvals at once when it returns an outcome. */
  auto: ((a: ApprovalRequest) => ApprovalOutcome | null) | null = null;

  constructor(emp: Employee = makeEmployee()) {
    this.emp = emp;
  }

  employee(): Employee {
    return this.emp;
  }

  messageUser(text: string): string {
    this.messages.push(text);
    this.order.push(`message:${text}`);
    return 'sent';
  }
  askUser(question: string): string {
    this.questions.push(question);
    this.order.push('ask');
    return 'Asked. The answer will arrive as a new message. Continue other useful work if there is any, otherwise end your turn.';
  }
  requestApproval(a: ApprovalRequest): Promise<ApprovalOutcome> {
    const outcome = this.auto?.(a) ?? null;
    if (outcome) return Promise.resolve(outcome);
    return new Promise((resolve) => this.approvals.push({ ...a, resolve }));
  }
  async answer(index: number, o: Partial<ApprovalOutcome> & { approved: boolean }): Promise<void> {
    await waitUntil(() => this.approvals[index] !== undefined);
    this.approvals[index].resolve({ scope: 'once', ...o });
  }
  finishTask(summary: string): string {
    this.finished.push(summary);
    this.order.push('finish');
    return 'Task closed.';
  }
  reportStuck(reason: string, tried: string): string {
    this.stuck.push({ reason, tried });
    this.order.push('stuck');
    return 'Noted. Your manager has been told.';
  }
  setActivity(sentence: string): string {
    this.activities.push(sentence);
    return 'ok';
  }
  messageColleague(to: string, text: string): string {
    this.colleagueCalls.push({ to, text });
    return `Sent to ${to}.`;
  }
  listColleagues(): string {
    return 'Priya, Marketer, idle';
  }
  saveNote(text: string): string {
    this.notes.push(text);
    return 'Saved.';
  }
  async requestScreen(reason: string, minutes: number): Promise<string> {
    this.screenRequests.push({ reason, minutes });
    return this.screenAnswer;
  }
  releaseScreen(): string {
    this.released++;
    return 'Given back.';
  }

  sessionStarted(id: string): void {
    this.sessionIds.push(id);
    this.emp = { ...this.emp, sessionId: id };
  }
  turnStarted(): void {
    this.turnsStarted++;
    this.order.push('turnStarted');
  }
  turnEnded(r: TurnResult): void {
    this.turnsEnded.push(r);
    this.order.push('turnEnded');
  }
  toolUsed(f: ToolFamily): void {
    this.toolFamilies.push(f);
  }
  step(sentence: string, opts?: { status?: ActivityStep['status']; peer?: ActivityStep['peer'] }): string {
    const id = `step_${this.steps.length + 1}`;
    this.steps.push({ id, sentence, status: opts?.status ?? 'running', peer: opts?.peer });
    this.order.push(`step:${sentence}`);
    return id;
  }
  endStep(id: string, status: 'ok' | 'error', sentence?: string): void {
    const s = this.steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (sentence) s.sentence = sentence;
    }
  }
  setPlan(steps: PlanStep[]): void {
    this.plans.push(steps);
  }
  noteSdkMessage(): void {
    this.sdkMessages++;
  }
}

export async function waitUntil(pred: () => boolean, timeoutMs = 3000, what = 'condition'): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

export interface RuntimeRig {
  host: FakeHost;
  deps: RuntimeDeps;
  home: string;
  dataDir: string;
  abort: AbortController;
  spaces: ReturnType<typeof createMockSpaces>;
  hostDriver: MockHost;
}

/** Deps for a runtime under test: mock Space on disk, MockHost, a folder for the employee's home. */
export async function makeRig(opts: { env?: Record<string, string>; emp?: Employee; spacesEnsure?: boolean } = {}): Promise<RuntimeRig> {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'runtime-test-'));
  const host = new FakeHost(opts.emp);
  const env = readEnv({ MOCK_LLM: '0', DESKTOPS: 'mock', ANTHROPIC_API_KEY: 'test-key', DATA_DIR: dataDir, ...opts.env });
  const spaces = createMockSpaces({ dataDir });
  if (opts.spacesEnsure !== false) await spaces.ensure(host.emp.id, { internet: true });
  const home = path.join(dataDir, 'employees', host.emp.id);
  const abort = new AbortController();
  const hostDriver = new MockHost();
  return { host, home, dataDir, abort, spaces, hostDriver, deps: { env, host, spaces, hostDriver, home, signal: abort.signal } };
}
