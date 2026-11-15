import type { ActivityStep, Employee, PlanStep } from '../../shared/index.ts';
import type { Env } from '../../shared/index.ts';
import type { HostDriver, Spaces } from '../spaces/types.ts';

export type InboxItem =
  | { kind: 'manager'; text: string; messageId: string; via: 'chat' | 'call' }
  | { kind: 'colleague'; fromId: string; fromName: string; fromRole: string; text: string }
  | { kind: 'office'; text: string };           // notices from the app itself

export interface EmployeeRuntime {
  start(): Promise<void>;                       // spawn or resume the session
  deliver(item: InboxItem): void;               // never throws; queues if the session is down
  interrupt(): Promise<void>;                   // stop the current turn, keep the session
  setPaused(paused: boolean): Promise<void>;    // while paused, delivered items wait
  onPermissionsChanged(): void;                 // gate reads live values; this sends the notice
  attachHost(): Promise<void>;                  // screen grant started
  detachHost(): Promise<void>;                  // screen grant ended
  dispose(): Promise<void>;
}

export type ToolFamily = 'desktop' | 'space' | 'web';

export interface ApprovalOutcome {
  approved: boolean;
  note?: string;
  scope: 'once' | 'task';
}

export interface TurnResult {
  /** The turn was cut short by interrupt() or dispose(): the supervisor applies no keep-going rule. */
  interrupted?: boolean;
  /** SDK result subtype such as 'error_during_execution', 'error_max_turns', 'error_max_budget_usd'. */
  error?: string;
  /** Cost of this turn only (the runtime keeps the cumulative baseline in kv). */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  numTurns?: number;
}

/**
 * What the supervisor offers a runtime. The first eleven are the office tools of contracts section 5
 * (each returns the text the model sees); the rest are reports from the loop.
 * The runtime never touches the store, the bus or other employees directly.
 */
export interface RuntimeHost {
  employee(): Employee;

  /** `final: true` is the trailing plain text of a turn (not the message_user tool): the supervisor may drop it as a duplicate. */
  messageUser(text: string, opts?: { final?: boolean }): string;
  askUser(question: string): string;
  /** Waits for the decision. `kind: 'tool'` is for the permission gate, 'big_step' for request_approval. */
  requestApproval(a: { title: string; detail: string; kind?: 'tool' | 'big_step' }): Promise<ApprovalOutcome>;
  finishTask(summary: string): string;
  reportStuck(reason: string, tried: string): string;
  setActivity(sentence: string): string;
  messageColleague(to: string, text: string): string;
  listColleagues(): string;
  saveNote(text: string): string;
  /** Resolves to the tool text: "approved", "denied: <note>" or a refusal sentence. */
  requestScreen(reason: string, minutes: number): Promise<string>;
  releaseScreen(): string;

  /** Store the SDK session id (system/init). */
  sessionStarted(sessionId: string): void;
  /** The runtime has taken the waiting inbox items into a turn: marks the manager's messages seen. */
  turnStarted(): void;
  /** One turn finished (the SDK `result` message). The supervisor applies the keep-going rules. */
  turnEnded(result: TurnResult): void;
  /** A desktop, space or web tool was called: opens a task if none is open and clears "typing". */
  toolUsed(family: ToolFamily): void;
  /** An activity step from the ActivityMapper. Returns the step id. Repeats within 60 s collapse into the previous step. */
  step(sentence: string, opts?: { status?: 'running' | 'ok' | 'error'; peer?: ActivityStep['peer'] }): string;
  endStep(stepId: string, status: 'ok' | 'error', sentence?: string): void;
  /** TodoWrite mirror. */
  setPlan(steps: PlanStep[]): void;
  /** Any SDK message arrived (feeds the watchdog). */
  noteSdkMessage(): void;
}

export interface RuntimeDeps {
  env: Env;
  host: RuntimeHost;
  spaces: Spaces;
  hostDriver: HostDriver;
  /** Absolute host-side working folder: <DATA_DIR>/employees/<id>/ (exists). */
  home: string;
  /** Aborted when the supervisor disposes the runtime. */
  signal: AbortSignal;
}

export type RuntimeFactory = (deps: RuntimeDeps) => EmployeeRuntime;
