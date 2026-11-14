import type { Env } from '../../shared/index.ts';
import type { HostDriver, Spaces } from './types.ts';
import { createMockSpaces } from './mock/mockSpaces.ts';
import { MockHost } from './mock/mockHost.ts';

export interface SpacesFactoryOptions {
  /** Absolute DATA_DIR. */
  dataDir: string;
  env: Env;
}

/** Chooses the implementation from `DESKTOPS`. The real one is imported only when needed. */
export async function createSpaces(opts: SpacesFactoryOptions): Promise<Spaces> {
  if (opts.env.DESKTOPS === 'mock') return createMockSpaces({ dataDir: opts.dataDir });
  const mod = await import('./cuaSpaces.ts');
  return mod.createCuaSpaces({ dataDir: opts.dataDir, env: opts.env });
}

export async function createHostDriver(opts: SpacesFactoryOptions): Promise<HostDriver> {
  if (opts.env.DESKTOPS === 'mock') return new MockHost();
  const mod = await import('./hostDriver.ts');
  return mod.createHostDriver({ env: opts.env });
}

export type { Spaces, HostDriver } from './types.ts';
