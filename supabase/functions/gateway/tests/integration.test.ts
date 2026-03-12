/**
 * Integration Tests for the Unified Agent Platform
 *
 * Tests the gateway, protocol, tool registry, auth, and agent communication.
 * Run with: deno test --allow-env --allow-net gateway/tests/integration.test.ts
 */

import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Protocol Tests ──────────────────────────────────────────────────────────

import {
  createAgentMessage,
  isValidAgentMessage,
  createErrorResponse,
} from "../../_shared/protocol.ts";

Deno.test("protocol - createAgentMessage creates valid message", () => {
  const msg = createAgentMessage("request", "gateway", "agent_alpha", "Hello world");

  assertExists(msg.id);
  assertEquals(msg.type, "request");
  assertEquals(msg.sender, "gateway");
  assertEquals(msg.target, "agent_alpha");
  assertEquals(msg.payload.content, "Hello world");
  assertExists(msg.correlationId);
  assertExists(msg.timestamp);
});

Deno.test("protocol - createAgentMessage with options", () => {
  const msg = createAgentMessage("handoff", "alpha", "beta", "test", {
    correlationId: "corr-123",
    workflowId: "wf-456",
    tools_used: ["WebSearch"],
    metadata: { key: "value" },
  });

  assertEquals(msg.correlationId, "corr-123");
  assertEquals(msg.workflowId, "wf-456");
  assertEquals(msg.payload.tools_used, ["WebSearch"]);
  assertEquals(msg.payload.metadata?.key, "value");
});

Deno.test("protocol - isValidAgentMessage validates correctly", () => {
  const valid = createAgentMessage("request", "a", "b", "test");
  assertEquals(isValidAgentMessage(valid), true);

  assertEquals(isValidAgentMessage(null), false);
  assertEquals(isValidAgentMessage({}), false);
  assertEquals(isValidAgentMessage({ id: "x" }), false);
  assertEquals(isValidAgentMessage({ id: "x", type: "invalid" }), false);
});

Deno.test("protocol - createErrorResponse", () => {
  const err = createErrorResponse("not_found", "Resource not found", "req-123");
  assertEquals(err.error.code, "not_found");
  assertEquals(err.error.message, "Resource not found");
  assertEquals(err.error.request_id, "req-123");
});

// ─── Tool Registry Tests ─────────────────────────────────────────────────────

import {
  ToolRegistry,
  createToolContext,
  trackAction,
  remember,
  recall,
} from "../../_shared/tools.ts";

Deno.test("tools - ToolRegistry register and execute", async () => {
  const registry = new ToolRegistry();

  registry.register({
    name: "echo",
    description: "Echoes input",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo" },
      },
      required: ["text"],
    },
    execute: async (params) => params.text,
  });

  const ctx = createToolContext();
  const result = await registry.execute("echo", { text: "hello" }, ctx);
  assertEquals(result, "hello");
  assertEquals(ctx.actions.includes("tool:echo"), true);
});

Deno.test("tools - ToolRegistry rejects duplicate", () => {
  const registry = new ToolRegistry();
  const tool = {
    name: "test",
    description: "test",
    inputSchema: { type: "object" as const, properties: {} },
    execute: async () => null,
  };

  registry.register(tool);

  let threw = false;
  try {
    registry.register(tool);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("tools - ToolRegistry validates required params", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "requiresInput",
    description: "test",
    inputSchema: {
      type: "object",
      properties: {
        required_field: { type: "string", description: "required" },
      },
      required: ["required_field"],
    },
    execute: async () => "ok",
  });

  const ctx = createToolContext();
  let threw = false;
  try {
    await registry.execute("requiresInput", {}, ctx);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("required_field"), true);
  }
  assertEquals(threw, true);
});

Deno.test("tools - ToolRegistry getToolDescriptions", () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "myTool",
    description: "Does something",
    inputSchema: {
      type: "object",
      properties: {
        param1: { type: "string", description: "A parameter" },
      },
    },
    execute: async () => null,
  });

  const desc = registry.getToolDescriptions();
  assertEquals(desc.includes("myTool"), true);
  assertEquals(desc.includes("Does something"), true);
  assertEquals(desc.includes("param1"), true);
});

Deno.test("tools - context management", () => {
  const ctx = createToolContext("wf-test");
  assertEquals(ctx.workflow_id, "wf-test");

  trackAction(ctx, "action1");
  trackAction(ctx, "action2");
  assertEquals(ctx.actions.length, 2);

  remember(ctx, "key1", "value1");
  assertEquals(recall(ctx, "key1"), "value1");
  assertEquals(recall(ctx, "nonexistent"), undefined);
});

// ─── Auth Tests ──────────────────────────────────────────────────────────────

import { AuthManager } from "../../mcp-server/core/auth.ts";

Deno.test("auth - validates correct token", () => {
  const auth = new AuthManager("test-secret-key");
  assertEquals(auth.validateToken("test-secret-key"), true);
});

Deno.test("auth - rejects incorrect token", () => {
  const auth = new AuthManager("test-secret-key");
  assertEquals(auth.validateToken("wrong-key"), false);
  assertEquals(auth.validateToken(""), false);
});

Deno.test("auth - verifies request with bearer token", () => {
  const auth = new AuthManager("test-secret-key");

  const validReq = new Request("http://localhost", {
    headers: { Authorization: "Bearer test-secret-key" },
  });
  assertEquals(auth.verifyRequest(validReq), true);

  const invalidReq = new Request("http://localhost", {
    headers: { Authorization: "Bearer wrong-key" },
  });
  assertEquals(auth.verifyRequest(invalidReq), false);

  const noAuthReq = new Request("http://localhost");
  assertEquals(auth.verifyRequest(noAuthReq), false);

  const badFormatReq = new Request("http://localhost", {
    headers: { Authorization: "Basic dXNlcjpwYXNz" },
  });
  assertEquals(auth.verifyRequest(badFormatReq), false);
});

Deno.test("auth - generateRequestId returns UUID", () => {
  const id = AuthManager.generateRequestId();
  assertExists(id);
  assertNotEquals(id, AuthManager.generateRequestId());
});

// ─── MCP Server Tests ────────────────────────────────────────────────────────

import { McpServer } from "../../mcp-server/core/server.ts";

Deno.test("mcp-server - rejects unauthenticated request", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/status");
  const res = await server.handleRequest(req);
  assertEquals(res.status, 401);
});

Deno.test("mcp-server - returns status for authenticated request", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/status", {
    headers: { Authorization: "Bearer test-key" },
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.version, "2.0.0");
  assertExists(body.request_id);
});

Deno.test("mcp-server - returns capabilities", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/capabilities", {
    headers: { Authorization: "Bearer test-key" },
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertExists(body.capabilities);
  assertEquals(body.capabilities.commands.includes("echo"), true);
});

Deno.test("mcp-server - executes echo command", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/execute", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: "echo", message: "hello" }),
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.result, "hello");
});

Deno.test("mcp-server - executes ping command", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/execute", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: "ping" }),
  });
  const res = await server.handleRequest(req);
  const body = await res.json();
  assertEquals(body.result, "pong");
});

Deno.test("mcp-server - rejects invalid command", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/execute", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: "drop_tables" }),
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 400);
});

Deno.test("mcp-server - rejects invalid JSON", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/execute", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    },
    body: "not json",
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "invalid_json");
});

Deno.test("mcp-server - returns 404 for unknown endpoint", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/nonexistent", {
    headers: { Authorization: "Bearer test-key" },
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 404);
});

Deno.test("mcp-server - returns 405 for unsupported method", async () => {
  const server = new McpServer("test-key");
  const req = new Request("http://localhost/status", {
    method: "DELETE",
    headers: { Authorization: "Bearer test-key" },
  });
  const res = await server.handleRequest(req);
  assertEquals(res.status, 405);
});

// ─── Logger Tests ────────────────────────────────────────────────────────────

import { Logger, generateRequestId } from "../../_shared/logger.ts";

Deno.test("logger - generates request IDs", () => {
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  assertNotEquals(id1, id2);
});

Deno.test("logger - withRequest creates child logger", () => {
  const base = new Logger("test-agent");
  const child = base.withRequest("req-123");
  assertExists(child);
  // Just verify it doesn't throw
});

Deno.test("logger - time measures async operations", async () => {
  const log = new Logger("test");
  const result = await log.time("test-op", async () => {
    return 42;
  });
  assertEquals(result, 42);
});

Deno.test("logger - time captures errors", async () => {
  const log = new Logger("test");
  let threw = false;
  try {
    await log.time("failing-op", async () => {
      throw new Error("test error");
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
