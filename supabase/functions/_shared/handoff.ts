/**
 * Agent Handoff System
 *
 * Enables agents to transfer work to other specialized agents
 * via Supabase channels with workflow tracking.
 *
 * Ported from scripts/agentic-mcp/src/mcp/tools/handoff.ts
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  AgentMessage,
  createAgentMessage,
  WorkflowState,
} from "./protocol.ts";
import { sendMessage, waitForResponse } from "./channel.ts";
import { Tool, ToolContext, trackAction, remember } from "./tools.ts";

// In-memory workflow tracking
const activeWorkflows: Map<string, WorkflowState> = new Map();

/**
 * Create a handoff tool for an agent
 */
export function createHandoffTool(
  supabase: SupabaseClient,
  senderAgent: string,
  availableAgents: Record<string, string>
): Tool {
  const agentNames = Object.keys(availableAgents);

  return {
    name: "handoff_to_agent",
    description: `Transfer the task to another specialized agent. Available agents: ${agentNames.join(', ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: `The agent to hand off to: ${agentNames.join(', ')}`,
          enum: agentNames,
        },
        reason: {
          type: 'string',
          description: 'Why this handoff is needed',
        },
        context: {
          type: 'string',
          description: 'Additional context for the receiving agent',
        },
      },
      required: ['agent_name', 'reason'],
    },
    execute: async (params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> => {
      const agentName = params.agent_name as string;
      const reason = params.reason as string;
      const context = (params.context as string) || '';

      const targetChannel = availableAgents[agentName];
      if (!targetChannel) {
        throw new Error(`Unknown agent: ${agentName}. Available: ${agentNames.join(', ')}`);
      }

      trackAction(ctx, `handoff_to:${agentName}`);
      remember(ctx, `handoff_${Date.now()}`, {
        to_agent: agentName,
        reason,
      });

      // Create handoff message
      const handoffMessage = createAgentMessage(
        'handoff',
        senderAgent,
        agentName,
        `Handoff from ${senderAgent}: ${reason}\n\nContext: ${context}`,
        {
          workflowId: ctx.workflow_id,
          metadata: {
            handoff_reason: reason,
            original_sender: senderAgent,
          },
        }
      );

      // Send to target agent's channel
      const sent = await sendMessage(supabase, targetChannel, handoffMessage);

      if (!sent) {
        throw new Error(`Failed to send handoff message to ${agentName}`);
      }

      // Try to wait for response (with shorter timeout for handoffs)
      try {
        const responseChannel = `${senderAgent}-response-${handoffMessage.correlationId}`;
        const response = await waitForResponse(
          supabase,
          responseChannel,
          handoffMessage.correlationId,
          20000
        );

        return {
          status: 'completed',
          agent: agentName,
          response: response.payload.content,
          tools_used: response.payload.tools_used,
        };
      } catch {
        // Return pending if timeout — the orchestrator can pick it up
        return {
          status: 'pending',
          agent: agentName,
          message_id: handoffMessage.id,
          correlation_id: handoffMessage.correlationId,
          note: `Handoff sent to ${agentName}, awaiting response`,
        };
      }
    },
  };
}

/**
 * Track a workflow
 */
export function trackWorkflow(
  workflowId: string,
  agent: string,
  message: AgentMessage
): void {
  let workflow = activeWorkflows.get(workflowId);

  if (!workflow) {
    workflow = {
      id: workflowId,
      status: 'active',
      agents_involved: [agent],
      current_agent: agent,
      messages: [message],
      started_at: Date.now(),
      updated_at: Date.now(),
    };
    activeWorkflows.set(workflowId, workflow);
  } else {
    if (!workflow.agents_involved.includes(agent)) {
      workflow.agents_involved.push(agent);
    }
    workflow.current_agent = agent;
    workflow.messages.push(message);
    workflow.updated_at = Date.now();
  }
}

/**
 * Get workflow state
 */
export function getWorkflow(workflowId: string): WorkflowState | undefined {
  return activeWorkflows.get(workflowId);
}

/**
 * Complete a workflow
 */
export function completeWorkflow(workflowId: string): void {
  const workflow = activeWorkflows.get(workflowId);
  if (workflow) {
    workflow.status = 'completed';
    workflow.updated_at = Date.now();
  }
}
