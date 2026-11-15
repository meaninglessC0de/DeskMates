import { z } from 'zod';
import type { Spaces } from '../spaces/types.ts';
import { makeSdkServer, textResult, type ToolSpec } from './sdkServers.ts';

export const OUTPUT_CAP = 20_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

export function cap(text: string): string {
  if (text.length <= OUTPUT_CAP) return text;
  return `${text.slice(0, OUTPUT_CAP)}\n[truncated: ${text.length - OUTPUT_CAP} more characters]`;
}

/**
 * ON_SCREEN=1 (the live demo): every command the employee runs is also written to ~/.worklog on her own desktop, where a
 * small always-on-top terminal tails it (see cuaSpaces.ts). The work is the same; it just happens where people can see it.
 */
const ON_SCREEN = process.env.ON_SCREEN === '1';
function workLog(spaces: Spaces, employeeId: string, text: string): void {
  if (!ON_SCREEN || !text.trim()) return;
  const b64 = Buffer.from(text.endsWith('\n') ? text : `${text}\n`).toString('base64');
  void spaces.exec(employeeId, `echo ${b64} | base64 -d >> "$HOME/.worklog"`, { timeoutMs: 5000 }).catch(() => undefined);
}
function commandLine(command: string): string {
  const lines = command.split('\n');
  const first = lines[0].length > 150 ? `${lines[0].slice(0, 150)}…` : lines[0];
  return lines.length > 1 ? `$ ${first}  (+${lines.length - 1} lines)` : `$ ${first}`;
}
function outputHead(text: string): string {
  const lines = text.split('\n');
  const head = lines.slice(0, 12).map((l) => (l.length > 110 ? `${l.slice(0, 110)}…` : l));
  if (lines.length > 12) head.push(`… ${lines.length - 12} more lines`);
  return head.join('\n');
}

/** `shell`, `read_file` and `write_file`, executed in this employee's own Space through the `Spaces` seam. */
export function spaceToolSpecs(spaces: Spaces, employeeId: string): ToolSpec[] {
  return [
    {
      name: 'shell',
      description:
        "Run a shell command on your own computer and get its output. Use it instead of the screen whenever a command will do. Keep files under ~/work.",
      shape: {
        command: z.string(),
        timeout_ms: z.number().int().positive().optional().describe('Default 120000, at most 600000.'),
      },
      handler: async (a) => {
        const timeoutMs = Math.min(Math.max(Number(a.timeout_ms) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
        try {
          workLog(spaces, employeeId, commandLine(String(a.command)));
          const r = await spaces.exec(employeeId, String(a.command), { timeoutMs });
          const parts: string[] = [];
          if (r.stdout) parts.push(r.stdout.replace(/\n$/, ''));
          if (r.stderr) parts.push(`[stderr]\n${r.stderr.replace(/\n$/, '')}`);
          if (r.timedOut) parts.push(`[timed out after ${Math.round(timeoutMs / 1000)} s]`);
          else if (r.exitCode !== 0) parts.push(`[exit ${r.exitCode}]`);
          const text = parts.join('\n') || '(no output)';
          workLog(spaces, employeeId, outputHead(text));
          // a non-zero exit is normal (grep, test): it is shown in the text, not flagged as a tool error
          return textResult(cap(text), r.timedOut);
        } catch (err) {
          return textResult(`The command could not run: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'read_file',
      description: 'Read a text file on your own computer. `~` is your home folder.',
      shape: { path: z.string() },
      handler: async (a) => {
        try {
          return textResult(cap(await spaces.readFile(employeeId, String(a.path))));
        } catch (err) {
          return textResult(`Could not read the file: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'write_file',
      description: 'Write a text file on your own computer, replacing it if it exists. `~` is your home folder.',
      shape: { path: z.string(), content: z.string() },
      handler: async (a) => {
        try {
          await spaces.writeFile(employeeId, String(a.path), String(a.content));
          return textResult(`Saved ${String(a.path)}`);
        } catch (err) {
          return textResult(`Could not save the file: ${(err as Error).message}`, true);
        }
      },
    },
  ];
}

export function createSpaceServer(spaces: Spaces, employeeId: string) {
  return makeSdkServer('space', spaceToolSpecs(spaces, employeeId));
}
