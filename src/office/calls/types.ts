import type { CallInfo, Employee, Env, Message, PlanStep, ServerEvent, Task, VoiceChatRequest, VoiceWorkerEvent } from '../../shared/index.ts';
import type { InboxItem } from '../runtime/types.ts';

/** What the call mind needs to know about an employee right now (employee-runtime.md 8.2). */
export interface CallSituation {
  employee: Employee;
  task: Task | null;
  plan: PlanStep[];
  recentSteps: string[];          // last 8 activity sentences, oldest first
  recentChat: { from: 'user' | 'employee'; text: string }[];   // last 6 bubbles, oldest first
  waitingOn: string | null;       // pending question or approval title
  notes: string[];                // at most 15 lines
  userName: string;
}

/** The slice of office that the calls seam may use. Implemented by the Office class; nothing else is reachable. */
export interface CallsHost {
  env: Env;
  emit(event: ServerEvent): void;
  employee(id: string): Employee | undefined;
  /** Sets or clears the on_call state for one employee. */
  setOnCall(employeeId: string, callId: string | null): void;
  /** A divider-style line in the employee's thread ("Call with Maya · 12 min"). */
  postSystemMessage(employeeId: string, text: string): Message;
  /** Puts something in the worker's inbox (tell_worker, the call summary). */
  deliverToWorker(employeeId: string, item: InboxItem): void;
  situation(employeeId: string): CallSituation;
  /** The Space's current screenshot (JPEG), for look_at_screen. */
  screenshot(employeeId: string): Promise<Buffer>;
}

export type CallsMode = 'avatar' | 'audio' | 'off';

export class CallError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface Calls {
  /** What `capabilities.calls` reports. Mock mode reports 'audio'. */
  mode(): CallsMode;
  /** POST /api/calls. Throws CallError (409 `calls_off`, 400, 404, 409 `employee_unavailable`). */
  start(employeeIds: string[]): Promise<CallInfo>;
  /** DELETE /api/calls/:id. Idempotent. */
  end(callId: string): Promise<void>;
  /** POST /api/calls/:id/address. Throws CallError 404 for an unknown call or participant. */
  address(callId: string, employeeId: string): Promise<void>;
  /** Voice worker: POST /voice/calls/:id/route. */
  route(callId: string, utterance: string): Promise<string[]>;
  /** Voice worker: POST /voice/v1/chat/completions. Yields reply text deltas. */
  chat(callId: string, speakerId: string | undefined, req: VoiceChatRequest, signal: AbortSignal): AsyncIterable<string>;
  /** Voice worker: POST /voice/calls/:id/events. */
  event(callId: string, ev: VoiceWorkerEvent): Promise<void>;
  /** Boot and shutdown hooks (the real implementation spawns and stops the voice worker). */
  boot(): Promise<void>;
  stop(): Promise<void>;
}
