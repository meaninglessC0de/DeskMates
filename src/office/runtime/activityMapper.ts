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
  // a launch path may carry a whole command line: keep the program only
  if (/^[/~$]/.test(n) || /\s-{1,2}\w/.test(n)) n = n.split(/\s+/)[0];
  if (n.includes('/')) n = path.basename(n);
  if (/^[a-z]+(\.[a-z0-9]+){2,}$/i.test(n)) n = n.split('.').pop() ?? n; // a bundle id such as org.mozilla.firefox
  n = n.replace(/\.(app|desktop|exe)$/i, '').replace(/[-_]+/g, ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function fileName(p: string): string {
  const b = path.basename(p.trim());
  return b.replace(/[^\p{L}\p{N}._ -]/gu, '');
}

// ---------------------------------------------------------------------------------------------------------------
// Shell commands: name the purpose, never the command. Deterministic, no model call.

interface Described {
  score: number;
  sentence: string;
}

const TEST_RUNNERS = /^(vitest|jest|pytest|py\.test|mocha|ava|tap|rspec|phpunit|bats)$/;
const SERVER_TOOLS = /^(vite|uvicorn|gunicorn|flask|http-server|live-server|serve|nodemon|next|nuxt|astro|webpack-dev-server|php)$/;
const LOOK_TOOLS = new Set(['ls', 'cat', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'head', 'tail', 'tree', 'wc', 'pwd', 'which', 'file', 'stat', 'less', 'more', 'awk', 'diff', 'sort', 'uniq', 'du', 'df', 'ag', 'fd', 'sed']);
const ORGANISE_TOOLS = new Set(['mkdir', 'cp', 'mv', 'touch', 'chmod', 'ln', 'rsync', 'tar', 'unzip', 'zip']);
const GUI_APPS = new Set(['firefox', 'chromium', 'chromium-browser', 'google-chrome', 'chrome', 'xfce4-terminal', 'gnome-terminal', 'xterm', 'mousepad', 'gedit', 'code', 'thunar', 'nautilus', 'libreoffice']);
const WRAPPERS = new Set(['sudo', 'env', 'nohup', 'time', 'timeout', 'nice', 'command', 'exec', 'xvfb-run', 'setsid', 'stdbuf']);

/** Drops heredoc bodies and quoted text so a command inside a string or a heredoc never counts as a command. */
function maskCommand(raw: string): string {
  let t = raw.replace(/\r/g, '');
  t = t.replace(/<<-?\s*(['"]?)([A-Za-z_][\w]*)\1([^\n]*)\n[\s\S]*?(?:\n\s*\2\s*(?=\n|$)|$)/g, ' <<HEREDOC $3\n');
  t = t.replace(/\\\n/g, ' ');
  t = t.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return t;
}

function stripPrefix(tokens: string[]): string[] {
  let t = tokens.slice();
  for (;;) {
    const head = t[0];
    if (head === undefined) return t;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) t = t.slice(1); // FOO=bar cmd
    else if (WRAPPERS.has(head)) {
      t = t.slice(1);
      while (t[0] && (t[0].startsWith('-') || /^\d+[smh]?$/.test(t[0]) || /^[A-Za-z_]\w*=/.test(t[0]))) t = t.slice(1);
    } else return t;
  }
}

function base(token: string): string {
  const t = token.replace(/^['"]+|['"]+$/g, '');
  return fileName(t);
}

function firstArg(tokens: string[], skip = 1): string {
  for (const t of tokens.slice(skip)) {
    if (t.startsWith('-') || t.startsWith('<') || t.startsWith('>') || t.startsWith('&') || /^\d*>/.test(t) || /^['"]*$/.test(t)) continue;
    return t;
  }
  return '';
}

function packageName(raw: string): string {
  let n = raw.replace(/^['"]+|['"]+$/g, '');
  if (!n || n.startsWith('.') || n.startsWith('/') || n.includes('://') || n.startsWith('git+')) return '';
  n = n.replace(/(?<=.)@[^/@]*$/, '').replace(/(?:==|>=|<=|~=|=).*$/, '');
  return n.replace(/[^\w@/.-]/g, '');
}

function describeScript(script: string): Described {
  if (/^(test|tests|test:.*|e2e|spec|check)$/.test(script)) return { score: 100, sentence: 'Ran the tests' };
  if (/^(dev|start|serve|preview|watch|dev:.*)$/.test(script)) return { score: 90, sentence: 'Started a local server' };
  if (/^(build|compile|bundle|build:.*)$/.test(script)) return { score: 80, sentence: 'Built the project' };
  if (/^(lint|lint:.*|format|prettier|typecheck|tsc)$/.test(script)) return { score: 78, sentence: 'Checked the code style' };
  return { score: 66, sentence: clipSentence(`Ran the ${script} script`) };
}

function describeGit(tokens: string[]): Described {
  const rest = tokens.slice(1).filter((t) => !(t === '-C' || t === '-c'));
  const sub = rest.find((t) => !t.startsWith('-') && !t.startsWith('/') && !t.startsWith('.') && !t.startsWith('~')) ?? '';
  const flags = tokens.slice(1);
  switch (sub) {
    case 'commit':
      return { score: 95, sentence: 'Committed the change' };
    case 'push':
      return { score: 94, sentence: 'Pushed the branch' };
    case 'checkout':
    case 'switch':
      return /(^|\s)(-b|-B|-c|-C)(\s|$)/.test(flags.join(' ')) ? { score: 92, sentence: 'Started a branch' } : { score: 52, sentence: 'Switched branch' };
    case 'branch':
      return firstArg(tokens, tokens.indexOf('branch') + 1) ? { score: 92, sentence: 'Started a branch' } : { score: 56, sentence: 'Checked the repository' };
    case 'status':
    case 'diff':
    case 'log':
    case 'show':
    case 'blame':
    case 'remote':
    case 'rev-parse':
      return { score: 56, sentence: 'Checked the repository' };
    case 'add':
    case 'rm':
    case 'restore':
    case 'reset':
      return { score: 54, sentence: 'Staged the changes' };
    case 'init':
      return { score: 60, sentence: 'Set up a repository' };
    case 'clone':
      return { score: 60, sentence: 'Cloned a repository' };
    case 'pull':
    case 'fetch':
      return { score: 60, sentence: 'Pulled the latest changes' };
    case 'merge':
    case 'rebase':
    case 'stash':
    case 'tag':
      return { score: 60, sentence: clipSentence(`Ran git ${sub}`) };
    default:
      return { score: 50, sentence: sub ? clipSentence(`Ran git ${sub}`) : 'Checked the repository' };
  }
}

function describeSegment(segment: string): Described | null {
  let tokens = stripPrefix(segment.trim().split(/\s+/).filter(Boolean));
  if (tokens.length === 0) return null;
  // npx / bunx / pnpm exec run another tool: describe that tool
  if (/^(npx|bunx|pnpx)$/.test(tokens[0]) || (/^(pnpm|yarn)$/.test(tokens[0]) && /^(exec|dlx)$/.test(tokens[1] ?? ''))) {
    tokens = tokens.slice(tokens[0] === 'pnpm' || tokens[0] === 'yarn' ? 2 : 1);
    while (tokens[0]?.startsWith('-')) tokens = tokens.slice(1);
    if (tokens.length === 0) return null;
  }
  const cmd = base(tokens[0]).toLowerCase();
  const args = tokens.slice(1);
  const argText = args.join(' ');

  // a script run through a bundler, e.g. `npx tsx file.ts`
  if (/^(tsx|ts-node|bun|deno)$/.test(cmd)) {
    const f = firstArg(tokens, tokens.findIndex((t, i) => i > 0 && /^(run|test)$/.test(t)) > 0 ? 2 : 1);
    if (args[0] === 'test') return { score: 100, sentence: 'Ran the tests' };
    return f ? { score: 70, sentence: clipSentence(`Ran ${base(f)}`) } : null;
  }

  if (cmd === 'git') return describeGit(tokens);

  if (TEST_RUNNERS.test(cmd)) return { score: 100, sentence: 'Ran the tests' };
  if (cmd === 'tsc' && /--noEmit/.test(argText)) return { score: 78, sentence: 'Checked the types' };
  if (/^(eslint|prettier|ruff|flake8|pylint|mypy|black)$/.test(cmd)) return { score: 78, sentence: 'Checked the code style' };
  if (cmd === 'tsc' || cmd === 'make' || cmd === 'gcc' || cmd === 'g++' || cmd === 'cc' || cmd === 'webpack' || cmd === 'esbuild') {
    if (cmd === 'make' && /^test/.test(args[0] ?? '')) return { score: 100, sentence: 'Ran the tests' };
    return { score: 80, sentence: 'Built the project' };
  }
  if (cmd === 'go' && /^test$/.test(args[0] ?? '')) return { score: 100, sentence: 'Ran the tests' };
  if (cmd === 'cargo' && /^test$/.test(args[0] ?? '')) return { score: 100, sentence: 'Ran the tests' };
  if (cmd === 'cargo' && /^build$/.test(args[0] ?? '')) return { score: 80, sentence: 'Built the project' };
  if (cmd === 'node' && /(^|\s)--test(\s|$)/.test(argText)) return { score: 100, sentence: 'Ran the tests' };
  if (/^python3?(\.\d+)?$/.test(cmd) && /(^|\s)-m\s+(pytest|unittest|doctest)(\s|$)/.test(argText)) return { score: 100, sentence: 'Ran the tests' };
  if (/^python3?(\.\d+)?$/.test(cmd) && /(^|\s)-m\s+http\.server(\s|$)/.test(argText)) return { score: 90, sentence: 'Started a local server' };
  if (/^python3?(\.\d+)?$/.test(cmd) && /(^|\s)-m\s+venv(\s|$)/.test(argText)) return { score: 60, sentence: 'Set up a Python environment' };
  if (/^python3?(\.\d+)?$/.test(cmd) && /(^|\s)-m\s+pip(\s|$)/.test(argText)) return describePackages(['pip', ...args.slice(args.indexOf('pip') + 1)]);

  if (/^(npm|pnpm|yarn|bun)$/.test(cmd)) {
    const sub = args.find((t) => !t.startsWith('-')) ?? '';
    const subIdx = args.indexOf(sub);
    if (sub === 'run' || sub === 'run-script') {
      const script = args.slice(subIdx + 1).find((t) => !t.startsWith('-')) ?? '';
      return script ? describeScript(script) : null;
    }
    if (sub === 'test' || sub === 't' || sub === 'tst') return { score: 100, sentence: 'Ran the tests' };
    if (sub === 'start' || sub === 'dev' || sub === 'serve') return { score: 90, sentence: 'Started a local server' };
    if (sub === 'build') return { score: 80, sentence: 'Built the project' };
    if (/^(install|i|add|ci)$/.test(sub)) return describePackages([cmd, ...args]);
    if (sub === '' && (cmd === 'yarn' || cmd === 'pnpm')) return { score: 85, sentence: 'Installed dependencies' };
    if (sub && !['init', 'config', 'cache', 'pack', 'publish', 'link'].includes(sub) && cmd !== 'bun') return describeScript(sub);
    return null;
  }
  if (/^(pip3?|pipx|uv|apt|apt-get|brew|gem|cargo|composer|poetry|conda|apk|dnf|yum)$/.test(cmd)) return describePackages(tokens);

  if (SERVER_TOOLS.test(cmd) && (cmd !== 'next' || /(^|\s)(dev|start)(\s|$)/.test(argText)) && (cmd !== 'flask' || /(^|\s)run(\s|$)/.test(argText)) && (cmd !== 'php' || /(^|\s)-S(\s|$)/.test(argText))) {
    return { score: 90, sentence: 'Started a local server' };
  }

  if (/^(python3?(\.\d+)?|node|ruby|perl|php|bash|sh|zsh|java|deno)$/.test(cmd)) {
    if (/^(python3?(\.\d+)?|perl|ruby)$/.test(cmd) && /(^|\s)-(c|e)(\s|$)/.test(argText)) return { score: 66, sentence: cmd.startsWith('python') ? 'Ran a Python snippet' : 'Ran a script' };
    if (cmd === 'node' && /(^|\s)(-e|-p|--eval)(\s|$)/.test(argText)) return { score: 66, sentence: 'Ran a script' };
    const f = firstArg(tokens);
    if (!f) return /<<HEREDOC/.test(segment) ? { score: 66, sentence: cmd.startsWith('python') ? 'Ran a Python snippet' : 'Ran a script' } : null;
    if (/(^|\/)(server|serve|app|main|index)\.(js|mjs|cjs|py|ts)$/.test(f) && /(^|\s)&\s*$/.test(segment)) return { score: 90, sentence: 'Started a local server' };
    return { score: 70, sentence: clipSentence(`Ran ${base(f)}`) };
  }
  if (/^\.\/[\w./-]+$/.test(tokens[0])) return { score: 70, sentence: clipSentence(`Ran ${base(tokens[0])}`) };

  if (cmd === 'curl' || cmd === 'wget' || cmd === 'http' || cmd === 'httpie') return { score: 60, sentence: 'Fetched a page' };
  if (GUI_APPS.has(cmd)) return { score: 75, sentence: clipSentence(`Opened ${prettyApp(cmd)}`) };
  if (cmd === 'xdg-open' || cmd === 'open') return { score: 75, sentence: 'Opened a page' };

  if (cmd === 'sed' && /(^|\s)-[a-zA-Z]*i/.test(argText)) {
    const f = [...args].reverse().find((t) => !t.startsWith('-') && !/^['"]*$/.test(t));
    return { score: 58, sentence: clipSentence(f ? `Edited ${base(f)}` : 'Edited a file') };
  }
  if (cmd === 'tee') {
    const f = firstArg(tokens);
    return { score: 58, sentence: clipSentence(f ? `Wrote ${base(f)}` : 'Wrote a file') };
  }
  if (cmd === 'rm' || cmd === 'rmdir') return { score: 42, sentence: 'Removed files' };
  if (ORGANISE_TOOLS.has(cmd)) return { score: 40, sentence: 'Organised files' };
  if (LOOK_TOOLS.has(cmd)) return { score: 30, sentence: 'Looked through the files' };
  if (/^(kill|pkill|killall)$/.test(cmd)) return { score: 40, sentence: 'Stopped a process' };
  if (/^(ps|lsof|netstat|ss|pgrep|top)$/.test(cmd)) return { score: 25, sentence: 'Checked running processes' };
  if (cmd === 'sleep') return { score: 10, sentence: 'Waited a moment' };
  return null; // cd, echo, export, true ...
}

function describePackages(tokens: string[]): Described | null {
  const rest = tokens.slice(1);
  const verb = rest.find((t) => !t.startsWith('-')) ?? '';
  if (!/^(install|i|add|ci)$/.test(verb)) return null;
  const names = rest.slice(rest.indexOf(verb) + 1).filter((t) => !t.startsWith('-'));
  const skipRequirements = rest.some((t) => t === '-r' || t === '--requirement');
  const name = skipRequirements ? '' : packageName(names[0] ?? '');
  return { score: 85, sentence: clipSentence(name ? `Installed ${name}` : 'Installed dependencies') };
}

/** The file a redirect (`> file`, `>> file`) writes, if any. */
function redirectTarget(segment: string): string {
  const m = /(?<![0-9&>])>>?\s*([^\s&|;<>()]+)/.exec(segment);
  const t = m?.[1] ?? '';
  if (!t || t.startsWith('/dev/') || /^['"]*$/.test(t)) return '';
  return base(t);
}

/**
 * The purpose of a shell command in a few words ("Ran the tests", "Committed the change"). For a chain it picks the
 * most meaningful part: tests and git beat `cd` and `ls`. Null when nothing is recognised.
 */
export function describeCommand(command: string): string | null {
  const wrapped = /^\s*(?:bash|sh|zsh)\s+(?:-[a-z]+\s+)*(['"])([\s\S]*)\1\s*$/.exec(command);
  if (wrapped && /(^|\s)-[a-z]*c\b/.test(command.slice(0, command.indexOf(wrapped[1])))) return describeCommand(wrapped[2]);
  const masked = maskCommand(command);
  let best: Described | null = null;
  for (const segment of masked.split(/&&|\|\||;|\||\n/)) {
    if (!segment.trim()) continue;
    const found = describeSegment(segment);
    let d = found;
    const out = redirectTarget(segment);
    if (out && (!d || d.score < 58)) d = { score: 58, sentence: clipSentence(`Wrote ${out}`) };
    if (d && (!best || d.score > best.score)) best = d;
  }
  return best ? clipSentence(best.sentence) : null;
}

const FIRST_URL = (input: Record<string, unknown>): string => {
  const urls = input.urls;
  return Array.isArray(urls) && typeof urls[0] === 'string' ? urls[0] : '';
};

function fileStep(verb: string, failedVerb: string, rawPath: string, fallback: string): MappedCall {
  const f = fileName(rawPath);
  return {
    family: 'space',
    step: clipSentence(f ? `${verb} ${f}` : `${verb} ${fallback}`),
    failed: clipSentence(f ? `${failedVerb} ${f}` : `${failedVerb} ${fallback}`),
  };
}

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
      case 'shell': {
        const what = describeCommand(str(input.command));
        return { family: 'space', step: what ?? 'Ran a command', failed: "Couldn't run a command" };
      }
      case 'write_file':
        return fileStep('Wrote', "Couldn't write", str(input.path), 'a file');
      case 'edit_file':
      case 'str_replace':
        return fileStep('Edited', "Couldn't edit", str(input.path), 'a file');
      case 'read_file':
        return fileStep('Read', "Couldn't read", str(input.path), 'a file');
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
      case 'kill_app': {
        const app = prettyApp(str(input.name) || str(input.bundle_id));
        return app
          ? { family: 'desktop', step: clipSentence(`Closed ${app}`), failed: clipSentence(`Couldn't close ${app}`) }
          : { family: 'desktop', step: null, failed: null };
      }
      case 'type_text': {
        // text typed into a terminal and sent with Enter is a command the employee ran on screen
        const typed = str(input.text);
        const what = /[\r\n]\s*$/.test(typeof input.text === 'string' ? input.text : '') ? describeCommand(typed) : null;
        return what ? { family: 'desktop', step: what, failed: "Couldn't run a command" } : { family: 'desktop', step: null, failed: null };
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
