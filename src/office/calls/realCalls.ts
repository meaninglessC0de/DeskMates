import type { Env } from '../../shared/index.ts';
import type { Calls, CallsHost } from './types.ts';

/** W7 replaces this file with the LiveKit implementation. */
export function createRealCalls(_env: Env, _host: CallsHost): Calls {
  throw new Error('LiveKit calls are not built yet (src/office/calls/realCalls.ts).');
}
