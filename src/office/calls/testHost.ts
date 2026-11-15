// Helpers for the calls unit tests. Not imported by production code.
import { readEnv, type Employee, type ServerEvent } from '../../shared/index.ts';
import type { InboxItem } from '../runtime/types.ts';
import type { MindClient, MindEvent, MindParams } from './mind.ts';
import type { CallSituation, CallsHost } from './types.ts';

export function employee(id: string, firstName: string, role: string, over: Partial<Employee> = {}, avatarId: string | null = null): Employee {
  return {
    id,
    persona: {
      name: `${firstName} Test`, firstName, role, roleKey: 'x', personality: 'Calm and exact. Asks one good question, then ships.',
      workingStyle: '', starters: [], portraitUrl: '', voice: { provider: 'livekit', voiceId: '', label: '', sampleUrl: null }, avatarId,
    },
    permissions: { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true },
    state: 'working', stateDetail: 'Editing the pricing page', stateSinceMs: 0, spaceId: null, sessionId: null, model: 'm', unread: 0,
    lastActivityMs: 0, screenGrant: null, desktopSinceMs: 1, pendingRestart: false, controlledByUser: false, createdMs: 0,
    ...over,
  };
}

export const mayaSituation = (e: Employee): CallSituation => ({
  employee: e,
  task: { id: 't1', employeeId: e.id, title: 'Rebuild the pricing page', assignedBy: 'user', status: 'running', plan: [], outcome: null, assignedMs: 0, finishedMs: null, activeMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, numTurns: 0, traceId: null },
  plan: [
    { title: 'Sketch the layout', status: 'done' },
    { title: 'Build the table', status: 'in_progress' },
    { title: 'Wire the buy button', status: 'pending' },
  ],
  recentSteps: ['Opened the staging site', 'Edited the pricing table'],
  recentChat: [
    { from: 'user', text: 'Please use the blue theme.' },
    { from: 'employee', text: 'On it.' },
  ],
  waitingOn: 'Publish the draft',
  notes: ['Manager prefers short updates', 'Brand blue is the accent'],
  userName: 'Sam',
});

export interface FakeHost extends CallsHost {
  events: ServerEvent[];
  delivered: { id: string; item: InboxItem }[];
  system: { id: string; text: string }[];
  onCall: Map<string, string | null>;
  employees: Map<string, Employee>;
}

export function fakeHost(emps: Employee[], envOver: Record<string, string> = {}): FakeHost {
  const employees = new Map(emps.map((e) => [e.id, e]));
  const h: FakeHost = {
    env: readEnv({ MOCK_LLM: '', LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'APIkey123', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-0123456789', OFFICE_PORT: '4327', ...envOver }),
    events: [],
    delivered: [],
    system: [],
    onCall: new Map(),
    employees,
    emit: (e) => void h.events.push(e),
    employee: (id) => employees.get(id),
    setOnCall: (id, callId) => void h.onCall.set(id, callId),
    postSystemMessage: (id, text) => {
      h.system.push({ id, text });
      return { id: 'm', employeeId: id, from: 'system', kind: 'system', text, taskId: null, createdMs: 0, seenMs: null };
    },
    deliverToWorker: (id, item) => void h.delivered.push({ id, item }),
    situation: (id) => mayaSituation(employees.get(id)!),
    screenshot: async () => Buffer.from([0xff, 0xd8, 0xff]),
  };
  return h;
}

export interface ScriptedTurn {
  text?: string[];
  tool?: { name: string; input: unknown };
  /** ms before the first event (use with fake timers). */
  delayMs?: number;
}

/** A fake Anthropic client: each request plays the next scripted turn as raw stream events. Records every request. */
export function fakeClient(turns: ScriptedTurn[]): MindClient & { requests: MindParams[]; abortedDuringStream: boolean } {
  const requests: MindParams[] = [];
  const state = { abortedDuringStream: false };
  let n = 0;
  return {
    requests,
    get abortedDuringStream() {
      return state.abortedDuringStream;
    },
    messages: {
      async create(params, opts) {
        requests.push(params);
        const turn = turns[Math.min(n++, turns.length - 1)];
        async function* gen(): AsyncGenerator<MindEvent> {
          if (turn.delayMs) await new Promise((r) => setTimeout(r, turn.delayMs));
          yield { type: 'message_start' };
          await new Promise((r) => setImmediate(r));
          if (opts?.signal?.aborted) state.abortedDuringStream = true;
          let idx = 0;
          if (turn.text?.length) {
            yield { type: 'content_block_start', index: idx, content_block: { type: 'text' } };
            for (const t of turn.text) yield { type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: t } };
            yield { type: 'content_block_stop', index: idx++ };
          }
          if (turn.tool) {
            yield { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: `tu_${n}`, name: turn.tool.name } };
            const json = JSON.stringify(turn.tool.input);
            yield { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: json.slice(0, 5) } };
            yield { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: json.slice(5) } };
            yield { type: 'content_block_stop', index: idx };
          }
          yield { type: 'message_delta', delta: { stop_reason: turn.tool ? 'tool_use' : 'end_turn' } };
          yield { type: 'message_stop' };
        }
        return gen();
      },
    },
  };
}
