/**
 * API Error Handler with Sentry Integration
 *
 * Centralized error handling for API routes with automatic Sentry capture.
 * Ensures all API errors are logged with rich context for debugging.
 *
 * @example
 * ```typescript
 * import { handleApiError, ApiError } from "@/lib/api-error-handler";
 *
 * export async function POST(request: Request) {
 *   try {
 *     // ... logic
 *   } catch (error) {
 *     return handleApiError(error, {
 *       route: "/api/v1/invoices",
 *       method: "POST",
 *       request,
 *     });
 *   }
 * }
 * ```
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * API Error class with status code support.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * HTTP status codes for common error scenarios.
 */
export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Context for error handling.
 */
interface ErrorContext {
  /** API route path (e.g., "/api/v1/invoices") */
  route: string;
  /** HTTP method */
  method: string;
  /** Request object for additional context */
  request?: NextRequest | Request;
  /** Additional metadata for Sentry */
  extra?: Record<string, unknown>;
  /** User ID if available */
  userId?: string;
  /** Business ID if available */
  businessId?: string;
  /** Domain tag for filtering */
  domain?: string;
}

/**
 * Extract domain from route path.
 */
function extractDomain(route: string): string {
  const match = route.match(/^\/api\/[^/]+\/([^/]+)/);
  return match?.[1] || "unknown";
}

/**
 * Sanitize headers for Sentry (PII protection).
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("authorization") ||
      lowerKey.includes("cookie") ||
      lowerKey.includes("token") ||
      lowerKey.includes("key") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("password")
    ) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

/**
 * Handle API error with Sentry capture.
 *
 * Captures the error to Sentry with full context and returns a safe
 * JSON response to the client.
 *
 * @param error - The error to handle
 * @param context - Context for logging and debugging
 * @returns NextResponse with appropriate status code
 */
export function handleApiError(
  error: unknown,
  context: ErrorContext
): NextResponse {
  const { route, method, request, extra, userId, businessId, domain } = context;

  // Determine error type and status
  const isApiError = error instanceof ApiError;
  const statusCode = isApiError ? error.statusCode : HttpStatus.INTERNAL_ERROR;
  const errorMessage = error instanceof Error ? error.message : "Internal server error";
  const errorCode = isApiError && error.code ? error.code : "INTERNAL_ERROR";

  // Build Sentry context
  const sentryContext: Sentry.Context = {
    tags: {
      api: "true",
      route,
      method: method.toUpperCase(),
      domain: domain || extractDomain(route),
      status_code: statusCode.toString(),
      error_type: error instanceof Error ? error.constructor.name : "unknown",
      code: errorCode,
    },
    extra: {
      route,
      method,
      statusCode,
      ...extra,
    },
    user: userId ? { id: userId } : undefined,
  };

  // Add request context if available
  if (request) {
    Object.assign(sentryContext.extra as Record<string, unknown>, {
      url: request.url,
      headers: sanitizeHeaders(request.headers),
    });
  }

  // Add business context if available
  if (businessId) {
    Object.assign(sentryContext.extra as Record<string, unknown>, {
      business_id: businessId,
    });
  }

  // Capture to Sentry (only for 5xx errors or unhandled exceptions)
  if (statusCode >= 500 || !isApiError) {
    Sentry.captureException(error, sentryContext);
  } else {
    // For 4xx client errors, just log a breadcrumb
    Sentry.addBreadcrumb({
      message: `API client error: ${method} ${route}`,
      category: "api.error",
      level: "warning",
      data: {
        status_code: statusCode,
        error_code: errorCode,
        error_message: errorMessage,
      },
    });
  }

  // Log to console for server-side visibility
  console.error(`[API Error] ${method} ${route} → ${statusCode}:`, error);

  // Return safe response to client
  const responseBody: {
    success: false;
    error: string;
    code: string;
    details?: Record<string, unknown>;
    request_id?: string;
  } = {
    success: false,
    error: statusCode >= 500 ? "Internal server error" : errorMessage,
    code: errorCode,
  };

  // Add Sentry event ID for 5xx errors (helps support lookup)
  if (statusCode >= 500) {
    const eventId = Sentry.lastEventId();
    if (eventId) {
      responseBody.request_id = eventId;
    }
  }

  // Add client-safe error details for 4xx errors
  if (statusCode < 500 && isApiError && error.details) {
    responseBody.details = error.details;
  }

  return NextResponse.json(responseBody, { status: statusCode });
}

/**
 * Wrapper for API route handlers with automatic error handling.
 *
 * @example
 * ```typescript
 * import { withErrorHandler } from "@/lib/api-error-handler";
 *
 * export const POST = withErrorHandler(
 *   async (request) => {
 *     // Your handler logic
 *     return NextResponse.json({ success: true });
 *   },
 *   { route: "/api/v1/invoices", method: "POST", domain: "invoices" }
 * );
 * ```
 */
export function withErrorHandler(
  handler: (request: NextRequest) => Promise<NextResponse>,
  context: Omit<ErrorContext, "method"> & { method: string }
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      return await handler(request);
    } catch (error) {
      return handleApiError(error, {
        ...context,
        request,
      });
    }
  };
}

/**
 * Create a domain-specific error handler.
 *
 * Pre-binds route and domain for cleaner API route code.
 *
 * @example
 * ```typescript
 * // At top of route file
 * const handleError = createDomainErrorHandler("invoices");
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     // ... logic
 *   } catch (error) {
 *     return handleError(error, request, "POST");
 *   }
 * }
 * ```
 */
export function createDomainErrorHandler(domain: string, baseRoute?: string) {
  return function handleDomainError(
    error: unknown,
    request: NextRequest,
    method: string,
    extra?: Record<string, unknown>
  ): NextResponse {
    const route = baseRoute || request.nextUrl.pathname;
    return handleApiError(error, {
      route,
      method,
      domain,
      request,
      extra,
    });
  };
}
