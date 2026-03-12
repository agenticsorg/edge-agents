/**
 * MCP Server Implementation
 *
 * Hardened with request validation, rate limiting,
 * structured error responses, and request tracing.
 */

import { AuthManager } from "./auth.ts";

// Simple in-memory rate limiter (token bucket per API key)
interface RateBucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT = 60; // requests per minute
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_SIZE = 1024 * 64; // 64KB

const rateBuckets: Map<string, RateBucket> = new Map();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket) {
    bucket = { tokens: RATE_LIMIT, lastRefill: now };
    rateBuckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const refill = Math.floor((elapsed / RATE_WINDOW_MS) * RATE_LIMIT);
    bucket.tokens = Math.min(RATE_LIMIT, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) return false;
  bucket.tokens--;
  return true;
}

function jsonResponse(data: unknown, status = 200, requestId?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requestId) headers["X-Request-Id"] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(code: string, message: string, status: number, requestId?: string): Response {
  return jsonResponse({ error: { code, message, request_id: requestId } }, status, requestId);
}

export class McpServer {
  private secretKey: string;
  private auth: AuthManager;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
    this.auth = new AuthManager(secretKey);
  }

  async handleRequest(req: Request): Promise<Response> {
    const requestId = AuthManager.generateRequestId();

    // Auth check
    if (!this.auth.verifyRequest(req)) {
      return errorResponse("unauthorized", "Invalid or missing authorization", 401, requestId);
    }

    // Rate limit (keyed by token prefix for privacy)
    const token = req.headers.get("Authorization")?.substring(7) || "unknown";
    const rateLimitKey = token.substring(0, 8);
    if (!checkRateLimit(rateLimitKey)) {
      return errorResponse("rate_limited", "Too many requests. Try again later.", 429, requestId);
    }

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop() || "";

    if (req.method === "GET") {
      return this.handleGetRequest(path, url, requestId);
    } else if (req.method === "POST") {
      return this.handlePostRequest(path, req, requestId);
    } else {
      return errorResponse("method_not_allowed", "Method not allowed", 405, requestId);
    }
  }

  private handleGetRequest(path: string, _url: URL, requestId: string): Response {
    if (path === "status") return this.getStatus(requestId);
    if (path === "capabilities") return this.getCapabilities(requestId);
    return errorResponse("not_found", `Unknown endpoint: ${path}`, 404, requestId);
  }

  private async handlePostRequest(path: string, req: Request, requestId: string): Promise<Response> {
    // Enforce body size limit
    const contentLength = req.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return errorResponse("payload_too_large", "Request body too large", 413, requestId);
    }

    try {
      const text = await req.text();
      if (text.length > MAX_BODY_SIZE) {
        return errorResponse("payload_too_large", "Request body too large", 413, requestId);
      }

      const body = JSON.parse(text);

      if (path === "execute") return this.executeCommand(body, requestId);
      if (path === "query") return this.executeQuery(body, requestId);

      return errorResponse("not_found", `Unknown endpoint: ${path}`, 404, requestId);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        return errorResponse("invalid_json", "Request body must be valid JSON", 400, requestId);
      }
      const msg = error instanceof Error ? error.message : "Unknown error";
      return errorResponse("bad_request", msg, 400, requestId);
    }
  }

  private getStatus(requestId: string): Response {
    return jsonResponse({
      status: "ok",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      request_id: requestId,
    }, 200, requestId);
  }

  private getCapabilities(requestId: string): Response {
    return jsonResponse({
      version: "2.0.0",
      capabilities: {
        commands: ["echo", "ping"],
        queries: ["time", "random"],
      },
      request_id: requestId,
    }, 200, requestId);
  }

  private executeCommand(body: Record<string, unknown>, requestId: string): Response {
    if (!body.command || typeof body.command !== "string") {
      return errorResponse("invalid_input", "Field 'command' is required and must be a string", 400, requestId);
    }

    const command = body.command;

    if (command === "echo") {
      if (!body.message) {
        return errorResponse("invalid_input", "Field 'message' is required for echo command", 400, requestId);
      }
      return jsonResponse({ result: body.message, request_id: requestId }, 200, requestId);
    }

    if (command === "ping") {
      return jsonResponse({ result: "pong", request_id: requestId }, 200, requestId);
    }

    return errorResponse("unknown_command", `Unknown command: ${command}`, 400, requestId);
  }

  private executeQuery(body: Record<string, unknown>, requestId: string): Response {
    if (!body.query || typeof body.query !== "string") {
      return errorResponse("invalid_input", "Field 'query' is required and must be a string", 400, requestId);
    }

    const query = body.query;

    if (query === "time") {
      return jsonResponse({ result: new Date().toISOString(), request_id: requestId }, 200, requestId);
    }

    if (query === "random") {
      return jsonResponse({ result: Math.random(), request_id: requestId }, 200, requestId);
    }

    return errorResponse("unknown_query", `Unknown query: ${query}`, 400, requestId);
  }
}
