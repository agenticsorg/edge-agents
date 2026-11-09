import { toToolDefinitions } from '../mcp/tool-definitions';
import { ResearchTool } from '../mcp/tools/research';
import { SummarizeTool } from '../mcp/tools/summarize';

// tools/list used to return the tool instances themselves. They hold an
// OpenAI client with a circular reference, so the MCP SDK failed with
// "Converting circular structure to JSON" and no client could list tools.
describe('tools/list payload', () => {
  const tools = [new ResearchTool('sk-test'), new SummarizeTool('sk-test')];

  it('serializes to JSON', () => {
    expect(() => JSON.stringify({ tools: toToolDefinitions(tools) })).not.toThrow();
  });

  it('keeps only name, description and inputSchema', () => {
    const defs = toToolDefinitions(tools);
    expect(defs.map(d => d.name)).toEqual(['research', 'summarize']);
    for (const d of defs) {
      expect(Object.keys(d).sort()).toEqual(['description', 'inputSchema', 'name']);
      expect(d.inputSchema.type).toBe('object');
    }
  });
});

describe('library entry', () => {
  it('exports the server class without starting it', () => {
    const before = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lib = require('../lib');
    expect(typeof lib.OpenAIAgentMCPServer).toBe('function');
    expect(typeof lib.toToolDefinitions).toBe('function');
    if (before !== undefined) process.env.OPENAI_API_KEY = before;
  });
});
