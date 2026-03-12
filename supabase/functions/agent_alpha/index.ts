/**
 * Agent Alpha — Research Agent
 *
 * Specialized agent for research, web search, and summarization.
 * Uses the shared protocol, channel helpers, and tool registry.
 * Routes LLM calls through the ModelProvider for cost optimization.
 *
 * Upgraded from calculator-only to a full research agent with tools
 * ported from scripts/agentic-mcp/.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
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
const AGENT_NAME = Deno.env.get("AGENT_NAME") || "agent_alpha";
const SUPABASE_URL = Deno.env.get("SB_URL") || "";
const SUPABASE_KEY = Deno.env.get("SB_SERVICE_KEY") || "";
const LOGS_CHANNEL = "agent-manager-logs";

const logger = new Logger(AGENT_NAME);

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const modelProvider = new ModelProvider(logger);

// ─── Define Research Tools ───────────────────────────────────────────────────

const webSearchTool: Tool = {
  name: "WebSearch",
  description: "Search the web for the latest information on any topic. Use for current events, facts, and recent data.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      depth: { type: 'string', description: 'Search depth: brief, detailed, or comprehensive' },
    },
    required: ['query'],
  },
  execute: async (params, ctx) => {
    trackAction(ctx, 'websearch_started');
    const query = params.query as string;
    const depth = (params.depth as string) || 'detailed';

    const result = await modelProvider.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a research assistant. Provide factual, well-sourced information. Include relevant data points and cite sources when possible.',
        },
        {
          role: 'user',
          content: `Research the following topic (${depth} depth): ${query}`,
        },
      ],
      model: depth === 'comprehensive' ? 'powerful' : 'balanced',
      max_tokens: depth === 'comprehensive' ? 2000 : 1000,
    });

    trackAction(ctx, 'websearch_completed');
    remember(ctx, `search_${Date.now()}`, { query, depth });
    return result.content;
  },
};

const summarizeTool: Tool = {
  name: "Summarize",
  description: "Create a concise summary of text content with key points and insights.",
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The text content to summarize' },
      format: { type: 'string', description: 'Format: bullet_points, narrative, or outline' },
    },
    required: ['content'],
  },
  execute: async (params, ctx) => {
    trackAction(ctx, 'summarize_started');
    const content = params.content as string;
    const format = (params.format as string) || 'bullet_points';

    const result = await modelProvider.complete({
      messages: [
        {
          role: 'system',
          content: `You are an expert summarizer. Create a ${format} summary. Focus on key points, important details, and significant conclusions.`,
        },
        { role: 'user', content: `Summarize the following:\n\n${content}` },
      ],
      model: 'fast',
      max_tokens: 800,
    });

    trackAction(ctx, 'summarize_completed');
    return result.content;
  },
};

const calculatorTool: Tool = {
  name: "Calculator",
  description: "Performs arithmetic calculations. Only supports numbers and basic math operators.",
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The arithmetic expression (e.g., "2 + 3 * 4")' },
    },
    required: ['expression'],
  },
  execute: async (params, _ctx) => {
    const input = params.expression as string;
    if (!/^[0-9.+\-*\/()\\s]+$/.test(input)) {
      return "Invalid expression: only numbers and basic math operators allowed";
    }
    try {
      const result = Function("return (" + input + ")")();
      return String(result);
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};

// ─── Setup Tool Registry ─────────────────────────────────────────────────────

const registry = new ToolRegistry();
registry.register(webSearchTool);
registry.register(summarizeTool);
registry.register(calculatorTool);

// Add handoff tool
const handoffTool = createHandoffTool(supabase, AGENT_NAME, {
  agent_beta: "agent_beta",
});
registry.register(handoffTool);

// ─── ReAct Agent Loop ────────────────────────────────────────────────────────

const systemPrompt = `
You are a smart research assistant named ${AGENT_NAME} with access to the following tools:
${registry.getToolDescriptions()}

When answering the user, you may use the tools to gather information or calculate results.
Follow this format strictly:
Thought: <your reasoning here>
Action: <ToolName>[<JSON parameters>]
Observation: <result of the tool action>
... (you can repeat Thought/Action/Observation as needed) ...
Thought: <final reasoning>
Answer: <your final answer to the user's query>

For tool actions, use JSON parameters like: WebSearch[{"query": "latest AI trends"}]
Only provide one action at a time, and wait for the observation before continuing.
If the answer is directly known or once you have gathered enough information, output the final Answer.
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

    // Check for final answer
    const answerMatch = assistantReply.match(/Answer:\s*(.*)$/s);
    if (answerMatch) {
      logger.info("Found answer", { step: step + 1 });
      return answerMatch[1].trim();
    }

    // Look for tool action
    const actionMatch =
      assistantReply.match(/Action:\s*(\w+)\[(\{[\s\S]*?\})\]/) ||
      assistantReply.match(/Action:\s*([^\[]+)\[([^\]]+)\]/);

    if (actionMatch) {
      const toolName = actionMatch[1].trim();
      const toolInput = actionMatch[2].trim();
      logger.info("Tool action", { tool: toolName, step: step + 1 });

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

    logger.warn("No action or answer in response", { step: step + 1 });
    return assistantReply.trim();
  }

  return "I apologize, but I was unable to reach a conclusion within the step limit.";
}

// ─── Message Processing ──────────────────────────────────────────────────────

async function processMessage(message: AgentMessage): Promise<AgentMessage> {
  const ctx = createToolContext(message.workflowId);

  try {
    const answer = await Promise.race([
      runReActAgent(message.payload.content, ctx),
      new Promise<string>(resolve =>
        setTimeout(() => resolve("I couldn't complete the task in time. Please try a simpler query."), 25000)
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

// ─── Channel Listener ────────────────────────────────────────────────────────

const channel = supabase.channel(AGENT_NAME);

channel.on('broadcast', { event: 'message' }, async (payload: any) => {
  let msg: any;
  if (payload?.payload?.payload) {
    msg = payload.payload.payload;
  } else if (payload?.payload) {
    msg = payload.payload;
  } else {
    msg = payload;
  }

  if (msg?.sender === AGENT_NAME) return;

  let agentMsg: AgentMessage;
  if (isValidAgentMessage(msg)) {
    agentMsg = msg;
  } else {
    agentMsg = createAgentMessage(
      'request',
      msg?.sender || 'unknown',
      AGENT_NAME,
      msg?.content || '',
      { correlationId: msg?.correlationId || msg?.id || msg?.messageId }
    );
  }

  logger.info("Received message", { from: agentMsg.sender, type: agentMsg.type });

  const response = await processMessage(agentMsg);

  await sendMessage(supabase, agentMsg.sender, response);

  const responseChannel = `${agentMsg.sender}-response-${agentMsg.correlationId}`;
  await sendMessage(supabase, responseChannel, response);

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
});

const { error } = await channel.subscribe();
if (error) {
  logger.error("Failed to subscribe to channel", { error: error.message });
  Deno.exit(1);
}

logger.info("Agent started, listening for messages");

// Health check HTTP server
Deno.serve({ port: 8000 }, (_req) => {
  return new Response(
    JSON.stringify({
      agent: AGENT_NAME,
      status: "running",
      tools: registry.listNames(),
      timestamp: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
