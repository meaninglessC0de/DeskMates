import { randomUUID } from 'node:crypto';
import type { McpServerConfig, Options, PermissionResult, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { toolsOfServer } from './sdkServers.ts';
import { splitToolName } from './toolGroups.ts';

/** The part of the SDK's `Query` that the runtime uses. The real `Query` satisfies it. */
export interface QueryLike extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<unknown>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<unknown>;
  close(): void;
}

export type QueryParams = { prompt: AsyncIterable<SDKUserMessage>; options: Options };
export type QueryFactory = (params: QueryParams) => QueryLike;

export class FakeInterrupted extends Error {
  constructor() {
    super('interrupted');
  }
}

export interface ToolOutcome {
  /** The gate (or `disallowedTools`) let it run. */
  allowed: boolean;
  /** What the model would read back. */
  text: string;
  isError: boolean;
}

export interface FinishOptions {
  /** The final assistant text (`result.result`). Default ''. */
  text?: string;
  /** Cost of this turn; added to the running total. Default 0.01. */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  numTurns?: number;
  /** An error result such as 'error_max_turns' or 'error_during_execution'. */
  subtype?: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd';
}

export interface FakeTurn {
  /** 0 for the first query() of the test, 1 for the one after a restart, and so on. */
  queryIndex: number;
  input: SDKUserMessage;
  /** The text of the user message that started this turn. */
  inputText: string;
  options: Options;
  sessionId: string;
  /** Emit assistant text. */
  text(content: string): void;
  /** Emit a tool_use, run the permission callback and (if allowed) the tool, emit the tool_result. */
  tool(name: string, input?: Record<string, unknown>, o?: { result?: string; isError?: boolean }): Promise<ToolOutcome>;
  /** Interruptible delay. */
  sleep(ms: number): Promise<void>;
  /** Wait until interrupt() is called, then throw FakeInterrupted. */
  untilInterrupted(): Promise<never>;
  /** End the turn with a result message. A script that returns without calling it gets a default success. */
  finish(o?: FinishOptions): void;
  /** Make the whole query die the way a crashed subprocess does. */
  crash(message?: string): never;
  /** The system/init `tools` list, as the model would see them. */
  visibleTools(): string[];
}

export type FakeScript = (turn: FakeTurn) => Promise<void> | void;

export interface FakeOptions {
  /** When the CLI emits system/init. Default 'first_input' (the cautious assumption). */
  initOn?: 'start' | 'first_input';
  /** Simulate a resumed session: the running cost the transcript already carries. */
  resumeTotalUsd?: number;
  /** Tool names the init message reports, besides the in-process ones. Default: allow-listed desktop names if a desktop server is configured. */
  extraTools?: (options: Options) => string[];
}

export class FakeQueryInstance implements QueryLike {
  readonly index: number;
  readonly options: Options;
  readonly setMcpServersCalls: Array<Record<string, McpServerConfig>> = [];
  readonly interrupts: number[] = [];
  readonly turns: FakeTurn[] = [];
  readonly sessionId: string;
  closed = false;
  currentServers: Record<string, McpServerConfig>;

  private out: SDKMessage[] = [];
  private waiter: (() => void) | null = null;
  private failure: Error | null = null;
  private ended = false;
  private interruptRequested = false;
  private interruptWaiters = new Set<() => void>();
  private totalUsd: number;
  private initDone = false;
  private toolSeq = 0;

  constructor(
    index: number,
    private params: QueryParams,
    private script: FakeScript,
    private fakeOpts: FakeOptions,
  ) {
    this.index = index;
    this.options = params.options;
    this.sessionId = params.options.resume ?? `fake-session-${index}-${randomUUID().slice(0, 8)}`;
    this.currentServers = { ...(params.options.mcpServers ?? {}) };
    this.totalUsd = params.options.resume ? fakeOpts.resumeTotalUsd ?? 0 : 0;
    if (fakeOpts.initOn === 'start') this.emitInit();
    void this.drive();
  }

  // ---- the Query surface

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    for (;;) {
      const m = this.out.shift();
      if (m) return { value: m, done: false };
      if (this.failure) {
        const f = this.failure;
        this.failure = null;
        throw f;
      }
      if (this.ended || this.closed) return { value: undefined, done: true };
      await new Promise<void>((r) => (this.waiter = r));
    }
  }

  async return(): Promise<IteratorResult<SDKMessage, void>> {
    this.close();
    return { value: undefined, done: true };
  }

  async throw(e: unknown): Promise<IteratorResult<SDKMessage, void>> {
    this.close();
    throw e;
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }

  async interrupt(): Promise<unknown> {
    this.interrupts.push(Date.now());
    this.interruptRequested = true;
    for (const w of [...this.interruptWaiters]) w();
    return undefined;
  }

  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<unknown> {
    this.setMcpServersCalls.push(servers);
    this.currentServers = { ...this.currentServers, ...servers };
    for (const name of Object.keys(this.currentServers)) if (!(name in servers)) delete this.currentServers[name];
    return { added: Object.keys(servers), removed: [], errors: {} };
  }

  close(): void {
    this.closed = true;
    this.poke();
    for (const w of [...this.interruptWaiters]) w();
  }

  // ---- machinery

  private poke(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  private push(m: unknown): void {
    this.out.push(m as SDKMessage);
    this.poke();
  }

  visibleTools(): string[] {
    const o = this.options;
    const names: string[] = [...(o.tools && Array.isArray(o.tools) ? o.tools : [])];
    for (const [server, cfg] of Object.entries(this.currentServers)) {
      const specs = toolsOfServer(cfg);
      if (specs) names.push(...specs.map((s) => `mcp__${server}__${s.name}`));
    }
    names.push(...(this.fakeOpts.extraTools?.(o) ?? []));
    const dis = new Set(o.disallowedTools ?? []);
    return names.filter((n) => !dis.has(n));
  }

  private emitInit(): void {
    if (this.initDone) return;
    this.initDone = true;
    this.push({
      type: 'system',
      subtype: 'init',
      session_id: this.sessionId,
      uuid: randomUUID(),
      tools: this.visibleTools(),
      mcp_servers: Object.keys(this.currentServers).map((name) => ({ name, status: 'connected' })),
      model: this.options.model ?? 'fake',
      cwd: this.options.cwd ?? '',
      permissionMode: 'default',
      apiKeySource: 'ANTHROPIC_API_KEY',
    });
  }

  private assistant(content: unknown[]): void {
    this.push({
      type: 'assistant',
      message: { id: `msg_${randomUUID().slice(0, 8)}`, role: 'assistant', model: 'fake', content, stop_reason: null, usage: {} },
      parent_tool_use_id: null,
      uuid: randomUUID(),
      session_id: this.sessionId,
    });
  }

  private abortableSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.interruptRequested || this.closed) return reject(new FakeInterrupted());
      const t = setTimeout(() => {
        this.interruptWaiters.delete(onInt);
        resolve();
      }, ms);
      const onInt = () => {
        clearTimeout(t);
        this.interruptWaiters.delete(onInt);
        reject(new FakeInterrupted());
      };
      this.interruptWaiters.add(onInt);
    });
  }

  private inputTextOf(m: SDKUserMessage): string {
    const c = m.message.content;
    return typeof c === 'string' ? c : c.map((b) => ('text' in b ? String(b.text) : '')).join('\n');
  }

  private async drive(): Promise<void> {
    try {
      for await (const input of this.params.prompt) {
        if (this.closed) return;
        this.emitInit();
        this.interruptRequested = false;
        let finished = false;
        const turn = this.makeTurn(input, () => {
          finished = true;
        });
        this.turns.push(turn);
        try {
          await this.script(turn);
        } catch (e) {
          if (e instanceof FakeInterrupted) {
            if (!finished) this.finishResult({ subtype: 'error_during_execution', costUsd: 0 });
            finished = true;
            continue;
          }
          throw e;
        }
        if (!finished) this.finishResult({});
      }
    } catch (e) {
      this.failure = e instanceof Error ? e : new Error(String(e));
    } finally {
      this.ended = true;
      this.poke();
    }
  }

  private finishResult(o: FinishOptions): void {
    const cost = o.costUsd ?? 0.01;
    this.totalUsd += cost;
    const base = {
      type: 'result',
      duration_ms: 10,
      duration_api_ms: 5,
      is_error: !!o.subtype,
      num_turns: o.numTurns ?? 3,
      total_cost_usd: this.totalUsd,
      usage: { input_tokens: o.inputTokens ?? 1000, output_tokens: o.outputTokens ?? 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      uuid: randomUUID(),
      session_id: this.sessionId,
    };
    if (o.subtype) this.push({ ...base, subtype: o.subtype, errors: [o.subtype] });
    else this.push({ ...base, subtype: 'success', result: o.text ?? '' });
  }

  private makeTurn(input: SDKUserMessage, markFinished: () => void): FakeTurn {
    const self = this;
    return {
      queryIndex: this.index,
      input,
      inputText: this.inputTextOf(input),
      options: this.options,
      sessionId: this.sessionId,
      text: (content) => this.assistant([{ type: 'text', text: content }]),
      sleep: (ms) => this.abortableSleep(ms),
      async untilInterrupted(): Promise<never> {
        await new Promise<void>((resolve) => {
          if (self.interruptRequested) return resolve();
          self.interruptWaiters.add(resolve);
        });
        throw new FakeInterrupted();
      },
      finish: (o = {}) => {
        markFinished();
        this.finishResult(o);
      },
      crash: (message = 'The process exited unexpectedly') => {
        throw new Error(message);
      },
      visibleTools: () => this.visibleTools(),
      async tool(name, toolInput = {}, o = {}): Promise<ToolOutcome> {
        const id = `toolu_${++self.toolSeq}`;
        self.assistant([{ type: 'tool_use', id, name, input: toolInput }]);
        const resultMsg = (text: string, isError: boolean) =>
          self.push({
            type: 'user',
            message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }], is_error: isError }] },
            parent_tool_use_id: null,
            uuid: randomUUID(),
            session_id: self.sessionId,
          });
        const out = (outcome: ToolOutcome): ToolOutcome => {
          resultMsg(outcome.text, outcome.isError);
          return outcome;
        };
        if ((self.options.disallowedTools ?? []).includes(name)) {
          return out({ allowed: false, text: `Error: No such tool available: ${name}`, isError: true });
        }
        if (self.interruptRequested) throw new FakeInterrupted();
        const gate = self.options.canUseTool;
        if (gate) {
          const ac = new AbortController();
          const verdict: PermissionResult = await (gate as unknown as (n: string, i: Record<string, unknown>, o: unknown) => Promise<PermissionResult>)(
            name,
            toolInput,
            { signal: ac.signal, toolUseID: id },
          );
          if (verdict.behavior === 'deny') return out({ allowed: false, text: verdict.message, isError: true });
        }
        const { server, tool } = splitToolName(name);
        const spec = server ? toolsOfServer(self.currentServers[server])?.find((t) => t.name === tool) : undefined;
        if (spec) {
          const parsed = z.object(spec.shape).safeParse(toolInput);
          if (!parsed.success) return out({ allowed: true, text: `Invalid input: ${parsed.error.message}`, isError: true });
          const r = await spec.handler(parsed.data as Record<string, unknown>);
          const text = r.content.map((c) => ('text' in c ? c.text : '[image]')).join('\n');
          return out({ allowed: true, text, isError: !!r.isError });
        }
        return out({ allowed: true, text: o.result ?? 'ok', isError: !!o.isError });
      },
    };
  }
}

export interface FakeQueryControl {
  factory: QueryFactory;
  instances: FakeQueryInstance[];
  /** The latest query() created. */
  readonly last: FakeQueryInstance;
}

/**
 * A scripted stand-in for the SDK's `query()`: same factory shape, same messages (system/init, assistant with
 * tool_use blocks, user with tool_result blocks, result), the permission callback and the in-process tools really run.
 * `script` is called once per user message that the runtime sends; branch on `turn.queryIndex` to script a restart.
 */
export function createFakeQuery(script: FakeScript, opts: FakeOptions = {}): FakeQueryControl {
  const instances: FakeQueryInstance[] = [];
  const factory: QueryFactory = (params) => {
    const inst = new FakeQueryInstance(instances.length, params, script, opts);
    instances.push(inst);
    return inst;
  };
  return {
    factory,
    instances,
    get last() {
      return instances[instances.length - 1];
    },
  };
}
