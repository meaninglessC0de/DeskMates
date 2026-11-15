import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { Employee } from '../../shared/index.ts';
import { desktopGroup, isAllowedDesktopTool, isRiskyShell, riskyShellPatterns, riskyShellStep, splitToolName } from './toolGroups.ts';
import type { ApprovalOutcome, GrantedApproval } from './types.ts';

export type Family = 'desktop' | 'shell' | 'files';

export type Decision =
  | { kind: 'allow' }
  | { kind: 'deny'; message: string }
  | { kind: 'ask'; family: Family | null; title: string; detail: string };

export interface GateHost {
  employee(): Employee;
  requestApproval(a: { title: string; detail: string; kind: 'tool' }): Promise<ApprovalOutcome>;
  /** A tool is about to be asked for: the work has started, so a task is open before the approval is created. */
  toolUsed?(family: 'desktop' | 'space' | 'web'): void;
  /** Approvals the employee raised herself (request_approval) that the manager approved in the task now open. */
  grantedApprovals?(): GrantedApproval[];
}

/** An approval the employee asked for and got covers a risky command of the same kind for this long. */
export const APPROVAL_COVER_MS = 10 * 60_000;

/** The one tool the mock host offers (MockHost has no real MCP server). */
export const MOCK_HOST_TOOLS: ReadonlySet<string> = new Set(['read_window']);

const NOT_AVAILABLE = 'That tool is not available to you. Use another approach.';
const NO_SCREEN = "You do not have your manager's screen. Use request_screen if you are allowed to.";
const NO_COMMANDS = 'Running commands is switched off for you.';
const NO_INTERNET = 'Internet access is switched off for you.';

const WEB_TOOLS = new Set(['WebSearch', 'WebFetch']);
const BUILTIN_ALLOWED = new Set(['TodoWrite', 'WebSearch', 'WebFetch']);

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function urlHostAndFile(url: string): string {
  try {
    const u = new URL(url);
    const file = u.pathname.split('/').filter(Boolean).pop() ?? '';
    return file ? `${u.hostname} · ${file}` : u.hostname;
  } catch {
    return clip(url, 60);
  }
}

/**
 * Decides allow, ask or deny for every tool call (employee-runtime.md section 6). `decide` is pure given the live
 * employee row; `canUseTool` adds the waiting and the memory of "for this task" answers.
 */
export class PermissionGate {
  private remembered = new Set<Family>();

  constructor(private host: GateHost) {}

  /** The current task closed (finish_task, report_stuck, removal): forget what "for this task" allowed. */
  clearTaskMemory(): void {
    this.remembered.clear();
  }

  rememberedFamilies(): Family[] {
    return [...this.remembered];
  }

  decide(toolName: string, input: Record<string, unknown> = {}): Decision {
    const e = this.host.employee();
    const perms = e.permissions;
    const { server, tool } = splitToolName(toolName);
    const first = e.persona.firstName;

    // 1. our own office tools check their own rules
    if (server === 'office') return { kind: 'allow' };

    // 2. anything outside the allow-lists never runs (ADMIN tools are also removed from the model's view)
    if (server === null) {
      if (!BUILTIN_ALLOWED.has(tool)) return { kind: 'deny', message: NOT_AVAILABLE };
    } else if (server === 'desktop' || server === 'host') {
      const mockHost = server === 'host' && MOCK_HOST_TOOLS.has(tool);
      if (!mockHost && !isAllowedDesktopTool(tool)) return { kind: 'deny', message: NOT_AVAILABLE };
    } else if (server === 'space') {
      if (!['shell', 'read_file', 'write_file'].includes(tool)) return { kind: 'deny', message: NOT_AVAILABLE };
    } else {
      return { kind: 'deny', message: NOT_AVAILABLE };
    }

    // 3. the user's real Mac only while a screen grant is live
    if (server === 'host') return e.screenGrant ? { kind: 'allow' } : { kind: 'deny', message: NO_SCREEN };

    // 4. switches
    if (server === 'space' && tool === 'shell' && !perms.commands) return { kind: 'deny', message: NO_COMMANDS };

    // 5.
    const isWeb = server === null && WEB_TOOLS.has(tool);
    if (!perms.internet && (isWeb || (server === 'desktop' && tool === 'browser_navigate'))) {
      return { kind: 'deny', message: NO_INTERNET };
    }

    // 6. works independently
    if (perms.level === 'independent') return { kind: 'allow' };

    const group = server === 'desktop' ? desktopGroup(tool) : 'unknown';
    const risky = group === 'risky';
    const riskyShell = server === 'space' && tool === 'shell' && isRiskyShell(str(input.command));

    // 6b. the manager just approved this very step when she asked for it herself: do not ask a second time
    if (riskyShell && this.coveredByGrant(str(input.command))) return { kind: 'allow' };

    // 7. asks before big steps
    if (perms.level === 'asks_big_steps') {
      if (risky || riskyShell) return this.ask(toolName, input, first);
      return { kind: 'allow' };
    }

    // 8. asks first
    if (group === 'observe' || (server === null && tool === 'TodoWrite') || (server === 'space' && tool === 'read_file') || isWeb) {
      return { kind: 'allow' };
    }
    const d = this.ask(toolName, input, first);
    if (d.kind === 'ask' && d.family && this.remembered.has(d.family)) return { kind: 'allow' };
    return d;
  }

  /**
   * True when every risky pattern the command matches also matches the title or detail of an approval granted in this
   * task within the last 10 minutes (approving a push never covers a delete).
   */
  private coveredByGrant(command: string): boolean {
    const grants = (this.host.grantedApprovals?.() ?? []).filter((g) => Date.now() - g.atMs <= APPROVAL_COVER_MS);
    if (grants.length === 0) return false;
    const patterns = riskyShellPatterns(command);
    if (patterns.length === 0) return false;
    return patterns.every((re) => grants.some((g) => re.test(g.title.toLowerCase()) || re.test(g.detail.toLowerCase())));
  }

  private ask(toolName: string, input: Record<string, unknown>, first: string): Decision {
    const { server, tool } = splitToolName(toolName);
    if (server === 'space' && tool === 'shell') {
      const command = str(input.command);
      const step = riskyShellStep(command);
      if (step) return { kind: 'ask', family: null, title: step.title, detail: clip(step.part, 120) };
      return { kind: 'ask', family: 'shell', title: 'Run a command', detail: clip(command, 120) };
    }
    if (server === 'space' && tool === 'write_file') {
      return { kind: 'ask', family: 'files', title: 'Save a file', detail: clip(str(input.path), 120) };
    }
    if (tool === 'kill_app') {
      return { kind: 'ask', family: null, title: 'Quit an app', detail: `Force-quits an app on ${first}'s desktop` };
    }
    if (tool === 'run_script') {
      return { kind: 'ask', family: null, title: 'Run a script', detail: `Runs a script on ${first}'s desktop` };
    }
    if (tool === 'browser_download') {
      return { kind: 'ask', family: null, title: 'Download a file', detail: clip(urlHostAndFile(str(input.url)), 120) };
    }
    if (tool === 'browser_set_input_files') {
      const files = Array.isArray(input.files) ? input.files.map(String).join(', ') : str(input.file) || str(input.path);
      return { kind: 'ask', family: null, title: 'Upload a file', detail: clip(files || 'a file', 120) };
    }
    return {
      kind: 'ask',
      family: 'desktop',
      title: 'Use the desktop',
      detail: `Click, type and browse on ${first}'s desktop for this task`,
    };
  }

  /** The SDK callback. `opts.signal` is aborted when the call is cancelled. */
  canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts?: { signal?: AbortSignal },
  ): Promise<PermissionResult> => {
    const d = this.decide(toolName, input);
    if (d.kind === 'allow') return { behavior: 'allow', updatedInput: input };
    if (d.kind === 'deny') return { behavior: 'deny', message: d.message };
    if (opts?.signal?.aborted) return { behavior: 'deny', message: 'Cancelled.' };
    const { server } = splitToolName(toolName);
    this.host.toolUsed?.(server === 'space' ? 'space' : server === null ? 'web' : 'desktop');
    const outcome = await this.host.requestApproval({ title: d.title, detail: d.detail, kind: 'tool' });
    if (!outcome.approved) {
      const why = outcome.note?.trim();
      return {
        behavior: 'deny',
        message: `Your manager said no${why ? `: ${why}` : '.'} Do not retry it or look for a way around. Find another approach or ask.`,
      };
    }
    if (outcome.scope === 'task' && d.family) this.remembered.add(d.family);
    return { behavior: 'allow', updatedInput: input };
  };
}
