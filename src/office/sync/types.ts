import type { DatabaseSync } from 'node:sqlite';
import type { Employee, Env, Task, TeamAskResponse, TeamReport } from '../../shared/index.ts';

/** Local data the team report is computed from. Implemented by the store. */
export interface TeamData {
  listEmployees(): Employee[];
  /** Tasks whose `finishedMs ?? assignedMs` is in [startMs, endMs). */
  listTasksInRange(startMs: number, endMs: number): Task[];
  /** Spend that belongs to no task (greetings, plain chat turns) in [startMs, endMs), summed per employee. */
  usageWithoutTask?(startMs: number, endMs: number): { employeeId: string; costUsd: number }[];
}

export type SyncTable = 'employees' | 'tasks' | 'steps' | 'messages' | 'usage';

export class SyncError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface SyncStatus {
  databricks: boolean;     // capabilities.databricks
  genie: boolean;          // capabilities.genie
  syncedMs: number | null;
}

export interface Sync {
  status(): SyncStatus;
  /** Called after every write to employees, tasks, steps, messages and usage (the outbox hook). Never throws. */
  record(table: SyncTable, row: unknown): void;
  /** Local numbers when Databricks is off or slow. */
  teamReport(range: TeamReport['range']): Promise<TeamReport>;
  /** Throws SyncError(409, 'genie_off') when not configured. */
  ask(question: string, conversationId?: string): Promise<TeamAskResponse>;
  boot(): Promise<void>;
  stop(): Promise<void>;
}

export interface SyncDeps {
  env: Env;
  data: TeamData;
  /** The store's SQLite handle (it owns the `outbox` table). Defaults to `data.db` when `data` is the Store. */
  db?: DatabaseSync;
}
