import { createHash } from 'node:crypto';
import type { ActivityStep, Employee, Message, Task } from '../../shared/index.ts';
import type { SyncTable } from './types.ts';

export const MAX_DETAIL = 4096;
export const MAX_BODY = 2048;
const MAX_OUTCOME = 4096;
const MAX_TITLE = 500;

type Out = Record<string, unknown>;

export function truncate(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null;
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…';
}

export interface UsageRow {
  employeeId: string;
  taskId: string | null;
  tsMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** A row ready for the outbox: the primary key and the Delta columns (the `ts` columns are derived when the MERGE is built). */
export interface Mapped {
  key: string;
  payload: Out;
}

export function mapEmployee(e: Employee, nowMs: number): Mapped {
  return {
    key: e.id,
    payload: {
      employee_id: e.id, name: e.persona.name, role: e.persona.role, permission_level: e.permissions.level,
      created_ms: e.createdMs, updated_ms: nowMs,
    },
  };
}

export function mapTask(t: Task, nowMs: number): Mapped {
  return {
    key: t.id,
    payload: {
      task_id: t.id, employee_id: t.employeeId, title: truncate(t.title, MAX_TITLE), assigned_by: t.assignedBy, status: t.status,
      assigned_ms: t.assignedMs, finished_ms: t.finishedMs, active_ms: t.activeMs,
      input_tokens: t.inputTokens, output_tokens: t.outputTokens, cost_usd: t.costUsd, num_turns: t.numTurns,
      outcome: truncate(t.outcome, MAX_OUTCOME), trace_id: t.traceId, updated_ms: nowMs,
    },
  };
}

export function mapStep(s: ActivityStep): Mapped {
  const status = s.status === 'running' ? 'pending' : s.status;
  return {
    key: s.id,
    payload: {
      event_id: s.id, employee_id: s.employeeId, task_id: s.taskId, ts_ms: s.startedMs,
      kind: s.status === 'error' ? 'error' : s.peer ? 'status' : 'tool_call',
      tool: s.peer ? 'colleague' : null, summary: truncate(s.sentence, 500),
      detail: s.peer ? truncate(JSON.stringify(s.peer), MAX_DETAIL) : null, status,
      duration_ms: s.endedMs === null ? null : Math.max(0, s.endedMs - s.startedMs),
    },
  };
}

export function mapMessage(m: Message): Mapped {
  return {
    key: m.id,
    payload: {
      message_id: m.id, ts_ms: m.createdMs,
      from_id: m.from === 'employee' ? m.employeeId : m.from, to_id: m.from === 'user' ? m.employeeId : m.from === 'employee' ? 'user' : m.employeeId,
      channel: 'user_dm', task_id: m.taskId, body: truncate(m.text, MAX_BODY),
    },
  };
}

/** Usage rows have no id of their own, so the id is derived from the row: the same turn always gets the same id, which keeps a re-send idempotent. */
export function usageId(u: UsageRow): string {
  return 'u_' + createHash('sha1').update(`${u.employeeId}|${u.taskId}|${u.tsMs}|${u.costUsd}|${u.inputTokens}|${u.outputTokens}`).digest('hex').slice(0, 24);
}

export function mapUsage(u: UsageRow, id: string = usageId(u)): Mapped {
  return {
    key: id,
    payload: {
      usage_id: id, ts_ms: u.tsMs, employee_id: u.employeeId, task_id: u.taskId, model: null,
      input_tokens: u.inputTokens, output_tokens: u.outputTokens, cache_read_tokens: null, cache_write_tokens: null, cost_usd: u.costUsd,
    },
  };
}

/** Maps what the store reports after a write. Returns null for a shape it does not recognise. */
export function mapRow(table: SyncTable, row: unknown, nowMs: number): Mapped | null {
  if (!row || typeof row !== 'object') return null;
  switch (table) {
    case 'employees': return mapEmployee(row as Employee, nowMs);
    case 'tasks': return mapTask(row as Task, nowMs);
    case 'steps': return mapStep(row as ActivityStep);
    case 'messages': return mapMessage(row as Message);
    case 'usage': return mapUsage(row as UsageRow);
  }
}
