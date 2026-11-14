import type { HostDriver, HostStatus, StdioMcpConfig } from '../types.ts';

/** The pretend Mac: always installed and permitted; its one "tool" returns a fixed sentence. */
export class MockHost implements HostDriver {
  async status(): Promise<HostStatus> {
    return { installed: true, permitted: true, detail: 'Mock host' };
  }

  async mcpConfig(): Promise<StdioMcpConfig> {
    return { command: 'echo', args: ['mock host has no real MCP server'] };
  }

  async mockCall(_tool: string): Promise<string> {
    return 'The front window is a notes app with three lines of text and a to-do list.';
  }
}
