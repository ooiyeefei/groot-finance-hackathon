/**
 * Centralized Logging Utility
 * Provides secure, environment-aware logging with automatic PII redaction
 *
 * SECURITY PRINCIPLES:
 * 1. No sensitive data in production logs (tokens, passwords, full user IDs)
 * 2. Minimal logging in production (errors and critical operations only)
 * 3. Verbose logging in development for debugging
 * 4. Automatic redaction of common sensitive patterns
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enabledInProduction: boolean;
  redactSensitive: boolean;
}

/**
 * Determine if we're in production environment
 */
const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Get minimum log level based on environment
 * Production: Only errors and warnings
 * Development: All levels
 */
const getMinLogLevel = (): LogLevel => {
  if (isProduction()) {
    return 'warn'; // Production: Only warnings and errors
  }
  return 'debug'; // Development: All logs
};

/**
 * Check if log level should be output
 */
const shouldLog = (level: LogLevel): boolean => {
  const levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  const minLevel = getMinLogLevel();
  return levelPriority[level] >= levelPriority[minLevel];
};

/**
 * Redact sensitive information from log messages
 * SECURITY: Prevents accidental exposure of credentials, tokens, and PII
 */
const redactSensitive = (value: any): any => {
  if (typeof value === 'string') {
    return value
      // Redact JWT tokens (format: xxx.yyy.zzz)
      .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]')
      // Redact API keys (common patterns)
      .replace(/[a-z0-9]{32,}/gi, (match) => {
        if (match.length > 20) return '[REDACTED_KEY]';
        return match;
      })
      // Redact Clerk User IDs (show prefix only for debugging)
      .replace(/(user_[A-Za-z0-9]{5})[A-Za-z0-9]{22}/g, '$1***')
      // Redact UUIDs partially (show first 8 chars for debugging)
      .replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$1-****')
      // Redact email addresses (show domain only)
      .replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)/g, '***@$2')
      // Redact passwords/secrets (common field names)
      .replace(/(password|secret|token|key|credential)["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, '$1: [REDACTED]');
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(redactSensitive);
    }

    const redacted: any = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();

      // Completely redact sensitive fields
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('credential')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitive(val);
      }
    }
    return redacted;
  }

  return value;
};

/**
 * Format log message with prefix and timestamp
 */
const formatMessage = (prefix: string, ...args: any[]): any[] => {
  const timestamp = new Date().toISOString();

  // In production, always redact sensitive data
  if (isProduction()) {
    const redacted = args.map(redactSensitive);
    return [`[${timestamp}] [${prefix}]`, ...redacted];
  }

  // In development, show full logs
  return [`[${prefix}]`, ...args];
};

/**
 * Logger class with namespace support
 */
class Logger {
  constructor(private namespace: string) {}

  /**
   * Debug logs - Development only
   * Use for verbose debugging information
   */
  debug(...args: any[]): void {
    if (!shouldLog('debug')) return;
    console.log(...formatMessage(this.namespace, ...args));
  }

  /**
   * Info logs - Development only
   * Use for general information
   */
  info(...args: any[]): void {
    if (!shouldLog('info')) return;
    console.log(...formatMessage(this.namespace, ...args));
  }

  /**
   * Warning logs - Production and Development
   * Use for recoverable errors and important alerts
   */
  warn(...args: any[]): void {
    if (!shouldLog('warn')) return;
    console.warn(...formatMessage(this.namespace, ...args));
  }

  /**
   * Error logs - Production and Development
   * Use for errors that need attention
   */
  error(...args: any[]): void {
    if (!shouldLog('error')) return;
    console.error(...formatMessage(this.namespace, ...args));
  }

  /**
   * Create child logger with extended namespace
   */
  child(childNamespace: string): Logger {
    return new Logger(`${this.namespace}:${childNamespace}`);
  }
}

/**
 * Create a logger instance for a specific module
 *
 * @example
 * const log = createLogger('Analytics');
 * log.debug('Processing analytics...'); // Development only
 * log.error('Analytics failed:', error); // Production and development
 */
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

/**
 * Default logger for general use
 */
export const logger = createLogger('App');

/**
 * Utility function to safely log objects with sensitive data redaction
 */
export function safeStringify(obj: any): string {
  try {
    const redacted = redactSensitive(obj);
    return JSON.stringify(redacted, null, 2);
  } catch (error) {
    return '[Unable to stringify object]';
  }
}

/**
 * MIGRATION GUIDE:
 *
 * Before:
 * console.log('[Analytics Engine] Processing...', data);
 * console.error('[Analytics Engine] Failed:', error);
 *
 * After:
 * const log = createLogger('Analytics:Engine');
 * log.debug('Processing...', data); // Only in development
 * log.error('Failed:', error); // Production and development
 *
 * Benefits:
 * - Automatic environment-based filtering
 * - Sensitive data redaction in production
 * - Consistent log format
 * - Namespace organization
 */
