/**
 * Shared Agent Message Protocol
 *
 * Standardized message format for all inter-agent communication
 * in the edge-agents platform.
 */

// Message types for inter-agent communication
export type AgentMessageType = 'request' | 'response' | 'handoff' | 'status' | 'error';

// Model tier for cost-optimized routing
export type ModelTier = 'auto' | 'fast' | 'balanced' | 'powerful';

/**
 * Standardized message format used by all agents
 */
export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  sender: string;
  target: string;
  correlationId: string;
  workflowId?: string;
  payload: AgentPayload;
  timestamp: number;
}

export interface AgentPayload {
  content: string;
  tools_used?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Gateway request from external clients
 */
export interface GatewayRequest {
  message: string;
  stream?: boolean;
  model?: ModelTier;
  workflow_id?: string;
}

/**
 * Gateway response to external clients
 */
export interface GatewayResponse {
  id: string;
  status: 'success' | 'error' | 'pending';
  content: string;
  workflow_id?: string;
  agent: string;
  tools_used?: string[];
  model_used?: string;
  timestamp: string;
}

/**
 * Structured error response
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}

/**
 * Agent capability registration
 */
export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  specialization: string[];
}

/**
 * Workflow state for multi-agent orchestration
 */
export interface WorkflowState {
  id: string;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  agents_involved: string[];
  current_agent: string;
  messages: AgentMessage[];
  started_at: number;
  updated_at: number;
}

// Helper functions

export function createAgentMessage(
  type: AgentMessageType,
  sender: string,
  target: string,
  content: string,
  opts?: {
    correlationId?: string;
    workflowId?: string;
    tools_used?: string[];
    metadata?: Record<string, unknown>;
  }
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type,
    sender,
    target,
    correlationId: opts?.correlationId ?? crypto.randomUUID(),
    workflowId: opts?.workflowId,
    payload: {
      content,
      tools_used: opts?.tools_used,
      metadata: opts?.metadata,
    },
    timestamp: Date.now(),
  };
}

export function createErrorResponse(code: string, message: string, requestId?: string): ErrorResponse {
  return {
    error: { code, message, request_id: requestId },
  };
}

export function isValidAgentMessage(msg: unknown): msg is AgentMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.type === 'string' &&
    ['request', 'response', 'handoff', 'status', 'error'].includes(m.type as string) &&
    typeof m.sender === 'string' &&
    typeof m.target === 'string' &&
    typeof m.correlationId === 'string' &&
    typeof m.timestamp === 'number' &&
    m.payload !== null &&
    typeof m.payload === 'object' &&
    typeof (m.payload as Record<string, unknown>).content === 'string'
  );
}
