import type { StreamResponse } from '../../shared/index.ts';

/** `absent`: no Space exists. `asleep`: suspended (files kept). `running`: usable. `error`: exists but unusable. */
export type SpaceState = 'absent' | 'asleep' | 'running' | 'error';

export interface SpaceInfo {
  /** e.g. 'local:emp-01j...' (Cua) or 'mock:emp-01j...' (mock). Stored on Employee.spaceId. */
  id: string;
  state: SpaceState;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface McpEndpoint {
  url: string;
  /** Spread as is into the MCP server config; never build the auth header by hand. */
  headers: Record<string, string>;
}

export interface EnsureOptions {
  /** The employee's internet switch; sets the Space's network preset. */
  internet: boolean;
  /** Plain-language progress ("Creating desktop", "Waiting for it to start"). */
  onProgress?: (message: string) => void;
}

/**
 * One desktop per employee, keyed by employee id (the Space name is derived from it).
 * Every method rejects with an Error whose message is a plain sentence when the desktop is absent or off.
 */
export interface Spaces {
  /** Idempotent: create if missing, wake if asleep, replace if stale. Resolves when the desktop is usable. */
  ensure(employeeId: string, opts: EnsureOptions): Promise<SpaceInfo>;
  /** Suspend to running. Files and open apps are kept. */
  wake(employeeId: string): Promise<SpaceInfo>;
  /** Suspend (never the SDK's `stop`, which wipes files). */
  sleep(employeeId: string): Promise<void>;
  /** Delete the Space and create a fresh one (files erased). */
  reset(employeeId: string, opts: EnsureOptions): Promise<SpaceInfo>;
  /** Delete the Space. No error when it does not exist. */
  remove(employeeId: string): Promise<void>;
  /** A cheap round trip that proves the desktop answers (5 s budget). False when absent, asleep or stale. */
  healthy(employeeId: string): Promise<boolean>;
  exec(employeeId: string, command: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  /** UTF-8 text. `~` and relative paths are inside the desktop's home. */
  readFile(employeeId: string, path: string): Promise<string>;
  writeFile(employeeId: string, path: string, content: string | Uint8Array): Promise<void>;
  /** Full-size (about 1280 x 800) JPEG, a fresh capture on every call. Backs GET frame.jpg. */
  screenshot(employeeId: string): Promise<Buffer>;
  /** JPEG, 480 px wide. Callers cache for 3 s. */
  thumbnail(employeeId: string): Promise<Buffer>;
  /** Fresh at every call: the port changes whenever the Space starts. */
  mcpEndpoint(employeeId: string): Promise<McpEndpoint>;
  /** `frames` is the fallback (and what the mock returns). */
  openStream(employeeId: string, mode: 'view' | 'control'): Promise<StreamResponse>;
  /** Applies live. Rejects when the change cannot be applied live (the supervisor then sets pendingRestart). */
  setInternet(employeeId: string, on: boolean): Promise<void>;
  state(employeeId: string): Promise<SpaceState>;
}

export interface HostStatus {
  installed: boolean;
  permitted: boolean;
  detail: string;
}

export interface StdioMcpConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** The user's real Mac (cua-driver). Used only while a screen grant is live. */
export interface HostDriver {
  status(): Promise<HostStatus>;
  /** The stdio MCP config for `mcp__host__*`. */
  mcpConfig(): Promise<StdioMcpConfig>;
  /** Mock only: runs one fixed host "tool" and returns its text. Real drivers leave it out. */
  mockCall?(tool: string): Promise<string>;
}
