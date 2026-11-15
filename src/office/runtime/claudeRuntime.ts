import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { query as sdkQuery, type McpServerConfig, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Env } from '../../shared/index.ts';
import { permissionLine } from '../employees/briefing.ts';
import type { McpEndpoint } from '../spaces/types.ts';
import { tracedQuery } from '../sync/tracing.ts';
import { mapToolCall } from './activityMapper.ts';
import { RuntimeUnavailable } from './errors.ts';
import type { QueryFactory, QueryLike } from './fakeQuery.ts';
import { PermissionGate } from './gate.ts';
import { Inbox } from './inbox.ts';
import { createOfficeServer } from './officeTools.ts';
import { allowsFinalText, buildSystemPrompt, stripMarkdown } from './prompt.ts';
import { makeSdkServer, textResult } from './sdkServers.ts';
import { createSpaceServer } from './spaceTools.ts';
import { buildDisallowed, splitToolName } from './toolGroups.ts';
import type { EmployeeRuntime, InboxItem, RuntimeDeps, RuntimeFactory, ToolFamily } from './types.ts';
import { REPEAT_NOTICE, RepeatDetector } from './watchdog.ts';

export const NO_KEY_SENTENCE = "I can't start: no API key is set.";
const SPOKE_TOOLS = new Set(['message_user', 'ask_user', 'finish_task', 'report_stuck']);
const STDERR_LINES = 30;
const COST_FILE = 'cost-baseline.json';

export interface ClaudeRuntimeOptions {
  /** The SDK's `query` (default, wrapped by `tracedQuery`) or a `fakeQuery` factory. */
  query?: QueryFactory;
  /** Reads `tools/list` of the live desktop server. Default: a real MCP client with an 8-second budget. */
  listDesktopTools?: (endpoint: McpEndpoint, employeeId: string) => Promise<string[]>;
  /** Waits before restarting a query that exited by itself: 2 s, then 10 s, then "Lost my session". */
  restartDelaysMs?: number[];
  /** Items arriving this close together go into one turn. */
  coalesceMs?: number;
}

/** What the subprocess may see. `env` REPLACES the environment, so this is an allowlist (employee-runtime.md section 2). */
export function employeeEnv(home: string, env: Env, source: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {
    PATH: source.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: source.HOME ?? home,
    LANG: source.LANG ?? 'en_US.UTF-8',
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ENABLE_TOOL_SEARCH: 'false',
    // without this the CLI swaps TodoWrite for its TaskCreate/TaskUpdate tools and the plan never reaches the manager
    CLAUDE_CODE_ENABLE_TASKS: 'false',
  };
  if (env.ANTHROPIC_API_KEY) out.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  // tracing (W8) and network plumbing; never any other CLAUDE* variable, even when office runs inside Claude Code
  for (const k of ['MCP_TOOL_TIMEOUT', 'ANTHROPIC_BASE_URL', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS']) {
    if (source[k]) out[k] = source[k] as string;
  }
  if (env.MLFLOW_EXPERIMENT_ID) {
    out.MLFLOW_EXPERIMENT_ID = env.MLFLOW_EXPERIMENT_ID;
    out.MLFLOW_TRACKING_URI = env.MLFLOW_TRACKING_URI;
    if (env.DATABRICKS_HOST) out.DATABRICKS_HOST = env.DATABRICKS_HOST;
    if (env.DATABRICKS_TOKEN) out.DATABRICKS_TOKEN = env.DATABRICKS_TOKEN;
  }
  return out;
}

export async function listDesktopToolsLive(endpoint: McpEndpoint, employeeId: string, timeoutMs = 8000): Promise<string[]> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new Client({ name: 'agent-manager', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
    requestInit: { headers: { ...endpoint.headers, 'X-Cua-Agent-Session': employeeId } },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    const run = (async () => {
      await client.connect(transport);
      const r = await client.listTools();
      return r.tools.map((t) => t.name);
    })();
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('The desktop did not answer in time.')), timeoutMs);
    });
    return await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    await client.close().catch(() => {});
  }
}

interface Block {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

const LEVEL_TEXT = { asks_first: 'asks first', asks_big_steps: 'asks before big steps', independent: 'works independently' } as const;

/**
 * One employee's brain: one long-lived Claude Agent SDK `query()` in streaming-input mode. It reports through the
 * supervisor's `RuntimeHost` port exactly as `MockRuntime` does, so the UI cannot tell them apart.
 */
export class ClaudeRuntime implements EmployeeRuntime {
  private readonly id: string;
  private readonly queryFn: QueryFactory;
  private readonly gate: PermissionGate;
  private readonly repeats = new RepeatDetector();
  private readonly officeServer;
  private readonly spaceServer;
  private readonly expectDesktop: boolean;

  private inbox: Inbox | null = null;
  private q: QueryLike | null = null;
  private gen = 0;
  private consuming: Promise<void> = Promise.resolve();
  private desktopConfig: McpServerConfig | null = null;
  private disallowed: string[] = [];
  private paused = false;
  private disposed = false;
  private failed = false;
  private hostAttached = false;
  private sessionId: string | undefined;
  private initSeen = false;
  private crashes = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private resumeTimer: NodeJS.Timeout | null = null;
  private stderrTail: string[] = [];
  private lastTotalUsd = 0;

  // turn state
  private working = false;
  private assistantSeen = false;
  private seenPending = false;
  private interruptPending = false;
  private pausedMidTurn = false;
  private spoke = false;
  private textAllowed = false;
  private fatalReported = false;
  private unacked: InboxItem[] = [];
  private openSteps = new Map<string, { stepId: string; failed: string | null }>();
  private hostCalls = new Set<string>();

  constructor(private deps: RuntimeDeps, private opts: ClaudeRuntimeOptions = {}) {
    this.id = deps.host.employee().id;
    this.queryFn = opts.query ?? (tracedQuery(sdkQuery) as unknown as QueryFactory);
    this.gate = new PermissionGate(deps.host);
    this.expectDesktop = deps.env.DESKTOPS === 'cua';
    this.officeServer = createOfficeServer(deps.host, { taskClosed: () => this.gate.clearTaskMemory() });
    this.spaceServer = createSpaceServer(deps.spaces, this.id);
    deps.signal.addEventListener('abort', () => void this.dispose());
  }

  private get host() {
    return this.deps.host;
  }

  private log(msg: string): void {
    console.error(`[runtime ${this.id}] ${msg}`);
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    if (!this.deps.env.ANTHROPIC_API_KEY) throw new RuntimeUnavailable(NO_KEY_SENTENCE);
    await mkdir(path.join(this.deps.home, '.claude'), { recursive: true });
    await this.deps.spaces.exec(this.id, 'mkdir -p ~/work', { timeoutMs: 10_000 }).catch(() => {});

    if (this.expectDesktop) {
      const endpoint = await this.deps.spaces.mcpEndpoint(this.id);
      let reported: string[] = [];
      try {
        reported = await (this.opts.listDesktopTools ?? listDesktopToolsLive)(endpoint, this.id);
      } catch (err) {
        this.log(`could not list the desktop tools, using the known list: ${(err as Error).message}`);
      }
      this.disallowed = buildDisallowed('desktop', reported);
      this.desktopConfig = {
        type: 'http',
        url: endpoint.url,
        headers: { ...endpoint.headers, 'X-Cua-Agent-Session': this.id },
        alwaysLoad: true,
      };
    }

    try {
      const j = JSON.parse(await readFile(path.join(this.deps.home, COST_FILE), 'utf8')) as { lastTotalUsd?: number };
      if (typeof j.lastTotalUsd === 'number') this.lastTotalUsd = j.lastTotalUsd;
    } catch {
      /* first start */
    }
    const known = this.host.employee().sessionId;
    this.sessionId = known && !known.startsWith('mock-session-') ? known : undefined;
    this.launch(this.sessionId);
    if (this.hostAttached || this.host.employee().screenGrant) await this.attachHost();
  }

  private servers(withHost: boolean): Record<string, McpServerConfig> {
    const s: Record<string, McpServerConfig> = {};
    if (this.desktopConfig) s.desktop = this.desktopConfig;
    s.space = this.spaceServer;
    s.office = this.officeServer;
    if (withHost && this.hostServer) s.host = this.hostServer;
    return s;
  }

  private hostServer: McpServerConfig | null = null;

  private async buildHostServer(): Promise<McpServerConfig> {
    if (this.hostServer) return this.hostServer;
    const driver = this.deps.hostDriver;
    if (driver.mockCall) {
      // the mock Mac has no real MCP server: one in-process tool that answers with a fixed sentence
      this.hostServer = makeSdkServer('host', [
        { name: 'read_window', description: "Read the front window on your manager's screen.", shape: {}, handler: async () => textResult((await driver.mockCall?.('read_window')) ?? '') },
      ]);
    } else {
      const cfg = await driver.mcpConfig();
      this.hostServer = { type: 'stdio', command: cfg.command, args: cfg.args, env: cfg.env, alwaysLoad: true };
    }
    return this.hostServer;
  }

  private launch(resumeId: string | undefined): void {
    const gen = ++this.gen;
    const e = this.host.employee();
    const abortController = new AbortController();
    this.deps.signal.addEventListener('abort', () => abortController.abort(), { once: true });
    const inbox = new Inbox({
      busy: () => this.working,
      coalesceMs: this.opts.coalesceMs,
      onYield: (items) => this.onYield(items),
    });
    const old = this.inbox;
    this.inbox = inbox;
    inbox.setPaused(this.paused);
    for (const i of this.unacked.splice(0)) inbox.push(i);
    if (old) {
      for (const i of old.drain()) inbox.push(i);
      old.close();
    }

    const options: Options = {
      model: e.model,
      systemPrompt: buildSystemPrompt(e.persona),
      cwd: this.deps.home,
      env: employeeEnv(this.deps.home, this.deps.env),
      settingSources: [],
      tools: ['TodoWrite', 'WebSearch', 'WebFetch'],
      strictMcpConfig: true,
      mcpServers: this.servers(false),
      permissionMode: 'default',
      canUseTool: this.gate.canUseTool as unknown as Options['canUseTool'],
      disallowedTools: this.disallowed,
      maxTurns: 5000,
      maxBudgetUsd: 100,
      resume: resumeId,
      abortController,
      stderr: (d: string) => {
        for (const line of d.split('\n')) if (line.trim()) this.stderrTail.push(line.trim());
        this.stderrTail = this.stderrTail.slice(-STDERR_LINES);
      },
    };
    const q = this.queryFn({ prompt: inbox, options });
    this.q = q;
    this.consuming = this.consume(gen, q);
  }

  private async consume(gen: number, q: QueryLike): Promise<void> {
    let error: unknown = null;
    try {
      for await (const m of q) {
        if (gen !== this.gen) return;
        this.onMessage(m);
      }
    } catch (err) {
      error = err;
    }
    if (this.disposed || gen !== this.gen || this.failed) return;
    this.onExit(error);
  }

  /** The subprocess ended and nobody asked it to (employee-runtime.md section 2: 2 s, 10 s, then stuck). */
  private onExit(error: unknown): void {
    const why = error instanceof Error ? error.message : 'the session ended';
    this.log(`session ended unexpectedly: ${why}${this.stderrTail.length ? ` | ${this.stderrTail.slice(-3).join(' / ')}` : ''}`);
    this.closeOpenWork();
    const delays = this.opts.restartDelaysMs ?? [2000, 10_000];
    if (this.crashes >= delays.length) {
      this.failed = true;
      this.host.reportStuck('Lost my session.', 'The process behind me stopped and would not restart.');
      return;
    }
    const delay = delays[this.crashes++];
    // a resume that never produced an init message means the session id is no good: start a fresh one
    if (!this.initSeen) this.sessionId = undefined;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.disposed) return;
      this.launch(this.sessionId);
      if (this.hostAttached) void this.attachHost();
    }, delay);
    this.restartTimer.unref?.();
  }

  private closeOpenWork(): void {
    if (this.working || this.assistantSeen) this.host.turnEnded({ interrupted: true });
    this.working = false;
    this.assistantSeen = false;
    this.seenPending = false;
    this.interruptPending = false;
    this.spoke = false;
    this.textAllowed = false;
    for (const s of this.openSteps.values()) this.host.endStep(s.stepId, 'ok');
    this.openSteps.clear();
    this.hostCalls.clear();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.gate.clearTaskMemory();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.inbox?.close();
    try {
      this.q?.close();
    } catch {
      /* already gone */
    }
    await Promise.race([this.consuming, new Promise((r) => setTimeout(r, 3000))]);
  }

  // ------------------------------------------------------------------ the port the supervisor drives

  deliver(item: InboxItem): void {
    if (this.disposed) return;
    this.inbox?.push(item);
  }

  async interrupt(): Promise<void> {
    if (!this.q || !this.working) return;
    this.interruptPending = true;
    await this.q.interrupt().catch((e) => this.log(`interrupt failed: ${(e as Error).message}`));
  }

  async setPaused(paused: boolean): Promise<void> {
    if (paused === this.paused) return;
    this.paused = paused;
    this.inbox?.setPaused(paused);
    if (paused && this.working) {
      this.pausedMidTurn = true;
      await this.interrupt();
    } else if (!paused && this.pausedMidTurn) {
      this.pausedMidTurn = false;
      // the supervisor delivers its own notice for "give back"; only add ours when nothing else arrives
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        if (!this.disposed && !this.working && (this.inbox?.size ?? 0) === 0) {
          this.deliver({ kind: 'office', text: 'Your manager paused you and has now let you continue. Carry on with your task.' });
        }
      }, 150);
      this.resumeTimer.unref?.();
    }
  }

  onPermissionsChanged(): void {
    const e = this.host.employee();
    const p = e.permissions;
    const line = permissionLine(p).replace(/^Permission level: [^.]*\./, `Your permission level is now "${LEVEL_TEXT[p.level]}".`);
    this.deliver({ kind: 'office', text: line });
  }

  async attachHost(): Promise<void> {
    this.hostAttached = true;
    try {
      await this.buildHostServer();
      await this.q?.setMcpServers(this.servers(true));
    } catch (err) {
      this.log(`could not attach the host tools: ${(err as Error).message}`);
    }
  }

  async detachHost(): Promise<void> {
    this.hostAttached = false;
    if (this.hostCalls.size > 0) await this.interrupt();
    try {
      await this.q?.setMcpServers(this.servers(false));
    } catch (err) {
      this.log(`could not detach the host tools: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ SDK messages

  private onYield(items: InboxItem[]): void {
    this.working = true;
    this.unacked.push(...items);
    if (items.some((i) => i.kind === 'manager')) this.seenPending = true;
    if (items.some(allowsFinalText)) this.textAllowed = true;
  }

  private onMessage(m: SDKMessage): void {
    this.host.noteSdkMessage();
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') this.onInit(m as unknown as { session_id: string; tools: string[] });
        break;
      case 'assistant':
        if (!m.parent_tool_use_id) this.onAssistant(m as unknown as { message: { content: Block[] }; error?: string });
        break;
      case 'user':
        if (!m.parent_tool_use_id) this.onUser(m as unknown as { message: { content: unknown } });
        break;
      case 'result':
        this.onResult(m as unknown as ResultLike);
        break;
      default:
        break;
    }
  }

  private onInit(m: { session_id: string; tools: string[] }): void {
    this.initSeen = true;
    this.sessionId = m.session_id;
    if (process.env.RUNTIME_DEBUG) this.log(`init: session ${m.session_id}, ${m.tools.length} tools: ${m.tools.join(', ')}`);
    this.host.sessionStarted(m.session_id);
    if (this.expectDesktop && !m.tools.some((t) => t.startsWith('mcp__desktop__'))) {
      this.failed = true;
      this.log(`no desktop tools in init: ${m.tools.slice(0, 8).join(', ')}`);
      try {
        this.q?.close();
      } catch {
        /* ignore */
      }
      this.closeOpenWork();
      this.host.reportStuck("I can't use my desktop tools.", 'They did not load when I started. A restart of my desktop may fix it.');
    }
  }

  private onAssistant(m: { message: { content: Block[] }; error?: string }): void {
    this.unacked.length = 0;
    if (!this.assistantSeen || this.seenPending) {
      this.assistantSeen = true;
      this.working = true;
      this.seenPending = false;
      this.host.turnStarted();
    }
    if (m.error) this.onAssistantError(m.error);
    for (const b of m.message.content ?? []) {
      if (b.type === 'tool_use' && b.name) this.onToolUse(b.id ?? '', b.name, b.input ?? {});
    }
  }

  private onAssistantError(error: string): void {
    const sentence =
      error === 'authentication_failed' ? ['I can\'t reach my model: the API key was refused.', 'Check ANTHROPIC_API_KEY in .env.local.']
      : error === 'billing_error' || error === 'account_on_hold' ? ['I can\'t reach my model: the account behind the API key has a billing problem.', 'Check the Anthropic console.']
      : error === 'model_not_found' ? [`I can't reach my model: ${this.host.employee().model} is not available to this key.`, 'Pick another model in my profile.']
      : null;
    if (sentence && !this.fatalReported) {
      this.fatalReported = true;
      this.host.reportStuck(sentence[0], sentence[1]);
    }
  }

  private onToolUse(id: string, name: string, input: Record<string, unknown>): void {
    const { server, tool } = splitToolName(name);
    if (server === 'office' && SPOKE_TOOLS.has(tool)) this.spoke = true;
    if (server === 'host') this.hostCalls.add(id);

    if (server !== 'office' && tool !== 'TodoWrite') {
      const verdict = this.repeats.note(name, input);
      if (verdict === 'warn') this.deliver({ kind: 'office', text: REPEAT_NOTICE });
      else if (verdict === 'stuck') {
        this.repeats.reset();
        this.host.reportStuck('I kept repeating the same action.', `I tried the same step eight times in a row and it made no difference.`);
      }
    }

    const mapped = mapToolCall(name, input);
    if (mapped.plan && mapped.plan.length > 0) this.host.setPlan(mapped.plan);
    if (mapped.family) this.host.toolUsed(mapped.family as ToolFamily);
    if (mapped.step && !mapped.recordedByOffice) {
      const stepId = this.host.step(mapped.step);
      this.openSteps.set(id, { stepId, failed: mapped.failed });
    }
  }

  private onUser(m: { message: { content: unknown } }): void {
    const content = m.message.content;
    if (!Array.isArray(content)) return;
    for (const b of content as Block[]) {
      if (b.type !== 'tool_result' || !b.tool_use_id) continue;
      this.hostCalls.delete(b.tool_use_id);
      const open = this.openSteps.get(b.tool_use_id);
      if (!open) continue;
      this.openSteps.delete(b.tool_use_id);
      if (b.is_error) this.host.endStep(open.stepId, 'error', open.failed ?? undefined);
      else this.host.endStep(open.stepId, 'ok');
    }
  }

  /** Cumulative `total_cost_usd` after a resume already includes the earlier turns: persist the baseline, never reset it. */
  private costDelta(total: number): number {
    let delta = total - this.lastTotalUsd;
    if (delta < 0) delta = total;
    this.lastTotalUsd = total;
    void writeFile(path.join(this.deps.home, COST_FILE), JSON.stringify({ lastTotalUsd: total })).catch(() => {});
    return delta;
  }

  private onResult(r: ResultLike): void {
    if (this.disposed) return;
    const costUsd = this.costDelta(r.total_cost_usd ?? 0);
    const u = r.usage ?? {};
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const outputTokens = u.output_tokens ?? 0;
    const interrupted = this.interruptPending;
    const ok = r.subtype === 'success' && !r.is_error;
    const fatal = this.fatalReported;

    const spoke = this.spoke;
    const textAllowed = this.textAllowed;
    this.working = false;
    this.assistantSeen = false;
    this.seenPending = false;
    this.interruptPending = false;
    this.spoke = false;
    this.textAllowed = false;
    this.fatalReported = false;
    this.pausedMidTurn = this.pausedMidTurn && this.paused;
    this.repeats.reset();
    this.hostCalls.clear();
    for (const s of this.openSteps.values()) this.host.endStep(s.stepId, 'ok');
    this.openSteps.clear();
    if (ok) this.crashes = 0;

    if (ok && !interrupted && !spoke && textAllowed && typeof r.result === 'string' && r.result.trim()) {
      const text = stripMarkdown(r.result);
      if (text) this.host.messageUser(text, { final: true });
    }

    const base = { costUsd, inputTokens, outputTokens, numTurns: r.num_turns };
    if (interrupted) this.host.turnEnded({ ...base, interrupted: true });
    else if (fatal) this.host.turnEnded(base);
    else if (!ok) this.host.turnEnded({ ...base, error: r.subtype === 'success' ? 'error_during_execution' : r.subtype });
    else this.host.turnEnded(base);
    this.inbox?.poke();
  }
}

interface ResultLike {
  subtype: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

/** The factory `createRuntimeFactory` hands to office when `MOCK_LLM` is not `1`. */
export function createClaudeRuntime(deps: RuntimeDeps): EmployeeRuntime {
  return new ClaudeRuntime(deps);
}

/** Tests: a runtime factory with the SDK replaced by `fakeQuery`. */
export function claudeRuntimeFactory(opts: ClaudeRuntimeOptions): RuntimeFactory {
  return (deps) => new ClaudeRuntime(deps, opts);
}
