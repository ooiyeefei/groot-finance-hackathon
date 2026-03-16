/**
 * Contract: getAIPerformanceMetrics Convex Query
 *
 * Input args:
 *   businessId: string (from auth context)
 *   period: "this_month" | "last_3_months" | "all_time"
 *
 * Output: AIPerformanceMetrics (see data-model.md)
 *
 * Behavior:
 *   1. Calculate date boundaries for selected period + equivalent previous period
 *   2. Query sales_orders, bank_transactions, corrections tables filtered by businessId + date range
 *   3. Aggregate: confidence (volume-weighted avg), edit rate, automation rate, missing fields rate
 *   4. Repeat for previous period → compute deltas for trend indicators
 *   5. Return AIPerformanceMetrics shape
 *
 * Performance:
 *   - All queries use businessId indexes (no full table scans)
 *   - Client-side date filtering after index lookup (Convex doesn't support compound date+businessId indexes on all tables)
 *   - Target: <2s for up to 10,000 records per table
 *
 * Multi-tenant:
 *   - businessId is mandatory, derived from authenticated user's active business
 *   - No cross-business data access
 */

// Period boundaries calculation
type Period = "this_month" | "last_3_months" | "all_time";

interface PeriodBounds {
  current: { start: number; end: number };
  previous: { start: number; end: number } | null; // null for "all_time"
}

// Function: getPeriodBounds(period: Period): PeriodBounds
// "this_month" → current: [start of month, now], previous: [start of last month, end of last month]
// "last_3_months" → current: [3 months ago, now], previous: [6 months ago, 3 months ago]
// "all_time" → current: [0, now], previous: null
