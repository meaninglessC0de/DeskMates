/**
 * The only tools an employee may use on a desktop (employee-runtime.md section 3), and the helpers that turn them
 * into full SDK names. The model, `canUseTool` and `disallowedTools` all use full names: `mcp__<server>__<tool>`.
 */

export const OBSERVE = [
  'list_apps', 'list_windows', 'get_window_state', 'get_desktop_state', 'get_screen_size',
  'get_cursor_position', 'zoom', 'verify_state', 'get_guide',
] as const;

export const ACT = [
  'launch_app', 'bring_to_front', 'set_window_frame', 'invoke_menu', 'click', 'double_click', 'right_click', 'drag',
  'scroll', 'move_cursor', 'type_text', 'press_key', 'hotkey', 'set_value', 'run_steps', 'clipboard_read', 'clipboard_write',
] as const;

export const RISKY = ['kill_app', 'run_script'] as const;

/** Never reachable in v1 (disallowed on the live server) but still risky if they ever appear: the gate asks. */
export const RISKY_EXTRA = ['browser_download', 'browser_set_input_files'] as const;

export const DESKTOP_ALLOW: ReadonlySet<string> = new Set<string>([...OBSERVE, ...ACT, ...RISKY]);
const OBSERVE_SET: ReadonlySet<string> = new Set(OBSERVE);
const ACT_SET: ReadonlySet<string> = new Set(ACT);
const RISKY_SET: ReadonlySet<string> = new Set([...RISKY, ...RISKY_EXTRA]);

/** What the live Space reported on 2026-11-14 (71 tools). Used for `disallowedTools` when the live list is unavailable. */
export const KNOWN_DESKTOP_TOOLS: readonly string[] = [
  'list_apps', 'list_windows', 'get_window_state', 'verify_state', 'launch_app', 'kill_app', 'bring_to_front',
  'set_window_frame', 'invoke_menu', 'click', 'double_click', 'right_click', 'drag', 'mouse_button_down', 'mouse_drag',
  'mouse_button_up', 'parallel_mouse_drag', 'type_text', 'press_key', 'hotkey', 'set_value', 'scroll', 'clipboard_read',
  'clipboard_write', 'get_screen_size', 'get_desktop_state', 'get_cursor_position', 'move_cursor',
  'set_agent_cursor_enabled', 'set_agent_cursor_motion', 'get_agent_cursor_state', 'set_agent_cursor_theme',
  'check_permissions', 'health_report', 'get_config', 'set_config', 'get_accessibility_tree', 'zoom', 'page',
  'get_browser_state', 'browser_prepare', 'browser_navigate', 'browser_click', 'browser_type', 'browser_select',
  'browser_dialog', 'browser_set_input_files', 'browser_download', 'browser_pointer', 'start_recording', 'stop_recording',
  'get_recording_state', 'replay_trajectory', 'install_ffmpeg', 'start_session', 'get_session', 'list_sessions',
  'end_session', 'get_guide', 'run_steps', 'run_script', 'create_space', 'fork_space', 'list_spaces', 'delete_space',
  'stop_space', 'start_space', 'space_bash', 'share_tcp_port', 'list_tcp_shares', 'stop_tcp_share',
];

export function fullName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

export interface SplitName {
  /** Null for built-ins such as TodoWrite. */
  server: string | null;
  tool: string;
}

/** `mcp__desktop__click` -> { server: 'desktop', tool: 'click' }; `TodoWrite` -> { server: null, tool: 'TodoWrite' }. */
export function splitToolName(name: string): SplitName {
  const m = /^mcp__([^_]+)__(.+)$/.exec(name);
  if (!m) return { server: null, tool: name };
  return { server: m[1], tool: m[2] };
}

export type DesktopGroup = 'observe' | 'act' | 'risky' | 'unknown';

export function desktopGroup(tool: string): DesktopGroup {
  if (RISKY_SET.has(tool)) return 'risky';
  if (OBSERVE_SET.has(tool)) return 'observe';
  if (ACT_SET.has(tool)) return 'act';
  return 'unknown';
}

export function isAllowedDesktopTool(tool: string): boolean {
  return DESKTOP_ALLOW.has(tool);
}

/**
 * Every tool the server reports (plus the ones we know exist) that is not in the allow-list, as full names.
 * Removing them from the model's view is the primary defence; the gate also denies anything unknown.
 */
export function buildDisallowed(server: string, reported: readonly string[]): string[] {
  const all = new Set<string>([...KNOWN_DESKTOP_TOOLS, ...reported]);
  return [...all].filter((t) => !DESKTOP_ALLOW.has(t)).sort().map((t) => fullName(server, t));
}

/** Risky shell commands (case-insensitive), each with the words the manager sees on the approval. employee-runtime.md section 6. */
const RISKY_SHELL: [RegExp, string][] = [
  [/\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\b/, 'Delete files'],
  [/\brm\s+(?:-r\s+-f|-f\s+-r)\b/, 'Delete files'],
  [/\brm\s+(?:--recursive\s+--force|--force\s+--recursive)\b/, 'Delete files'],
  [/\bgit\s+push\b/, 'Publish with git push'],
  [/\bnpm\s+publish\b/, 'Publish a package'],
  [/\bdeploy/, 'Deploy'],
  [/\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/, 'Run a script from the internet'],
  [/\bmkfs/, 'Erase a disk'],
  [/\bdd\s+if=/, 'Overwrite a disk'],
  [/\bshutdown\b/, 'Shut down the desktop'],
  [/\breboot\b/, 'Restart the desktop'],
  [/\bdrop\s+table\b/, 'Delete data'],
  [/\btruncate\s+table\b/, 'Delete data'],
  [/\bchmod\s+-r\s+777\b/, 'Open files to everyone'],
  [/\bsudo\b/, 'Run a command as administrator'],
];

export function isRiskyShell(command: string): boolean {
  const c = command.toLowerCase();
  return RISKY_SHELL.some(([re]) => re.test(c));
}

/** Every RISKY_SHELL pattern the command matches (not just the first), for deciding whether an approval covers all of it. */
export function riskyShellPatterns(command: string): RegExp[] {
  const c = command.toLowerCase();
  return RISKY_SHELL.filter(([re]) => re.test(c)).map(([re]) => re);
}

/**
 * What the big step in a risky command is, in the manager's words, and the part of the command that does it
 * (a long chain shows the step that matters, not whatever happens to come first). Null when nothing is risky.
 */
export function riskyShellStep(command: string): { title: string; part: string } | null {
  const parts = command.split(/&&|\|\||;|\n/).map((p) => p.trim()).filter(Boolean);
  for (const [re, title] of RISKY_SHELL) {
    const part = parts.find((p) => re.test(p.toLowerCase()));
    if (part) return { title, part };
  }
  for (const [re, title] of RISKY_SHELL) if (re.test(command.toLowerCase())) return { title, part: command.trim() };
  return null;
}
