/**
 * Structured Logger
 *
 * Provides structured JSON logging with request tracing
 * and timing metrics for the agent platform.
 */

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  agent?: string;
  request_id?: string;
  workflow_id?: string;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class Logger {
  private agent: string;
  private requestId?: string;
  private workflowId?: string;

  constructor(agent: string, requestId?: string, workflowId?: string) {
    this.agent = agent;
    this.requestId = requestId;
    this.workflowId = workflowId;
  }

  withRequest(requestId: string): Logger {
    return new Logger(this.agent, requestId, this.workflowId);
  }

  withWorkflow(workflowId: string): Logger {
    return new Logger(this.agent, this.requestId, workflowId);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  /**
   * Time an async operation and log the result
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.info(`${label} completed`, { duration_ms: Math.round(duration) });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, {
        duration_ms: Math.round(duration),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private log(level: LogEntry['level'], message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      agent: this.agent,
      request_id: this.requestId,
      workflow_id: this.workflowId,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // Output as structured JSON
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
}

/**
 * Create a request ID for tracing
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
