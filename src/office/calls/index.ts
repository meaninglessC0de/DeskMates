import type { Env } from '../../shared/index.ts';
import type { Calls, CallsHost } from './types.ts';
import { createMockCalls } from './mockCalls.ts';

/** LiveKit keys present: the real implementation (W7). Otherwise, in mock mode, scripted calls; otherwise no calls. */
export async function createCalls(env: Env, host: CallsHost): Promise<Calls> {
  const hasLiveKit = !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  if (hasLiveKit && !env.MOCK_LLM) {
    const mod = await import('./realCalls.ts');
    return mod.createRealCalls(env, host);
  }
  return createMockCalls(env, host, { enabled: env.MOCK_LLM });
}

export type { Calls, CallsHost, CallsMode, CallSituation } from './types.ts';
export { CallError } from './types.ts';
