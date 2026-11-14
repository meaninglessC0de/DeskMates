import type { Env } from '../../shared/index.ts';
import type { RuntimeFactory } from './types.ts';
import { createMockRuntime } from './mockRuntime.ts';

/** `MOCK_LLM=1` gives the scripted runtime; anything else imports the Claude Agent SDK runtime (W2). */
export async function createRuntimeFactory(env: Env): Promise<RuntimeFactory> {
  if (env.MOCK_LLM) return createMockRuntime;
  const mod = await import('./claudeRuntime.ts');
  return mod.createClaudeRuntime;
}

export type { RuntimeFactory, EmployeeRuntime, RuntimeHost, RuntimeDeps, InboxItem, TurnResult, ApprovalOutcome, ToolFamily } from './types.ts';
