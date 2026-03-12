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
   * Validate a token using constant-time comparison to prevent timing attacks
   */
  validateToken(token: string): boolean {
    if (!token) return false;

    const a = this.encoder.encode(token);
    const b = this.encoder.encode(this.secretKey);

    // Constant-time comparison: always check all bytes
    if (a.byteLength !== b.byteLength) {
      // Still do a dummy compare to burn CPU time, then return false
      this.constantTimeCompare(b, b);
      return false;
    }

    return this.constantTimeCompare(a, b);
  }

  /**
   * Constant-time byte comparison (prevents timing side-channel attacks)
   */
  private constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    let result = 0;
    for (let i = 0; i < a.byteLength; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
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