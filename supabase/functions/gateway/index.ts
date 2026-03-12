/**
 * Unified Agent Gateway
 *
 * Single entry point for the edge-agents platform.
 * Routes requests to specialized agents, manages workflows,
 * and provides cost-optimized model access via the Tumbler.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  AgentMessage,
  GatewayRequest,
  GatewayResponse,
  createAgentMessage,
  createErrorResponse,
} from "../_shared/protocol.ts";
import { sendMessage, waitForResponse, getSupabaseClient } from "../_shared/channel.ts";
import { Logger, generateRequestId } from "../_shared/logger.ts";
import { ModelProvider } from "./model-provider.ts";

// Agent registry — which agents handle which types of requests
const AGENT_REGISTRY: Record<string, {
  name: string;
  capabilities: string[];
  channel: string;
}> = {
  research: {
    name: "agent_alpha",
    capabilities: ["research", "web_search", "summarize", "analysis"],
    channel: "agent_alpha",
  },
  database: {
    name: "agent_beta",
    capabilities: ["database", "data_query", "data_analysis"],
    channel: "agent_beta",
  },
};

const GATEWAY_NAME = "gateway";
const LOGS_CHANNEL = "agent-manager-logs";

serve(async (req) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = getCorsHeaders(req);
  const requestId = generateRequestId();
  const logger = new Logger(GATEWAY_NAME, requestId);

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "edge-agents-gateway",
        version: "2.0.0",
        status: "running",
        agents: Object.keys(AGENT_REGISTRY),
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify(createErrorResponse("method_not_allowed", "Only GET and POST are supported", requestId)),
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: GatewayRequest = await req.json();

    if (!body.message || typeof body.message !== "string") {
      return new Response(
        JSON.stringify(createErrorResponse("invalid_input", "Field 'message' is required", requestId)),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    logger.info("Gateway request received", { message_length: body.message.length, model: body.model });

    const modelProvider = new ModelProvider(logger);
    const workflowId = body.workflow_id || crypto.randomUUID();
    const loggerWithWorkflow = logger.withWorkflow(workflowId);

    // Step 1: Determine the best agent for this request
    const routing = await loggerWithWorkflow.time("route_request", () =>
      routeRequest(body.message, modelProvider)
    );

    loggerWithWorkflow.info("Routed to agent", { agent: routing.agent, reasoning: routing.reasoning });

    // Step 2: If it's a simple query we can handle directly, do so
    if (routing.agent === "direct") {
      const result = await loggerWithWorkflow.time("direct_completion", () =>
        modelProvider.complete({
          messages: [
            { role: "system", content: "You are a helpful assistant. Be concise and accurate." },
            { role: "user", content: body.message },
          ],
          model: body.model || "auto",
        })
      );

      const response: GatewayResponse = {
        id: requestId,
        status: "success",
        content: result.content,
        workflow_id: workflowId,
        agent: "gateway",
        model_used: result.model_used,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(response), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Step 3: Route to a specialized agent via Supabase channels
    const agentInfo = AGENT_REGISTRY[routing.agent];
    if (!agentInfo) {
      // Fallback to direct if agent not found
      loggerWithWorkflow.warn("Unknown agent, falling back to direct", { agent: routing.agent });
      const result = await modelProvider.complete({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: body.message },
        ],
        model: body.model || "auto",
      });

      const response: GatewayResponse = {
        id: requestId,
        status: "success",
        content: result.content,
        workflow_id: workflowId,
        agent: "gateway",
        model_used: result.model_used,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(response), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Send message to agent via Supabase channel
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // If no Supabase, handle directly
      loggerWithWorkflow.warn("Supabase not available, handling directly");
      const result = await modelProvider.complete({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: body.message },
        ],
        model: body.model || "auto",
      });

      return new Response(
        JSON.stringify({
          id: requestId,
          status: "success",
          content: result.content,
          workflow_id: workflowId,
          agent: "gateway",
          model_used: result.model_used,
          timestamp: new Date().toISOString(),
        } satisfies GatewayResponse),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const agentMessage = createAgentMessage(
      "request",
      GATEWAY_NAME,
      agentInfo.name,
      body.message,
      {
        workflowId,
        metadata: { model_preference: body.model || "auto" },
      }
    );

    const sent = await sendMessage(supabase, agentInfo.channel, agentMessage);
    if (!sent) {
      throw new Error(`Failed to send message to agent: ${agentInfo.name}`);
    }

    // Wait for response from agent
    const responseChannelName = `${GATEWAY_NAME}-response-${agentMessage.correlationId}`;
    try {
      const agentResponse = await waitForResponse(
        supabase,
        responseChannelName,
        agentMessage.correlationId,
        25000
      );

      const response: GatewayResponse = {
        id: requestId,
        status: agentResponse.type === "error" ? "error" : "success",
        content: agentResponse.payload.content,
        workflow_id: workflowId,
        agent: agentResponse.sender,
        tools_used: agentResponse.payload.tools_used,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(response), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (timeoutError) {
      // On timeout, fall back to direct completion
      loggerWithWorkflow.warn("Agent response timeout, handling directly", {
        agent: agentInfo.name,
        error: timeoutError instanceof Error ? timeoutError.message : String(timeoutError),
      });

      const result = await modelProvider.complete({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: body.message },
        ],
        model: body.model || "auto",
      });

      const response: GatewayResponse = {
        id: requestId,
        status: "success",
        content: result.content,
        workflow_id: workflowId,
        agent: "gateway-fallback",
        model_used: result.model_used,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(response), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    logger.error("Gateway error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify(createErrorResponse(
        "internal_error",
        error instanceof Error ? error.message : "Unknown error",
        requestId
      )),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Route a request to the appropriate agent using LLM analysis
 */
async function routeRequest(
  message: string,
  modelProvider: ModelProvider
): Promise<{ agent: string; reasoning: string }> {
  const agentList = Object.entries(AGENT_REGISTRY)
    .map(([key, info]) => `- ${key}: ${info.capabilities.join(", ")}`)
    .join("\n");

  try {
    const result = await modelProvider.complete({
      messages: [
        {
          role: "system",
          content: `You are a request router. Analyze the user query and determine which agent should handle it.

Available agents:
${agentList}
- direct: simple questions, greetings, general knowledge (no specialized tools needed)

Respond with ONLY valid JSON: {"agent": "<agent_name>", "reasoning": "<brief_reason>"}`,
        },
        { role: "user", content: message },
      ],
      model: "fast",
      temperature: 0,
      max_tokens: 200,
    });

    const parsed = JSON.parse(result.content);
    return {
      agent: parsed.agent || "direct",
      reasoning: parsed.reasoning || "No reasoning provided",
    };
  } catch {
    // Default to direct on parsing failure
    return { agent: "direct", reasoning: "Routing failed, defaulting to direct" };
  }
}
