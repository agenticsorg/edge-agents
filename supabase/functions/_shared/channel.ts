/**
 * Shared Supabase Channel Helpers
 *
 * Standardized channel management for inter-agent communication.
 * Extracted from agent-manager and agent_alpha patterns.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { AgentMessage, isValidAgentMessage } from "./protocol.ts";

// Track active channel subscriptions to prevent duplicates
const activeChannels: Map<string, ReturnType<SupabaseClient['channel']>> = new Map();

/**
 * Get or create a Supabase client from environment variables
 */
export function getSupabaseClient(): SupabaseClient {
  const url = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SB_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!url || !key) {
    throw new Error("Supabase credentials not configured. Set SB_URL and SB_SERVICE_KEY.");
  }

  return createClient(url, key);
}

/**
 * Idempotent channel subscription — returns existing channel if already subscribed
 */
export async function createChannel(
  supabase: SupabaseClient,
  name: string
): Promise<ReturnType<SupabaseClient['channel']>> {
  const existing = activeChannels.get(name);
  if (existing) return existing;

  const channel = supabase.channel(name);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Channel subscription timeout: ${name}`));
    }, 10000);

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        activeChannels.set(name, channel);
        resolve(channel);
      }
      if (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

/**
 * Send a validated AgentMessage to a channel
 */
export async function sendMessage(
  supabase: SupabaseClient,
  channelName: string,
  message: AgentMessage
): Promise<boolean> {
  if (!isValidAgentMessage(message)) {
    console.error(`[channel] Invalid message format, refusing to send to ${channelName}`);
    return false;
  }

  try {
    const channel = await createChannel(supabase, channelName);
    await channel.send({
      type: "broadcast",
      event: "message",
      payload: message,
    });
    return true;
  } catch (error) {
    console.error(`[channel] Error sending to ${channelName}:`, error);
    return false;
  }
}

/**
 * Wait for a response matching a correlationId with timeout
 */
export function waitForResponse(
  supabase: SupabaseClient,
  channelName: string,
  correlationId: string,
  timeoutMs = 25000
): Promise<AgentMessage> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Response timeout after ${timeoutMs}ms for correlationId: ${correlationId}`));
    }, timeoutMs);

    try {
      const channel = await createChannel(supabase, channelName);

      channel.on("broadcast", { event: "message" }, (payload: { payload?: unknown }) => {
        const msg = payload?.payload;
        if (
          isValidAgentMessage(msg) &&
          msg.correlationId === correlationId &&
          (msg.type === "response" || msg.type === "error")
        ) {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Clean up a channel subscription
 */
export async function removeChannel(
  supabase: SupabaseClient,
  name: string
): Promise<void> {
  const channel = activeChannels.get(name);
  if (channel) {
    await supabase.removeChannel(channel);
    activeChannels.delete(name);
  }
}
