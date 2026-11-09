import { MCPTool } from '../types';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: 'object'; [key: string]: unknown };
}

/**
 * Plain tools/list entries. Tool instances carry live clients (OpenAI,
 * Supabase) that cannot be serialized, so only the MCP fields are copied.
 */
export function toToolDefinitions(tools: MCPTool[]): ToolDefinition[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as ToolDefinition['inputSchema']
  }));
}
