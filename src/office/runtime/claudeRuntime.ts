import type { EmployeeRuntime, RuntimeDeps } from './types.ts';

/** W2 replaces this file with the Claude Agent SDK runtime. */
export function createClaudeRuntime(_deps: RuntimeDeps): EmployeeRuntime {
  throw new Error('The Claude runtime is not built yet (src/office/runtime/claudeRuntime.ts). Run with MOCK_LLM=1.');
}
