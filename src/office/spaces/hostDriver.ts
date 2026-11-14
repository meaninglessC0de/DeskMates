import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Env } from '../../shared/index.ts';
import type { HostDriver, HostStatus, StdioMcpConfig } from './types.ts';

const BINARY = 'cua-driver';

/** Where `cua-driver` lives when installed by its app or a script. Nothing here installs anything. */
function candidates(): string[] {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const named = dirs.map((d) => path.join(d, BINARY));
  return [
    ...named,
    `/Applications/CuaDriver.app/Contents/MacOS/${BINARY}`,
    `/Applications/Cua Driver.app/Contents/MacOS/${BINARY}`,
    path.join(os.homedir(), `Applications/CuaDriver.app/Contents/MacOS/${BINARY}`),
    `/usr/local/bin/${BINARY}`,
    `/opt/homebrew/bin/${BINARY}`,
    path.join(os.homedir(), `.local/bin/${BINARY}`),
  ];
}

export function findDriverBinary(): string | null {
  for (const p of candidates()) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // keep looking
    }
  }
  return null;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, env: { ...process.env, CUA_TELEMETRY: '0', DO_NOT_TRACK: '1' } }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Finds a boolean-ish value under any key matching `re` in parsed JSON (shape of `permissions status --json` is not documented). */
function findFlag(value: unknown, re: RegExp): boolean | null {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (re.test(k)) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return /^(granted|allowed|true|yes|ok)$/i.test(v);
        if (v && typeof v === 'object') {
          const inner = findFlag(v, /granted|allowed|status/i);
          if (inner !== null) return inner;
        }
      }
      const deep = findFlag(v, re);
      if (deep !== null) return deep;
    }
  }
  return null;
}

export function createHostDriver(_opts: { env: Env }): HostDriver {
  return {
    async status(): Promise<HostStatus> {
      const bin = findDriverBinary();
      if (!bin) return { installed: false, permitted: false, detail: 'cua-driver is not installed on this Mac.' };
      const r = await run(bin, ['permissions', 'status', '--json'], 4_000);
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.stdout);
      } catch {
        return { installed: true, permitted: false, detail: 'Could not read the permission status.' };
      }
      const accessibility = findFlag(parsed, /accessib/i);
      const screen = findFlag(parsed, /screen/i);
      const permitted = accessibility === true && screen === true;
      return {
        installed: true,
        permitted,
        detail: permitted ? 'Ready.' : 'Allow Accessibility and Screen Recording for cua-driver in System Settings.',
      };
    },

    async mcpConfig(): Promise<StdioMcpConfig> {
      return { command: findDriverBinary() ?? BINARY, args: ['mcp'], env: { CUA_TELEMETRY: '0', DO_NOT_TRACK: '1' } };
    },
  };
}
