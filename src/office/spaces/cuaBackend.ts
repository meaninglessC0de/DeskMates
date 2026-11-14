import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  Image,
  ImageFormat,
  NetworkSettings,
  ScreenshotOptions,
  SpaceCreateOptions,
  embedded,
  mcpHeaders,
} from '@trycua/cua';
import type { McpEndpoint } from './types.ts';
import { flattenHeaders, spaceIdFor } from './cuaPure.ts';

/**
 * The narrow slice of the Cua SDK that `cuaSpaces.ts` needs, in plain types (no bigint, no Map).
 * The real one is `createSdkBackend()`; unit tests use a fake.
 */
export interface BackendEntry {
  id: string;
  name: string;
  powerState: string;
}

export interface BackendExec {
  stdout: string;
  stderr: string;
  exitCode?: number;
  timedOut: boolean;
}

export interface BackendStreamOptions {
  maxFps: number;
  maxDimension: number;
  policy: 'view_only' | 'allow_activation';
  ticketTtlMs: number;
}

export interface BackendStreamTicket {
  wsUrl: string;
  ticket: string;
  mediaSessionId: string;
  ticketExpiresAt?: string;
}

export interface BackendHandle {
  bash(command: string, timeoutMs: number): Promise<BackendExec>;
  write(guestPath: string, data: Uint8Array): Promise<void>;
  /** The file's bytes. */
  download(guestPath: string): Promise<Buffer>;
  home(): Promise<string>;
  /** A real JPEG from the desktop (the SDK encodes it). */
  screenshotJpeg(opts: { quality: number; maxDimension?: number }): Promise<Buffer>;
  /** The SDK's own 320 px JPEG thumbnail. */
  thumbnailJpeg(): Promise<Buffer>;
  openStream(opts: BackendStreamOptions): Promise<BackendStreamTicket>;
}

export interface CreateRequest {
  name: string;
  employeeId: string;
  internet: boolean;
  onProgress(phase: string, detail: string): void;
}

export interface CuaBackend {
  list(): Promise<BackendEntry[]>;
  create(req: CreateRequest): Promise<void>;
  start(id: string): Promise<void>;
  suspend(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  setNetwork(id: string, internet: boolean): Promise<{ applied: string }>;
  handle(id: string): Promise<BackendHandle>;
  mcpEndpoint(id: string): Promise<McpEndpoint>;
}

const CPUS = 2;
const MEMORY_MB = 3072n;

export function createSdkBackend(): CuaBackend {
  process.env.CUA_TELEMETRY ??= '0';
  process.env.DO_NOT_TRACK ??= '1';
  const cua = embedded();
  const spaces = cua.spaces();
  const preset = (internet: boolean) => NetworkSettings.create({ preset: internet ? 'internet' : 'none' });

  return {
    async list() {
      return (await spaces.list()).map((s) => ({ id: s.id, name: s.name, powerState: s.powerState }));
    },

    async create(req) {
      const options = SpaceCreateOptions.create({
        name: req.name,
        image: Image.linux(),
        cpus: CPUS,
        memoryMb: MEMORY_MB,
        labels: new Map([['employee', req.employeeId]]),
        networkSettings: preset(req.internet),
      });
      await spaces.createWithProgress(options, {
        onProgress: (p) => req.onProgress(p.phase, p.detail),
      });
    },

    async start(id) {
      await spaces.start(id);
    },

    async suspend(id) {
      await spaces.suspend(id);
    },

    async delete(id) {
      await spaces.delete_(id);
    },

    async setNetwork(id, internet) {
      const r = await spaces.setNetwork(id, preset(internet), false, false);
      return { applied: r.applied };
    },

    async handle(id) {
      const sp = await spaces.space(id);
      return {
        async bash(command, timeoutMs) {
          const r = await sp.bash(command, BigInt(timeoutMs));
          return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, timedOut: r.timedOut };
        },
        async write(guestPath, data) {
          const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
          await sp.write(guestPath, ab);
        },
        async download(guestPath) {
          const dir = await mkdtemp(path.join(tmpdir(), 'cua-dl-'));
          try {
            const r = await sp.download(guestPath, dir);
            return await readFile(path.isAbsolute(r.dest) ? r.dest : path.join(dir, path.basename(r.dest)));
          } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
        async home() {
          return sp.home();
        },
        async screenshotJpeg({ quality, maxDimension }) {
          const s = await sp.screenshot(
            ScreenshotOptions.create({ format: ImageFormat.Jpeg, quality, maxDimension, includeCursor: false }),
          );
          return Buffer.from(s.image);
        },
        async thumbnailJpeg() {
          const t = await sp.thumbnail(undefined);
          return Buffer.from(t.image);
        },
        async openStream(o) {
          const t = await sp.openStream({
            codecs: [],
            maxFps: o.maxFps,
            maxDimension: o.maxDimension,
            audio: false,
            policy: o.policy,
            ticketTtlMs: BigInt(o.ticketTtlMs),
          });
          return { wsUrl: t.wsUrl, ticket: t.ticket, mediaSessionId: t.mediaSessionId, ticketExpiresAt: t.ticketExpiresAt };
        },
      };
    },

    async mcpEndpoint(id) {
      // The MCP config lives on the sandbox handle, not the Space handle.
      const sb = await cua.sandboxes().connect(id.startsWith('local:') ? id : spaceIdFor(id));
      const cfg = await sb.mcpConfig('env', '/mcp');
      return { url: cfg.url, headers: flattenHeaders(mcpHeaders(cfg)) };
    },
  };
}
