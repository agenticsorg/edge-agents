/**
 * Agent Manager — Workflow Orchestrator
 *
 * Upgraded from simple LLM router to a full workflow orchestrator.
 * Tracks active workflows, handles agent handoffs, implements
 * timeout/circuit breaker, and uses standardized protocol.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  AgentMessage,
  AgentCapability,
  WorkflowState,
  createAgentMessage,
  isValidAgentMessage,
  createErrorResponse,
} from "../_shared/protocol.ts";
import { createChannel, sendMessage, waitForResponse } from "../_shared/channel.ts";
import { Logger, generateRequestId } from "../_shared/logger.ts";
import { ModelProvider } from "../gateway/model-provider.ts";
import { trackWorkflow, getWorkflow, completeWorkflow } from "../_shared/handoff.ts";

// Environment variables
const SUPABASE_URL = Deno.env.get("SB_URL") || "";
const SUPABASE_KEY = Deno.env.get("SB_SERVICE_KEY") || "";
const AGENT_NAME = "agent-manager";
const LOGS_CHANNEL = "agent-manager-logs";

const logger = new Logger(AGENT_NAME);

let supabase: SupabaseClient | undefined;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  logger.warn("Supabase credentials not available. Realtime features disabled.");
}

const modelProvider = new ModelProvider(logger);

// ─── Agent Registry ──────────────────────────────────────────────────────────

const AGENTS: Record<string, AgentCapability> = {
  agent_alpha: {
    name: "agent_alpha",
    description: "Research agent — web search, summarization, analysis",
    tools: ["WebSearch", "Summarize", "Calculator", "handoff_to_agent"],
    specialization: ["research", "web_search", "summarize", "analysis", "general_queries"],
  },
  agent_beta: {
    name: "agent_beta",
    description: "Database agent — Supabase queries, data operations, data analysis",
    tools: ["QueryDatabase", "InsertData", "Calculator", "handoff_to_agent"],
    specialization: ["database", "data_query", "data_processing", "math"],
  },
};

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

const circuitBreakers: Map<string, CircuitState> = new Map();
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60_000;

function isCircuitOpen(agent: string): boolean {
  const state = circuitBreakers.get(agent);
  if (!state || !state.open) return false;
  // Auto-reset after timeout (half-open)
  if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
    state.open = false;
    state.failures = 0;
    return false;
  }
  return true;
}

function recordFailure(agent: string): void {
  let state = circuitBreakers.get(agent);
  if (!state) {
    state = { failures: 0, lastFailure: 0, open: false };
    circuitBreakers.set(agent, state);
  }
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_THRESHOLD) {
    state.open = true;
    logger.warn("Circuit breaker opened", { agent, failures: state.failures });
  }
}

function recordSuccess(agent: string): void {
  const state = circuitBreakers.get(agent);
  if (state) {
    state.failures = 0;
    state.open = false;
  }
}

// ─── Routing ─────────────────────────────────────────────────────────────────

async function routeToAgent(content: string): Promise<{ agent: string; reasoning: string }> {
  const agentList = Object.entries(AGENTS)
    .map(([name, cap]) => `- ${name}: ${cap.description} (specialization: ${cap.specialization.join(', ')})`)
    .join('\n');

  try {
    const result = await modelProvider.complete({
      messages: [
        {
          role: 'system',
          content: `You are a request router. Determine which agent should handle this query.

Available agents:
${agentList}

Respond with ONLY valid JSON: {"agent": "<agent_name>", "reasoning": "<brief_reason>"}`,
        },
        { role: 'user', content },
      ],
      model: 'fast',
      temperature: 0,
      max_tokens: 150,
    });

    return JSON.parse(result.content);
  } catch {
    return { agent: 'agent_alpha', reasoning: 'Default routing' };
  }
}

// ─── Message Processing ──────────────────────────────────────────────────────

async function processMessage(message: AgentMessage): Promise<AgentMessage> {
  const workflowId = message.workflowId || crypto.randomUUID();
  const workflowLogger = logger.withWorkflow(workflowId);

  // Route to agent
  const routing = await workflowLogger.time("route", () =>
    routeToAgent(message.payload.content)
  );

  const targetAgent = routing.agent;
  workflowLogger.info("Routed", { target: targetAgent, reasoning: routing.reasoning });

  // Check circuit breaker
  if (isCircuitOpen(targetAgent)) {
    workflowLogger.warn("Circuit open, trying fallback", { agent: targetAgent });
    // Try the other agent
    const fallback = targetAgent === 'agent_alpha' ? 'agent_beta' : 'agent_alpha';
    if (!isCircuitOpen(fallback)) {
      return await dispatchToAgent(fallback, message, workflowId, workflowLogger);
    }
    // Both circuits open — handle directly
    return await handleDirectly(message, workflowId);
  }

  return await dispatchToAgent(targetAgent, message, workflowId, workflowLogger);
}

async function dispatchToAgent(
  targetAgent: string,
  message: AgentMessage,
  workflowId: string,
  workflowLogger: Logger
): Promise<AgentMessage> {
  if (!supabase) {
    return await handleDirectly(message, workflowId);
  }

  const commandMessage = createAgentMessage(
    'request',
    AGENT_NAME,
    targetAgent,
    message.payload.content,
    {
      correlationId: message.correlationId,
      workflowId,
      metadata: { original_sender: message.sender },
    }
  );

  // Track workflow
  trackWorkflow(workflowId, targetAgent, commandMessage);

  // Send to agent
  const sent = await sendMessage(supabase, targetAgent, commandMessage);
  if (!sent) {
    recordFailure(targetAgent);
    return await handleDirectly(message, workflowId);
  }

  // Wait for response
  try {
    const responseChannel = `${AGENT_NAME}-response-${commandMessage.correlationId}`;
    const agentResponse = await waitForResponse(
      supabase,
      responseChannel,
      commandMessage.correlationId,
      25000
    );

    recordSuccess(targetAgent);
    completeWorkflow(workflowId);

    return createAgentMessage(
      'response',
      AGENT_NAME,
      message.sender,
      agentResponse.payload.content,
      {
        correlationId: message.correlationId,
        workflowId,
        tools_used: agentResponse.payload.tools_used,
        metadata: {
          routed_to: targetAgent,
          workflow_id: workflowId,
        },
      }
    );
  } catch (timeoutError) {
    workflowLogger.warn("Agent timeout", { agent: targetAgent });
    recordFailure(targetAgent);
    return await handleDirectly(message, workflowId);
  }
}

async function handleDirectly(message: AgentMessage, workflowId: string): Promise<AgentMessage> {
  const result = await modelProvider.complete({
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Be concise and accurate.' },
      { role: 'user', content: message.payload.content },
    ],
    model: 'balanced',
  });

  return createAgentMessage(
    'response',
    AGENT_NAME,
    message.sender,
    result.content,
    {
      correlationId: message.correlationId,
      workflowId,
      metadata: { handled_directly: true, model_used: result.model_used },
    }
  );
}

// ─── HTTP Handler ────────────────────────────────────────────────────────────

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
        service: AGENT_NAME,
        status: "running",
        agents: Object.keys(AGENTS),
        circuit_breakers: Object.fromEntries(
          Array.from(circuitBreakers.entries()).map(([k, v]) => [k, { open: v.open, failures: v.failures }])
        ),
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();

    let agentMsg: AgentMessage;
    if (isValidAgentMessage(body)) {
      agentMsg = body;
    } else {
      agentMsg = createAgentMessage(
        'request',
        body.sender || 'api-client',
        AGENT_NAME,
        body.content || body.message || '',
        { correlationId: body.id || body.correlationId }
      );
    }

    logger.info("Received request", { from: agentMsg.sender });
    const response = await processMessage(agentMsg);

    // Send response to channels
    if (supabase) {
      await sendMessage(supabase, agentMsg.sender, response);

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
    }

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    logger.error("Error", { error: (error as Error).message });
    return new Response(
      JSON.stringify(createErrorResponse("internal_error", (error as Error).message)),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});

// ─── Channel Listener ────────────────────────────────────────────────────────

if (supabase) {
  (async () => {
    try {
      const channel = await createChannel(supabase!, AGENT_NAME);

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
        } else if (msg?.content) {
          agentMsg = createAgentMessage(
            'request',
            msg.sender || 'unknown',
            AGENT_NAME,
            msg.content,
            { correlationId: msg.correlationId || msg.id }
          );
        } else {
          return;
        }

        const response = await processMessage(agentMsg);

        if (agentMsg.sender && agentMsg.sender !== 'unknown') {
          await sendMessage(supabase!, agentMsg.sender, response);
          const responseChannel = `${agentMsg.sender}-response-${agentMsg.correlationId}`;
          await sendMessage(supabase!, responseChannel, response);
        }
      });

      logger.info("Channel listener started");
    } catch (error) {
      logger.error("Failed to set up channel listener", { error: (error as Error).message });
    }
  })();
}
