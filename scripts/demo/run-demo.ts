#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Edge Agents Platform — End-to-End Demo
 *
 * Demonstrates the unified agent platform:
 * 1. Health check on the gateway
 * 2. Direct query (simple question handled by gateway)
 * 3. Research query (routed to agent_alpha)
 * 4. Database query (routed to agent_beta)
 * 5. Multi-agent workflow (research → handoff to database)
 *
 * Usage:
 *   GATEWAY_URL=http://localhost:54321/functions/v1/gateway \
 *   AUTH_TOKEN=your-token \
 *   deno run --allow-net --allow-env scripts/demo/run-demo.ts
 */

const GATEWAY_URL = Deno.env.get("GATEWAY_URL") || "http://localhost:54321/functions/v1/gateway";
const AUTH_TOKEN = Deno.env.get("AUTH_TOKEN") || "test-token";

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${AUTH_TOKEN}`,
};

function log(label: string, data: unknown) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function demo() {
  console.log("\n  Edge Agents Platform — End-to-End Demo");
  console.log(`  Gateway: ${GATEWAY_URL}\n`);

  // 1. Health Check
  try {
    log("1. Health Check (GET)", "Checking gateway status...");
    const health = await fetch(GATEWAY_URL, { headers });
    const healthData = await health.json();
    log("1. Health Check — Response", healthData);
  } catch (error) {
    log("1. Health Check — Error", {
      error: (error as Error).message,
      hint: "Make sure the gateway is running. Try: supabase functions serve gateway",
    });
    console.log("\nDemo requires a running gateway. Showing example requests instead.\n");
    showExampleRequests();
    return;
  }

  // 2. Direct Query
  try {
    log("2. Direct Query", "Sending simple question (handled directly by gateway)...");
    const direct = await fetch(GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "What is 2 + 2?",
        model: "fast",
      }),
    });
    const directData = await direct.json();
    log("2. Direct Query — Response", directData);
  } catch (error) {
    log("2. Direct Query — Error", (error as Error).message);
  }

  // 3. Research Query
  try {
    log("3. Research Query", "Sending research query (routes to agent_alpha)...");
    const research = await fetch(GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "Research the latest developments in edge computing and AI agents. Summarize key trends.",
        model: "balanced",
      }),
    });
    const researchData = await research.json();
    log("3. Research Query — Response", researchData);
  } catch (error) {
    log("3. Research Query — Error", (error as Error).message);
  }

  // 4. Database Query
  try {
    log("4. Database Query", "Sending database query (routes to agent_beta)...");
    const db = await fetch(GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "Query the agent_logs table and show me the most recent 5 entries.",
        model: "balanced",
      }),
    });
    const dbData = await db.json();
    log("4. Database Query — Response", dbData);
  } catch (error) {
    log("4. Database Query — Error", (error as Error).message);
  }

  // 5. Multi-Step Workflow
  try {
    const workflowId = crypto.randomUUID();
    log("5. Multi-Step Workflow", `Starting workflow ${workflowId}...`);
    const workflow = await fetch(GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "Research the current state of serverless edge computing, then check our database for any related agent logs.",
        model: "powerful",
        workflow_id: workflowId,
      }),
    });
    const workflowData = await workflow.json();
    log("5. Multi-Step Workflow — Response", workflowData);
  } catch (error) {
    log("5. Multi-Step Workflow — Error", (error as Error).message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Demo Complete!");
  console.log("=".repeat(60) + "\n");
}

function showExampleRequests() {
  console.log("Example curl commands you can run once the gateway is up:\n");

  console.log("# Health check");
  console.log(`curl ${GATEWAY_URL}\n`);

  console.log("# Simple query");
  console.log(`curl -X POST ${GATEWAY_URL} \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "Authorization: Bearer \${AUTH_TOKEN}" \\`);
  console.log(`  -d '{"message": "What is edge computing?", "model": "fast"}'\n`);

  console.log("# Research query (routes to agent_alpha)");
  console.log(`curl -X POST ${GATEWAY_URL} \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "Authorization: Bearer \${AUTH_TOKEN}" \\`);
  console.log(`  -d '{"message": "Research the latest AI agent frameworks", "model": "balanced"}'\n`);

  console.log("# Database query (routes to agent_beta)");
  console.log(`curl -X POST ${GATEWAY_URL} \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "Authorization: Bearer \${AUTH_TOKEN}" \\`);
  console.log(`  -d '{"message": "Show me recent entries from the agent_logs table", "model": "balanced"}'\n`);
}

// Run demo
demo().catch(console.error);
