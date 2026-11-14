import type { Env } from '../../shared/index.ts';
import type { HostDriver } from './types.ts';

/** W1 replaces this file with the cua-driver status check and stdio config. */
export function createHostDriver(_opts: { env: Env }): HostDriver {
  throw new Error('The host driver is not built yet (src/office/spaces/hostDriver.ts). Run with DESKTOPS=mock.');
}
