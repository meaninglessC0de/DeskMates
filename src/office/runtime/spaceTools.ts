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
          const r = await spaces.exec(employeeId, String(a.command), { timeoutMs });
          const parts: string[] = [];
          if (r.stdout) parts.push(r.stdout.replace(/\n$/, ''));
          if (r.stderr) parts.push(`[stderr]\n${r.stderr.replace(/\n$/, '')}`);
          if (r.timedOut) parts.push(`[timed out after ${Math.round(timeoutMs / 1000)} s]`);
          else if (r.exitCode !== 0) parts.push(`[exit ${r.exitCode}]`);
          const text = parts.join('\n') || '(no output)';
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
