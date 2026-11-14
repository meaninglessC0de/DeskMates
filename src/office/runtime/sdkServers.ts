import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

/** One in-process tool: plain data, so tests can call the handler without an MCP round trip. */
export interface ToolSpec {
  name: string;
  description: string;
  shape: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

const registry = new WeakMap<object, ToolSpec[]>();

/** In-process MCP server with every tool loaded up front (`alwaysLoad`), remembered so `fakeQuery` can run its tools. */
export function makeSdkServer(name: string, specs: ToolSpec[]): McpSdkServerConfigWithInstance {
  const server = createSdkMcpServer({
    name,
    version: '1.0.0',
    alwaysLoad: true,
    tools: specs.map(
      (s) =>
        tool(s.name, s.description, s.shape as never, (async (args: unknown) => s.handler(args as Record<string, unknown>)) as never, {
          alwaysLoad: true,
        }) as unknown as SdkMcpToolDefinition<any>,
    ),
  });
  registry.set(server, specs);
  return server;
}

export function toolsOfServer(server: unknown): ToolSpec[] | undefined {
  return typeof server === 'object' && server !== null ? registry.get(server) : undefined;
}

/** Every in-process handler returns an MCP result, never a bare string. */
export function textResult(text: string, isError = false): CallToolResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}
