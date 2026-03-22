/**
 * MCP Server Authentication & Authorization
 *
 * Handles API key validation against Convex on every request
 * for immediate revocation support. No caching.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { logger } from './logger.js';

// Convex client - initialized lazily
let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is required');
    }
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

/**
 * Authentication context returned after successful validation
 */
export interface AuthContext {
  apiKeyId: string;
  businessId: string;
  businessName: string;
  permissions: string[];
  rateLimitPerMinute: number;
  keyPrefix: string;
  // Optional user-level fields (populated by internal service auth when available)
  userId?: string;
  userName?: string;
  userRole?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  context?: AuthContext;
  error?: {
    code: string;
    message: string;
  };
  rateLimitInfo?: {
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  };
}

/**
 * Extract API key from Authorization header
 * Expects format: "Bearer fsk_xxxxx..."
 */
export function extractApiKey(authHeader: string | undefined): { prefix: string; key: string } | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const key = parts[1];
  // API keys should be in format: fsk_xxxxxxxxxxxxxx (prefix_key)
  if (!key.startsWith('fsk_') || key.length < 20) {
    return null;
  }

  // Extract prefix (first 8 chars including fsk_)
  const prefix = key.substring(0, 8);

  return { prefix, key };
}

/**
 * Hash an API key for comparison
 * Uses bcrypt with a fixed salt for deterministic hashing
 */
export async function hashApiKey(key: string): Promise<string> {
  // Use SHA-256 for deterministic hashing (bcrypt is for storage)
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Authenticate an API key against Convex
 * Called on every request for immediate revocation support
 */
export async function authenticateApiKey(authHeader: string | undefined): Promise<AuthResult> {
  const extracted = extractApiKey(authHeader);

  if (!extracted) {
    logger.auth('failed', undefined, { reason: 'invalid_header' });
    return {
      authenticated: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing Authorization header. Expected: Bearer fsk_...',
      },
    };
  }

  try {
    const client = getConvexClient();

    // Hash the key for comparison
    const keyHash = await hashApiKey(extracted.key);

    // Validate against Convex
    const result = await client.query(api.functions.mcpApiKeys.validateApiKey, {
      keyPrefix: extracted.prefix,
      keyHash,
    });

    if (!result.valid) {
      logger.auth('failed', extracted.prefix, { reason: result.error });
      return {
        authenticated: false,
        error: {
          code: 'UNAUTHORIZED',
          message: getAuthErrorMessage(result.error),
        },
      };
    }

    // Check rate limit
    const rateLimitResult = await client.mutation(api.functions.mcpApiKeys.checkRateLimit, {
      apiKeyId: result.apiKeyId,
      rateLimitPerMinute: result.rateLimitPerMinute,
    });

    if (!rateLimitResult.allowed) {
      logger.rateLimit(extracted.prefix, result.rateLimitPerMinute, result.rateLimitPerMinute, {
        retryAfter: rateLimitResult.retryAfter,
      });
      return {
        authenticated: true,
        context: {
          apiKeyId: result.apiKeyId,
          businessId: result.businessId,
          businessName: result.businessName,
          permissions: result.permissions,
          rateLimitPerMinute: result.rateLimitPerMinute,
          keyPrefix: result.keyPrefix,
        },
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`,
        },
        rateLimitInfo: {
          remaining: 0,
          resetAt: rateLimitResult.resetAt,
          retryAfter: rateLimitResult.retryAfter,
        },
      };
    }

    logger.auth('success', extracted.prefix, { businessId: result.businessId });

    return {
      authenticated: true,
      context: {
        apiKeyId: result.apiKeyId,
        businessId: result.businessId,
        businessName: result.businessName,
        permissions: result.permissions,
        rateLimitPerMinute: result.rateLimitPerMinute,
        keyPrefix: result.keyPrefix,
      },
      rateLimitInfo: {
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
      },
    };
  } catch (error) {
    logger.error('auth_error', {
      apiKeyPrefix: extracted.prefix,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      authenticated: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service unavailable',
      },
    };
  }
}

/**
 * Update lastUsedAt after successful request
 */
export async function updateApiKeyUsage(apiKeyId: string): Promise<void> {
  try {
    const client = getConvexClient();
    await client.mutation(api.functions.mcpApiKeys.updateLastUsed, {
      apiKeyId: apiKeyId as any,
    });
  } catch (error) {
    // Non-critical - log but don't fail
    logger.warn('update_last_used_failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Authenticate an internal service-to-service call.
 *
 * Used by Layer 2 (Convex actions) to call MCP tools without per-business API keys.
 * Validates a shared secret (MCP_INTERNAL_SERVICE_KEY env var) and accepts
 * businessId from the request body instead of from an API key.
 *
 * Returns an AuthResult with wildcard permissions (all tools allowed, no rate limit).
 */
export function authenticateInternalService(
  internalKeyHeader: string | undefined,
  businessId: string | undefined
): AuthResult {
  const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY;

  if (!serviceKey) {
    return {
      authenticated: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal service key not configured',
      },
    };
  }

  if (!internalKeyHeader || internalKeyHeader !== serviceKey) {
    return {
      authenticated: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid internal service key',
      },
    };
  }

  if (!businessId) {
    return {
      authenticated: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'businessId is required for internal service calls',
      },
    };
  }

  logger.auth('success', 'internal-service', { businessId });

  return {
    authenticated: true,
    context: {
      apiKeyId: 'internal-service',
      businessId,
      businessName: 'Internal Service',
      permissions: ['*'], // All tools allowed
      rateLimitPerMinute: 9999, // No practical rate limit
      keyPrefix: 'internal',
    },
  };
}

/**
 * Tools requiring manager+ role (mirrors tool-factory MANAGER_TOOLS)
 * 032-mcp-first: RBAC enforcement at MCP level for internal service calls
 */
const MANAGER_ROLE_TOOLS = new Set([
  'get_employee_expenses',
  'get_team_summary',
  'get_late_approvals',
  'compare_team_spending',
  'analyze_cash_flow',
  'forecast_cash_flow',
  'analyze_team_spending',
  'generate_report_pdf',
  'check_budget_status',
]);

/**
 * Tools requiring finance_admin+ role (mirrors tool-factory FINANCE_TOOLS)
 */
const FINANCE_ROLE_TOOLS = new Set([
  'get_invoices',
  'get_sales_invoices',
  'get_transactions',
  'get_vendors',
  'get_ar_summary',
  'get_ap_aging',
  'get_business_transactions',
  'detect_anomalies',
  'analyze_vendor_risk',
  'run_bank_reconciliation',
  'accept_recon_match',
  'show_recon_status',
  'set_budget',
  'analyze_trends',
]);

/**
 * Check if user has permission for a specific tool.
 *
 * For API key auth: checks permissions array from the API key.
 * For internal service auth (wildcard permissions): checks _userRole against
 * role-based tool access rules (defense-in-depth with tool-factory filtering).
 */
export function hasPermission(context: AuthContext, toolName: string): boolean {
  // API key auth: check explicit permissions
  if (!context.permissions.includes('*')) {
    return context.permissions.includes(toolName);
  }

  // Internal service auth (wildcard): check role-based access if userRole is provided
  if (context.userRole) {
    const role = context.userRole.toLowerCase();
    if (FINANCE_ROLE_TOOLS.has(toolName) && !['finance_admin', 'owner'].includes(role)) {
      return false;
    }
    if (MANAGER_ROLE_TOOLS.has(toolName) && !['manager', 'finance_admin', 'owner'].includes(role)) {
      return false;
    }
  }

  return true;
}

/**
 * Get user-friendly error message for auth errors
 */
function getAuthErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'API_KEY_NOT_FOUND':
      return 'Invalid API key';
    case 'API_KEY_REVOKED':
      return 'API key has been revoked';
    case 'API_KEY_EXPIRED':
      return 'API key has expired';
    case 'API_KEY_INVALID':
      return 'Invalid API key';
    case 'BUSINESS_NOT_FOUND':
      return 'Business not found';
    default:
      return 'Authentication failed';
  }
}

// Legacy exports for backward compatibility
export interface AuthorizationResult {
  authorized: boolean;
  businessId?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Validate business ID authorization (legacy - for backward compatibility)
 */
export function validateBusinessAccess(businessId: string | undefined): AuthorizationResult {
  if (!businessId) {
    return {
      authorized: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'business_id is required for authorization',
      },
    };
  }

  if (businessId.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(businessId)) {
    return {
      authorized: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid business_id format',
      },
    };
  }

  return {
    authorized: true,
    businessId,
  };
}

/**
 * Get date range with defaults
 */
export function getDateRange(
  dateRange?: { start: string; end: string }
): { start: string; end: string } {
  if (dateRange) {
    return dateRange;
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/**
 * Convert sensitivity to z-score threshold
 */
export function sensitivityToZScore(sensitivity: 'low' | 'medium' | 'high'): number {
  switch (sensitivity) {
    case 'low':
      return 3.0;
    case 'medium':
      return 2.0;
    case 'high':
      return 1.5;
    default:
      return 2.0;
  }
}
