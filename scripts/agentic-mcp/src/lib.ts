// Library entry: importing the package must not start a server or require
// OPENAI_API_KEY. The `agentic-mcp` binary (src/index.ts) is the CLI.
export { OpenAIAgentMCPServer } from './mcp/server';
export { toToolDefinitions } from './mcp/tool-definitions';
export type { ToolDefinition } from './mcp/tool-definitions';
export type { MCPServerConfig, MCPTool, Context } from './types';
