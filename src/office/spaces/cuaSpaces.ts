import type { Env } from '../../shared/index.ts';
import type { Spaces } from './types.ts';

/** W1 replaces this file with the Cua implementation. */
export function createCuaSpaces(_opts: { dataDir: string; env: Env }): Spaces {
  throw new Error('Cua desktops are not built yet (src/office/spaces/cuaSpaces.ts). Run with DESKTOPS=mock.');
}
