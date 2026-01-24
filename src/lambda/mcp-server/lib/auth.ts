/**
 * Business ID Authorization Helper
 *
 * Validates that the business_id is provided and valid.
 * In production, this would verify the caller has access to the business.
 * For MVP, we validate format and rely on Convex's data isolation.
 */

export interface AuthorizationResult {
  authorized: boolean;
  businessId?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Validate business ID authorization
 *
 * @param businessId - The business ID from tool arguments
 * @returns Authorization result
 */
export function validateBusinessAccess(businessId: string | undefined): AuthorizationResult {
  // Check if business_id is provided
  if (!businessId) {
    return {
      authorized: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'business_id is required for authorization',
      },
    };
  }

  // Validate business_id format (Convex IDs are base64-like strings)
  // They typically look like: jd7kfs2n8qp... (alphanumeric)
  if (businessId.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(businessId)) {
    return {
      authorized: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid business_id format',
      },
    };
  }

  // In production, we would verify:
  // 1. The business exists in Convex
  // 2. The calling user has membership in the business
  // 3. The user's role allows the requested operation
  //
  // For MVP, we trust that:
  // - The LangGraph agent has already validated user authorization
  // - The business_id comes from the authenticated session context
  // - Convex queries are isolated by businessId

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

  // Default to last 30 days
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
      return 3.0; // Only extreme outliers
    case 'medium':
      return 2.0; // Standard anomalies
    case 'high':
      return 1.5; // Sensitive detection
    default:
      return 2.0;
  }
}
