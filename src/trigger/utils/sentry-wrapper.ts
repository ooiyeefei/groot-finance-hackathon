/**
 * Sentry Integration for Trigger.dev Tasks
 *
 * Provides error capture and performance monitoring for background jobs.
 * Uses @sentry/node since Trigger.dev runs in a Node.js worker environment.
 *
 * @see specs/003-sentry-integration/research.md
 */

import * as Sentry from "@sentry/node";

// Initialize Sentry for Trigger.dev runtime
// This runs once when the module is first imported
if (!process.env.SENTRY_INITIALIZED_TRIGGER) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // 10% sampling in production, 100% in development
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    // Add runtime tag to distinguish from Next.js errors
    initialScope: {
      tags: {
        runtime: "trigger-dev",
      },
    },
  });
  process.env.SENTRY_INITIALIZED_TRIGGER = "true";
}

/**
 * Domain tags for Trigger.dev tasks.
 * Maps to src/domains/ structure.
 */
export type TaskDomain =
  | "invoices"
  | "expense-claims"
  | "applications"
  | "system"
  | "analytics"
  | "chat";

/**
 * Options for wrapping a Trigger.dev task with Sentry.
 */
export interface SentryTaskOptions {
  /** Domain this task belongs to (for filtering in Sentry) */
  domain: TaskDomain;
  /** Task identifier (usually same as task.id) */
  taskId: string;
  /** Extra context to include with every error */
  defaultContext?: Record<string, unknown>;
}

/**
 * Captures an exception in a Trigger.dev task with domain context.
 *
 * @example
 * ```ts
 * try {
 *   await processDocument(documentId);
 * } catch (error) {
 *   captureTaskException(error, "invoices", "extract-invoice-data", {
 *     documentId,
 *     userId,
 *   });
 *   throw error; // Re-throw for Trigger.dev retry handling
 * }
 * ```
 */
export function captureTaskException(
  error: Error | unknown,
  domain: TaskDomain,
  taskId: string,
  extra?: Record<string, unknown>
): string {
  return Sentry.captureException(error, {
    tags: {
      domain,
      task: taskId,
      runtime: "trigger-dev",
    },
    extra: {
      ...extra,
      taskId,
    },
  });
}

/**
 * Sets task context for all subsequent Sentry events.
 *
 * Call this at the start of a task to tag all errors with
 * the task's domain and metadata.
 *
 * @example
 * ```ts
 * export const extractInvoiceData = task({
 *   id: "extract-invoice-data",
 *   run: async (payload) => {
 *     setTaskContext("invoices", "extract-invoice-data", {
 *       documentId: payload.documentId,
 *     });
 *     // ... task logic
 *   },
 * });
 * ```
 */
export function setTaskContext(
  domain: TaskDomain,
  taskId: string,
  metadata?: Record<string, unknown>
): void {
  Sentry.setTag("domain", domain);
  Sentry.setTag("task", taskId);
  Sentry.setTag("runtime", "trigger-dev");

  if (metadata) {
    Sentry.setContext("task", {
      id: taskId,
      domain,
      ...metadata,
    });
  }
}

/**
 * Clears task-specific context.
 *
 * Call this at the end of a task or in cleanup.
 */
export function clearTaskContext(): void {
  Sentry.setTag("domain", undefined);
  Sentry.setTag("task", undefined);
  Sentry.setContext("task", null);
}

/**
 * Wraps a Trigger.dev task run function with Sentry error capture.
 *
 * This is the recommended way to instrument Trigger.dev tasks.
 * It automatically:
 * - Sets domain and task tags
 * - Captures any uncaught exceptions
 * - Preserves the original error for Trigger.dev retry handling
 *
 * @example
 * ```ts
 * import { task } from "@trigger.dev/sdk";
 * import { withSentry } from "./utils/sentry-wrapper";
 *
 * export const extractInvoiceData = task({
 *   id: "extract-invoice-data",
 *   run: withSentry(
 *     { domain: "invoices", taskId: "extract-invoice-data" },
 *     async (payload) => {
 *       // Your task logic here
 *       return { success: true };
 *     }
 *   ),
 * });
 * ```
 */
export function withSentry<TPayload, TResult>(
  options: SentryTaskOptions,
  fn: (payload: TPayload) => Promise<TResult>
): (payload: TPayload) => Promise<TResult> {
  return async (payload: TPayload): Promise<TResult> => {
    const { domain, taskId, defaultContext } = options;

    // Set context at the start of the task
    setTaskContext(domain, taskId, {
      ...defaultContext,
      payloadKeys: payload ? Object.keys(payload as object) : [],
    });

    try {
      const result = await fn(payload);
      return result;
    } catch (error) {
      // Capture the exception with full context
      captureTaskException(error, domain, taskId, {
        ...defaultContext,
        payload:
          typeof payload === "object"
            ? sanitizePayload(payload as Record<string, unknown>)
            : payload,
      });

      // Re-throw so Trigger.dev can handle retries
      throw error;
    } finally {
      // Ensure events are sent before the task ends
      await Sentry.flush(2000);
    }
  };
}

/**
 * Sanitizes a payload object by removing potentially sensitive fields.
 * Used before including payload in Sentry context.
 */
function sanitizePayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "auth",
    "credential",
    "api_key",
    "apiKey",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((s) => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Adds a breadcrumb for task debugging.
 *
 * @example
 * ```ts
 * addTaskBreadcrumb("Started OCR processing", { documentId });
 * // ... later
 * addTaskBreadcrumb("OCR complete", { lineCount: 25 });
 * ```
 */
export function addTaskBreadcrumb(
  message: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    message,
    category: "task",
    type: "info",
    data,
    level: "info",
  });
}

/**
 * Captures a non-error event in a task.
 *
 * Use for important events that aren't errors but should be tracked.
 *
 * @example
 * ```ts
 * captureTaskMessage("Document processing completed", "invoices", "info", {
 *   documentId,
 *   processingTime: 5000,
 * });
 * ```
 */
export function captureTaskMessage(
  message: string,
  domain: TaskDomain,
  level: Sentry.SeverityLevel = "info",
  extra?: Record<string, unknown>
): string {
  return Sentry.captureMessage(message, {
    level,
    tags: {
      domain,
      runtime: "trigger-dev",
    },
    extra,
  });
}
