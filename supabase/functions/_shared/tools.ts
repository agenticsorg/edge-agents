/**
 * Shared Tool Registry for Edge Functions
 *
 * Deno-compatible tool registry ported from scripts/agentic-mcp/src/mcp/tools/registry.ts
 * with context management from scripts/agentic-mcp/src/mcp/context.ts
 */

// ─── Context (ported from agentic-mcp MCPContext) ────────────────────────────

export interface ToolContext {
  workflow_id?: string;
  memory: Record<string, unknown>;
  actions: string[];
  resources: Record<string, unknown>;
}

export function createToolContext(workflowId?: string): ToolContext {
  return {
    workflow_id: workflowId,
    memory: {},
    actions: [],
    resources: {},
  };
}

export function trackAction(ctx: ToolContext, action: string): void {
  ctx.actions.push(action);
}

export function remember(ctx: ToolContext, key: string, value: unknown): void {
  ctx.memory[key] = value;
}

export function recall(ctx: ToolContext, key: string): unknown {
  return ctx.memory[key];
}

// ─── Tool Interface ──────────────────────────────────────────────────────────

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
    default?: unknown;
  }>;
  required?: string[];
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.validateTool(tool);
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}. Available: ${this.listNames().join(', ')}`);
    }

    this.validateParams(tool, params);
    trackAction(ctx, `tool:${name}`);

    return tool.execute(params, ctx);
  }

  /**
   * Get tool descriptions formatted for LLM system prompts
   */
  getToolDescriptions(): string {
    return this.list()
      .map(t => {
        const params = Object.entries(t.inputSchema.properties)
          .map(([k, v]) => `  - ${k} (${v.type}): ${v.description || ''}`)
          .join('\n');
        return `${t.name}: ${t.description}\n  Parameters:\n${params}`;
      })
      .join('\n\n');
  }

  private validateTool(tool: Tool): void {
    if (!tool.name) throw new Error('Tool must have a name');
    if (!tool.description) throw new Error('Tool must have a description');
    if (!tool.inputSchema) throw new Error('Tool must have an inputSchema');
    if (typeof tool.execute !== 'function') throw new Error('Tool must have an execute function');
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
  }

  private validateParams(tool: Tool, params: Record<string, unknown>): void {
    const schema = tool.inputSchema;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in params)) {
          throw new Error(`Missing required parameter '${field}' for tool '${tool.name}'`);
        }
      }
    }

    // Type check provided fields
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue; // allow extra fields

      const actual = Array.isArray(value) ? 'array' : typeof value;
      if (propSchema.type === 'array' && !Array.isArray(value)) {
        throw new Error(`Parameter '${key}' must be an array`);
      } else if (propSchema.type !== 'array' && propSchema.type !== 'object' && actual !== propSchema.type) {
        throw new Error(`Parameter '${key}' must be ${propSchema.type}, got ${actual}`);
      }
    }
  }
}
