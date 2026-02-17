/**
 * Convex Error Handler with Sentry Integration
 *
 * Wrapper for Convex HTTP actions and queries with Sentry error capture.
 * Ensures Convex errors are captured with proper context.
 *
 * Note: Convex runs its own serverless runtime separate from Next.js.
 * For full Sentry integration in Convex functions, use Sentry's Node SDK
 * within Convex actions or HTTP endpoints.
 *
 * @see https://docs.convex.dev/functions/http-actions
 */

import * as Sentry from "@sentry/node";

/**
 * Convex function context for error tracking.
 */
interface ConvexContext {
  /** Function name (e.g., "invoices.create") */
  function: string;
  /** Function type */
  type: "query" | "mutation" | "action" | "http";
  /** User ID from ctx.auth */
  userId?: string;
  /** Business ID from context */
  businessId?: string;
  /** Domain tag */
  domain?: string;
  /** Additional metadata */
  extra?: Record<string, unknown>;
}

/**
 * Initialize Sentry for Convex environment.
 * Call this at the start of Convex actions that need error tracking.
 *
 * @example
 * ```typescript
 * // In a Convex action
 * import { initSentryForConvex } from "@/lib/convex-error-handler";
 *
 * export const myAction = action({
 *   args: { ... },
 *   returns: v.any(),
 *   handler: async (ctx, args) => {
 *     initSentryForConvex();
 *     // ... your logic
 *   },
 * });
 * ```
 */
export function initSentryForConvex(): void {
  // Only initialize once
  if (Sentry.getCurrentHub().getClient()) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONVEX_ENVIRONMENT || "production",
    tracesSampleRate: 0.1,
    // Disable auto-instrumentation - Convex manages its own runtime
    integrations: [],
  });
}

/**
 * Capture error from Convex function.
 *
 * @param error - The error to capture
 * @param context - Convex function context
 * @returns Sentry event ID (for logging)
 *
 * @example
 * ```typescript
 * import { captureConvexError } from "@/lib/convex-error-handler";
 *
 * try {
 *   await ctx.runMutation(api.functions.invoices.create, args);
 * } catch (error) {
 *   captureConvexError(error, {
 *     function: "invoices.create",
 *     type: "mutation",
 *     userId: user._id,
 *     domain: "invoices",
 *   });
 *   throw error;
 * }
 * ```
 */
export function captureConvexError(
  error: unknown,
  context: ConvexContext
): string | null {
  // Initialize Sentry if not already done
  initSentryForConvex();

  const eventId = Sentry.captureException(error, {
    tags: {
      convex: "true",
      function: context.function,
      type: context.type,
      domain: context.domain || context.function.split(".")[0] || "unknown",
    },
    extra: {
      convex_function: context.function,
      convex_type: context.type,
      ...context.extra,
    },
    user: context.userId ? { id: context.userId } : undefined,
  });

  return eventId;
}

/**
 * Wrap a Convex function with error handling.
 *
 * @param fn - The function to wrap
 * @param context - Context for error tracking
 * @returns Wrapped function with error capture
 *
 * @example
 * ```typescript
 * import { withConvexErrorHandler } from "@/lib/convex-error-handler";
 *
 * export const createInvoice = mutation({
 *   args: { ... },
 *   returns: v.id("invoices"),
 *   handler: withConvexErrorHandler(
 *     async (ctx, args) => {
 *       // Your mutation logic
 *       return await ctx.db.insert("invoices", args);
 *     },
 *     { function: "invoices.create", type: "mutation", domain: "invoices" }
 *   ),
 * });
 * ```
 */
export function withConvexErrorHandler<TArgs, TReturn>(
  fn: (ctx: any, args: TArgs) => Promise<TReturn>,
  context: ConvexContext
): (ctx: any, args: TArgs) => Promise<TReturn> {
  return async (ctx: any, args: TArgs): Promise<TReturn> => {
    try {
      return await fn(ctx, args);
    } catch (error) {
      // Extract user and business from context if available
      const userId = ctx.auth?.getUserIdentity()?.subject;

      captureConvexError(error, {
        ...context,
        userId,
        extra: {
          ...context.extra,
          args: sanitizeArgs(args),
        },
      });

      // Re-throw to maintain original behavior
      throw error;
    }
  };
}

/**
 * Sanitize arguments for logging (remove sensitive data).
 */
function sanitizeArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") {
    return args;
  }

  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "key",
    "credit_card",
    "ssn",
    "apiKey",
    "api_key",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeArgs(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log breadcrumb for Convex operations.
 *
 * Useful for tracking Convex function calls without full error capture.
 *
 * @param message - Breadcrumb message
 * @param category - Category (e.g., "convex.query", "convex.mutation")
 * @param data - Additional data
 */
export function convexBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  initSentryForConvex();

  Sentry.addBreadcrumb({
    message,
    category,
    level: "info",
    data,
  });
}

/**
 * Set Convex context for the current scope.
 *
 * @param ctx - Convex context (function name, user, etc.)
 */
export function setConvexScope(context: ConvexContext): void {
  initSentryForConvex();

  const scope = Sentry.getCurrentScope();

  scope.setTags({
    convex: "true",
    function: context.function,
    type: context.type,
    domain: context.domain || "unknown",
  });

  scope.setExtras({
    convex_function: context.function,
    convex_type: context.type,
    ...context.extra,
  });

  if (context.userId) {
    scope.setUser({ id: context.userId });
  }
}

/**
 * Flush Sentry events (call before Convex function ends).
 *
 * Important for serverless environments where the process may freeze.
 *
 * @param timeout - Maximum time to wait for flush (ms)
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  try {
    return await Sentry.flush(timeout);
  } catch {
    return false;
  }
}
