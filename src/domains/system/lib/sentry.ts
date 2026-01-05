/**
 * Sentry Helper Functions for FinanSEAL
 *
 * Provides typed wrappers for common Sentry operations including:
 * - User context management (Clerk integration)
 * - Business context for multi-tenant errors
 * - Domain tagging for error filtering
 *
 * @see specs/003-sentry-integration/research.md
 */

import * as Sentry from "@sentry/nextjs";

/**
 * User context for Sentry error tracking.
 * Aligned with Clerk user model.
 */
export interface SentryUserContext {
  /** Clerk user ID */
  id: string;
  /** Username (optional, for display in Sentry) */
  username?: string;
  /** IP address (optional, for geo-location) */
  ip_address?: string;
}

/**
 * Business context for multi-tenant error tracking.
 */
export interface SentryBusinessContext {
  /** Business ID from database */
  id: string;
  /** Business name for readability */
  name?: string;
  /** User's role within the business */
  role?: string;
}

/**
 * Set the current user context in Sentry.
 *
 * Call this after successful Clerk authentication to associate
 * errors with the authenticated user.
 *
 * @example
 * ```ts
 * // In layout.tsx or auth provider
 * const { userId } = await auth();
 * if (userId) {
 *   setUserContext({ id: userId });
 * }
 * ```
 */
export function setUserContext(user: SentryUserContext | null): void {
  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.username,
      ip_address: user.ip_address,
    });
  } else {
    // Clear user context on logout
    Sentry.setUser(null);
  }
}

/**
 * Set business context for multi-tenant error tracking.
 *
 * This context helps identify which business is affected by errors,
 * enabling faster debugging in a multi-tenant environment.
 *
 * @example
 * ```ts
 * // After loading business context
 * setBusinessContext({
 *   id: businessId,
 *   name: businessName,
 *   role: userRole
 * });
 * ```
 */
export function setBusinessContext(business: SentryBusinessContext | null): void {
  if (business) {
    Sentry.setContext("business", {
      id: business.id,
      name: business.name,
      role: business.role,
    });
    // Also set as tags for easier filtering in Sentry UI
    Sentry.setTag("business_id", business.id);
    if (business.role) {
      Sentry.setTag("user_role", business.role);
    }
  } else {
    // Clear business context
    Sentry.setContext("business", null);
    Sentry.setTag("business_id", undefined);
    Sentry.setTag("user_role", undefined);
  }
}

/**
 * Domain tags for filtering errors by application domain.
 * Maps to the domain-driven architecture in src/domains/
 */
export type DomainTag =
  | "account-management"
  | "analytics"
  | "applications"
  | "audit"
  | "chat"
  | "expense-claims"
  | "invoices"
  | "system"
  | "tasks"
  | "users"
  | "utilities";

/**
 * Set the domain tag for the current scope.
 *
 * Use this to tag errors with their originating domain,
 * enabling filtering in the Sentry dashboard.
 *
 * @example
 * ```ts
 * // In domain-specific code
 * setDomainTag("invoices");
 * // All subsequent errors will be tagged with domain: invoices
 * ```
 */
export function setDomainTag(domain: DomainTag): void {
  Sentry.setTag("domain", domain);
}

/**
 * Capture an exception with domain context.
 *
 * Convenience wrapper that captures an exception with
 * domain tag and optional extra context.
 *
 * @example
 * ```ts
 * try {
 *   await processInvoice(invoiceId);
 * } catch (error) {
 *   captureExceptionWithDomain(error, "invoices", {
 *     invoiceId,
 *     userId,
 *   });
 *   throw error; // Re-throw if needed
 * }
 * ```
 */
export function captureExceptionWithDomain(
  error: Error | unknown,
  domain: DomainTag,
  extra?: Record<string, unknown>
): string {
  return Sentry.captureException(error, {
    tags: {
      domain,
    },
    extra,
  });
}

/**
 * Capture a message with domain context.
 *
 * Use for non-error events that should be tracked in Sentry.
 *
 * @example
 * ```ts
 * captureMessageWithDomain(
 *   "User exceeded rate limit",
 *   "system",
 *   "warning",
 *   { userId, endpoint }
 * );
 * ```
 */
export function captureMessageWithDomain(
  message: string,
  domain: DomainTag,
  level: Sentry.SeverityLevel = "info",
  extra?: Record<string, unknown>
): string {
  return Sentry.captureMessage(message, {
    level,
    tags: {
      domain,
    },
    extra,
  });
}

/**
 * Start a new Sentry transaction/span for performance monitoring.
 *
 * Use for custom performance tracking of operations that
 * aren't automatically instrumented.
 *
 * @example
 * ```ts
 * const span = startTransaction("process-invoice", "invoice.process");
 * try {
 *   await processInvoice(invoiceId);
 *   span?.setStatus("ok");
 * } catch (error) {
 *   span?.setStatus("internal_error");
 *   throw error;
 * } finally {
 *   span?.end();
 * }
 * ```
 */
export function startTransaction(
  name: string,
  op: string,
  data?: Record<string, string | number | boolean>
): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({
    name,
    op,
    attributes: data,
  });
}

/**
 * Add breadcrumb for debugging context.
 *
 * Breadcrumbs are logged events that provide context
 * leading up to an error.
 *
 * @example
 * ```ts
 * addBreadcrumb("user.action", "Clicked submit button", "ui");
 * addBreadcrumb("api.call", "Fetched invoices", "http", { count: 10 });
 * ```
 */
export function addBreadcrumb(
  message: string,
  category: string,
  type: Sentry.Breadcrumb["type"] = "default",
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    type,
    data,
    level: "info",
  });
}

/**
 * Flush all pending Sentry events.
 *
 * Call this before serverless function termination to ensure
 * all events are sent.
 *
 * @example
 * ```ts
 * // In API route before returning response
 * await flushSentryEvents();
 * return NextResponse.json({ success: true });
 * ```
 */
export async function flushSentryEvents(timeout = 2000): Promise<boolean> {
  return Sentry.flush(timeout);
}

/**
 * Initialize Sentry context for a new request.
 *
 * Call this early in request handling to set up user and business context.
 * Typically used in middleware or layout components.
 *
 * @example
 * ```ts
 * // In middleware or layout
 * initRequestContext({
 *   userId: clerkUserId,
 *   businessId: selectedBusinessId,
 *   businessName: businessName,
 *   role: userRole,
 * });
 * ```
 */
export function initRequestContext(context: {
  userId?: string;
  username?: string;
  businessId?: string;
  businessName?: string;
  role?: string;
}): void {
  if (context.userId) {
    setUserContext({
      id: context.userId,
      username: context.username,
    });
  }

  if (context.businessId) {
    setBusinessContext({
      id: context.businessId,
      name: context.businessName,
      role: context.role,
    });
  }
}

/**
 * Clear all Sentry context.
 *
 * Call this on logout or when switching users to prevent
 * context leakage between sessions.
 */
export function clearContext(): void {
  setUserContext(null);
  setBusinessContext(null);
  Sentry.setTag("domain", undefined);
}
