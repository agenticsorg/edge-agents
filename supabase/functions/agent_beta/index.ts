/**
 * Agent Beta — Database Agent
 *
 * Specialized agent for Supabase database operations.
 * Uses parameterized queries (no raw SQL) for security.
 * Supports HTTP requests and Supabase channel communication.
 *
 * Upgraded from calculator-only to a database specialist with
 * safe query tools ported from the MCP server database handler.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  AgentMessage,
  createAgentMessage,
  isValidAgentMessage,
} from "../_shared/protocol.ts";
import { createChannel, sendMessage } from "../_shared/channel.ts";
import { ToolRegistry, Tool, ToolContext, createToolContext, trackAction, remember } from "../_shared/tools.ts";
import { createHandoffTool } from "../_shared/handoff.ts";
import { Logger } from "../_shared/logger.ts";
import { ModelProvider } from "../gateway/model-provider.ts";

// Environment variables
const AGENT_NAME = Deno.env.get("AGENT_NAME") || "agent_beta";
const SUPABASE_URL = Deno.env.get("SB_URL") || "";
const SUPABASE_KEY = Deno.env.get("SB_SERVICE_KEY") || "";
const LOGS_CHANNEL = "agent-manager-logs";

const logger = new Logger(AGENT_NAME);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const modelProvider = new ModelProvider(logger);

// ─── Database Tools ──────────────────────────────────────────────────────────

function validateIdentifier(name: string, label: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

const queryDatabaseTool: Tool = {
  name: "QueryDatabase",
  description: "Query a Supabase database table with structured filters. Returns matching rows.",
  inputSchema: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Table name to query' },
      select: { type: 'string', description: 'Comma-separated column names (default: all)' },
      filter: { type: 'object', description: 'Filter conditions as key-value pairs' },
      limit: { type: 'number', description: 'Max rows to return (default: 100, max: 1000)' },
    },
    required: ['table'],
  },
  execute: async (params, ctx) => {
    trackAction(ctx, 'db_query_started');
    const table = params.table as string;
    validateIdentifier(table, 'table name');

    const columns = (params.select as string) || '*';
    let queryBuilder = supabase.from(table).select(columns);

    const filter = params.filter as Record<string, unknown> | undefined;
    if (filter) {
      for (const [col, val] of Object.entries(filter)) {
        validateIdentifier(col, 'column name');
        queryBuilder = queryBuilder.eq(col, val);
      }
    }

    const safeLimit = Math.min(Math.max(1, Number(params.limit) || 100), 1000);
    const { data, error } = await queryBuilder.limit(safeLimit);

    if (error) throw new Error(`Query failed: ${error.message}`);

    trackAction(ctx, 'db_query_completed');
    remember(ctx, `query_${Date.now()}`, { table, row_count: data?.length || 0 });

    return {
      data,
      metadata: { table, row_count: data?.length || 0, limit: safeLimit },
    };
  },
};

const insertDataTool: Tool = {
  name: "InsertData",
  description: "Insert a row into a Supabase database table.",
  inputSchema: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Table name' },
      data: { type: 'object', description: 'Data to insert as key-value pairs' },
    },
    required: ['table', 'data'],
  },
  execute: async (params, ctx) => {
    trackAction(ctx, 'db_insert_started');
    const table = params.table as string;
    validateIdentifier(table, 'table name');

    const { data: result, error } = await supabase
      .from(table)
      .insert(params.data as Record<string, unknown>)
      .select();

    if (error) throw new Error(`Insert failed: ${error.message}`);

    trackAction(ctx, 'db_insert_completed');
    return { inserted: result, count: result?.length || 0 };
  },
};

const calculatorTool: Tool = {
  name: "Calculator",
  description: "Performs arithmetic calculations for data analysis.",
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Arithmetic expression' },
    },
    required: ['expression'],
  },
  execute: async (params, _ctx) => {
    const input = params.expression as string;
    if (!/^[0-9.+\-*\/()\\s]+$/.test(input)) {
      return "Invalid expression";
    }
    try {
      return String(Function("return (" + input + ")")());
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};

// ─── Setup Tool Registry ─────────────────────────────────────────────────────

const registry = new ToolRegistry();
registry.register(queryDatabaseTool);
registry.register(insertDataTool);
registry.register(calculatorTool);

const handoffTool = createHandoffTool(supabase, AGENT_NAME, {
  agent_alpha: "agent_alpha",
});
registry.register(handoffTool);

// ─── ReAct Agent Loop ────────────────────────────────────────────────────────

const systemPrompt = `
You are a database specialist assistant named ${AGENT_NAME} with access to the following tools:
${registry.getToolDescriptions()}

When answering the user, you may use the tools to query data or perform database operations.
Follow this format strictly:
Thought: <your reasoning here>
Action: <ToolName>[<JSON parameters>]
Observation: <result of the tool action>
... (you can repeat Thought/Action/Observation as needed) ...
Thought: <final reasoning>
Answer: <your final answer to the user's query>

For tool actions, use JSON parameters like: QueryDatabase[{"table": "users", "filter": {"status": "active"}}]
Only provide one action at a time, and wait for the observation before continuing.
`;

async function runReActAgent(query: string, ctx: ToolContext): Promise<string> {
  logger.info("Running ReAct agent", { query: query.substring(0, 100) });

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  for (let step = 0; step < 10; step++) {
    const result = await modelProvider.complete({
      messages: messages as any,
      model: "balanced",
      temperature: 0,
      max_tokens: 1500,
      stop: ["Observation:"],
    });

    const assistantReply = result.content;
    messages.push({ role: "assistant", content: assistantReply });

    const answerMatch = assistantReply.match(/Answer:\s*(.*)$/s);
    if (answerMatch) {
      return answerMatch[1].trim();
    }

    const actionMatch =
      assistantReply.match(/Action:\s*(\w+)\[(\{[\s\S]*?\})\]/) ||
      assistantReply.match(/Action:\s*([^\[]+)\[([^\]]+)\]/);

    if (actionMatch) {
      const toolName = actionMatch[1].trim();
      const toolInput = actionMatch[2].trim();

      let observation: string;
      try {
        let params: Record<string, unknown>;
        try {
          params = JSON.parse(toolInput);
        } catch {
          const tool = registry.get(toolName);
          if (tool) {
            const firstRequired = tool.inputSchema.required?.[0] || 'input';
            params = { [firstRequired]: toolInput };
          } else {
            params = { input: toolInput };
          }
        }

        const result = await registry.execute(toolName, params, ctx);
        observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (err) {
        observation = `Error: ${(err as Error).message}`;
      }

      messages.push({ role: "system", content: `Observation: ${observation}` });
      continue;
    }

    return assistantReply.trim();
  }

  return "Unable to reach a conclusion within the step limit.";
}

// ─── Message Processing ──────────────────────────────────────────────────────

async function processMessage(message: AgentMessage): Promise<AgentMessage> {
  const ctx = createToolContext(message.workflowId);

  try {
    const answer = await Promise.race([
      runReActAgent(message.payload.content, ctx),
      new Promise<string>(resolve =>
        setTimeout(() => resolve("Task timed out. Please try a simpler query."), 25000)
      ),
    ]);

    return createAgentMessage(
      'response',
      AGENT_NAME,
      message.sender,
      answer,
      {
        correlationId: message.correlationId,
        workflowId: message.workflowId,
        tools_used: ctx.actions.filter(a => a.startsWith('tool:')).map(a => a.replace('tool:', '')),
      }
    );
  } catch (error) {
    return createAgentMessage(
      'error',
      AGENT_NAME,
      message.sender,
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      { correlationId: message.correlationId, workflowId: message.workflowId }
    );
  }
}

// ─── HTTP Handler (agent_beta uses HTTP, not persistent channel) ─────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        agent: AGENT_NAME,
        status: "running",
        tools: registry.listNames(),
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();

    // Normalize to AgentMessage
    let agentMsg: AgentMessage;
    if (isValidAgentMessage(body)) {
      agentMsg = body;
    } else {
      agentMsg = createAgentMessage(
        'request',
        body.sender || 'unknown',
        AGENT_NAME,
        body.content || body.message || '',
        { correlationId: body.correlationId || body.id || body.messageId }
      );
    }

    if (agentMsg.sender === AGENT_NAME) {
      return new Response(JSON.stringify({ status: "skipped", reason: "self-message" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info("Received HTTP message", { from: agentMsg.sender });
    const response = await processMessage(agentMsg);

    // Send response to Supabase channels
    await sendMessage(supabase, agentMsg.sender, response);
    const responseChannel = `${agentMsg.sender}-response-${agentMsg.correlationId}`;
    await sendMessage(supabase, responseChannel, response);

    // Log
    try {
      const logsChannel = await createChannel(supabase, LOGS_CHANNEL);
      await logsChannel.send({
        type: 'broadcast',
        event: 'message',
        payload: response,
      });
    } catch {
      // Non-critical
    }

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    logger.error("Error processing request", { error: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
