/**
 * AuthManager class for handling authentication in the MCP server
 * Uses timing-safe comparison to prevent timing attacks.
 */
export class AuthManager {
  private secretKey: string;
  private encoder: TextEncoder;

  constructor(secretKey: string) {
    if (!secretKey) {
      throw new Error("Secret key is required");
    }
    this.secretKey = secretKey;
    this.encoder = new TextEncoder();
  }

  /**
   * Validate a token using timing-safe comparison
   */
  validateToken(token: string): boolean {
    if (!token) return false;

    const a = this.encoder.encode(token);
    const b = this.encoder.encode(this.secretKey);

    // Different lengths already leak info, but we still do constant-time compare
    if (a.byteLength !== b.byteLength) {
      // Compare against self to burn the same CPU time, then return false
      crypto.subtle.timingSafeEqual(b, b);
      return false;
    }

    return crypto.subtle.timingSafeEqual(a, b);
  }

  /**
   * Verify a request by checking the Authorization header
   */
  verifyRequest(request: Request): boolean {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return false;

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return false;

    return this.validateToken(match[1]);
  }

  /**
   * Generate a unique request ID for tracing
   */
  static generateRequestId(): string {
    return crypto.randomUUID();
  }
}