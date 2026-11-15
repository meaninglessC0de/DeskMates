import type { Env } from '../../shared/index.ts';
import type { Calls, CallsHost } from './types.ts';
import { createMockCalls } from './mockCalls.ts';

/**
 * LiveKit keys present and not mock mode: the real implementation (W7). In mock mode, scripted calls, unless CALLS_REAL=1
 * (a dev switch: real calls and call mind with the scripted employees). Otherwise no calls.
 */
export async function createCalls(env: Env, host: CallsHost): Promise<Calls> {
  const hasLiveKit = !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  if (hasLiveKit && (!env.MOCK_LLM || process.env.CALLS_REAL === '1')) {
    const mod = await import('./realCalls.ts');
    return mod.createRealCalls(env, host);
  }
  return createMockCalls(env, host, { enabled: env.MOCK_LLM });
}

export type { Calls, CallsHost, CallsMode, CallSituation } from './types.ts';
export { CallError } from './types.ts';
