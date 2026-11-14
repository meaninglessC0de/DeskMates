import path from 'node:path';
import type { ActivityStep, PlanStep } from '../../shared/index.ts';
import { splitToolName } from './toolGroups.ts';
import type { ToolFamily } from './types.ts';

export const MAX_SENTENCE = 40;

export interface MappedCall {
  /** For `host.toolUsed`; null for office tools and TodoWrite. */
  family: ToolFamily | null;
  /** Past tense, at most 40 characters, no paths, ids, commands or tool names. Null = no step. */
  step: string | null;
  /** What the step becomes when the result is an error ("Couldn't open Firefox"). Null when there is no step. */
  failed: string | null;
  peer?: ActivityStep['peer'];
  /** TodoWrite: the plan to mirror into the task. */
  plan?: PlanStep[];
  /** The office tool itself records its own step (set_activity, message_colleague): the runtime must not add this one. */
  recordedByOffice?: boolean;
}

export function clipSentence(s: string, n = MAX_SENTENCE): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function hostnameOf(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  for (const candidate of [t, `https://${t}`]) {
    try {
      const h = new URL(candidate).hostname.replace(/^www\./, '');
      if (h) return h;
    } catch {
      /* try the next form */
    }
  }
  return '';
}

function prettyApp(raw: string): string {
  let n = raw.trim();
  if (!n) return '';
  if (n.includes('/')) n = path.basename(n);
  if (/^[a-z]+(\.[a-z0-9]+){2,}$/i.test(n)) n = n.split('.').pop() ?? n; // a bundle id such as org.mozilla.firefox
  n = n.replace(/\.(app|desktop|exe)$/i, '').replace(/[-_]+/g, ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function fileName(p: string): string {
  const b = path.basename(p.trim());
  return b.replace(/[^\p{L}\p{N}._ -]/gu, '');
}

const FIRST_URL = (input: Record<string, unknown>): string => {
  const urls = input.urls;
  return Array.isArray(urls) && typeof urls[0] === 'string' ? urls[0] : '';
};

/** Deterministic tool call to sentence rules (employee-runtime.md 4.4). No model call. */
export function mapToolCall(name: string, input: Record<string, unknown> = {}): MappedCall {
  const none: MappedCall = { family: null, step: null, failed: null };
  const { server, tool } = splitToolName(name);

  if (server === null) {
    switch (tool) {
      case 'TodoWrite': {
        const todos = Array.isArray(input.todos) ? (input.todos as Array<Record<string, unknown>>) : [];
        const plan: PlanStep[] = todos
          .filter((t) => typeof t?.content === 'string')
          .map((t) => ({
            title: String(t.content),
            status: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'in_progress' : 'pending',
          }));
        return { ...none, plan };
      }
      case 'WebSearch':
        return { family: 'web', step: 'Searched the web', failed: "Couldn't search the web" };
      case 'WebFetch': {
        const host = hostnameOf(str(input.url));
        return {
          family: 'web',
          step: clipSentence(host ? `Read ${host}` : 'Read a web page'),
          failed: clipSentence(host ? `Couldn't read ${host}` : "Couldn't read a web page"),
        };
      }
      default:
        return none;
    }
  }

  if (server === 'office') {
    if (tool === 'set_activity') return { ...none, recordedByOffice: true };
    if (tool === 'message_colleague') {
      const to = str(input.to);
      const first = to.split(/\s+/)[0] ?? '';
      return {
        family: null,
        step: clipSentence(first ? `Messaged ${first}` : 'Messaged a teammate'),
        failed: clipSentence(first ? `Couldn't message ${first}` : "Couldn't message a teammate"),
        peer: { employeeId: '', direction: 'to', text: str(input.text) },
        recordedByOffice: true,
      };
    }
    return none;
  }

  if (server === 'space') {
    switch (tool) {
      case 'shell':
        return { family: 'space', step: 'Ran a command', failed: "Couldn't run a command" };
      case 'write_file': {
        const f = fileName(str(input.path));
        return {
          family: 'space',
          step: clipSentence(f ? `Saved ${f}` : 'Saved a file'),
          failed: clipSentence(f ? `Couldn't save ${f}` : "Couldn't save a file"),
        };
      }
      default:
        return { family: 'space', step: null, failed: null };
    }
  }

  if (server === 'desktop' || server === 'host') {
    switch (tool) {
      case 'launch_app': {
        const host = hostnameOf(FIRST_URL(input));
        const app = prettyApp(str(input.name) || str(input.launch_path) || str(input.bundle_id));
        const what = host || app || 'an app';
        return { family: 'desktop', step: clipSentence(`Opened ${what}`), failed: clipSentence(`Couldn't open ${what}`) };
      }
      case 'browser_navigate': {
        const host = hostnameOf(str(input.url));
        const what = host || 'a page';
        return { family: 'desktop', step: clipSentence(`Opened ${what}`), failed: clipSentence(`Couldn't open ${what}`) };
      }
      default:
        // everything in OBSERVE and individual clicks, keys and scrolls: no step
        return { family: 'desktop', step: null, failed: null };
    }
  }

  return none;
}
