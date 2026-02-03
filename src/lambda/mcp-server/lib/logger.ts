/**
 * Structured Logger for MCP Server
 *
 * Outputs JSON-formatted logs for CloudWatch Insights queries.
 * Cost-effective: Uses Lambda's built-in metrics for invocations/errors/duration.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  method?: string;
  tool?: string;
  apiKeyPrefix?: string;
  businessId?: string;
  duration_ms?: number;
  status?: 'success' | 'error' | 'rate_limited' | 'unauthorized';
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

/**
 * Create a structured log entry
 */
function createLogEntry(level: LogLevel, event: string, context: LogContext = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };
}

/**
 * Output log entry to console (CloudWatch will capture)
 */
function outputLog(entry: LogEntry): void {
  // Use console methods that map to CloudWatch log levels
  switch (entry.level) {
    case 'debug':
      console.debug(JSON.stringify(entry));
      break;
    case 'info':
      console.info(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    case 'error':
      console.error(JSON.stringify(entry));
      break;
  }
}

/**
 * Logger instance with structured methods
 */
export const logger = {
  debug(event: string, context?: LogContext): void {
    outputLog(createLogEntry('debug', event, context));
  },

  info(event: string, context?: LogContext): void {
    outputLog(createLogEntry('info', event, context));
  },

  warn(event: string, context?: LogContext): void {
    outputLog(createLogEntry('warn', event, context));
  },

  error(event: string, context?: LogContext): void {
    outputLog(createLogEntry('error', event, context));
  },

  /**
   * Log an MCP request start
   */
  requestStart(method: string, context?: Partial<LogContext>): void {
    this.info('mcp_request_start', { method, ...context });
  },

  /**
   * Log an MCP request completion
   */
  requestComplete(method: string, duration_ms: number, status: LogContext['status'], context?: Partial<LogContext>): void {
    this.info('mcp_request_complete', { method, duration_ms, status, ...context });
  },

  /**
   * Log a tool execution
   */
  toolExecution(tool: string, duration_ms: number, status: LogContext['status'], context?: Partial<LogContext>): void {
    this.info('mcp_tool_execution', { tool, duration_ms, status, ...context });
  },

  /**
   * Log an authentication event
   */
  auth(status: 'success' | 'failed' | 'rate_limited', apiKeyPrefix?: string, context?: Partial<LogContext>): void {
    const level = status === 'success' ? 'info' : 'warn';
    this[level]('mcp_auth', { status, apiKeyPrefix, ...context });
  },

  /**
   * Log a rate limit event
   */
  rateLimit(apiKeyPrefix: string, requestCount: number, limit: number, context?: Partial<LogContext>): void {
    this.warn('mcp_rate_limit', {
      apiKeyPrefix,
      requestCount,
      limit,
      status: 'rate_limited',
      ...context,
    });
  },
};

export default logger;
