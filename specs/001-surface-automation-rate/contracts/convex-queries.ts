/**
 * Convex Query Contracts: Surface Automation Rate Metric
 *
 * These TypeScript interfaces define the contracts for all Convex queries
 * and mutations used by the automation rate feature. Implement these in
 * convex/functions/automationRate.ts
 */

import { Id } from "convex/_generated/dataModel";

// ============================================
// QUERY: Get Current Automation Rate
// ============================================

/**
 * Calculate current automation rate for a business within a date range
 *
 * @example
 * const rate = useQuery(api.automationRate.getAutomationRate, {
 *   businessId: business._id,
 *   period: "week"
 * });
 */
export interface GetAutomationRateArgs {
  businessId: Id<"businesses">;
  period: "today" | "week" | "month" | "custom";
  startDate?: string; // ISO date YYYY-MM-DD (required if period="custom")
  endDate?: string;   // ISO date YYYY-MM-DD (required if period="custom")
}

export interface AutomationRateResult {
  rate: number;              // 0-100 percentage
  totalDecisions: number;    // Total AI decisions made
  decisionsReviewed: number; // Decisions that required human review
  period: {
    start: string;           // ISO date YYYY-MM-DD
    end: string;             // ISO date YYYY-MM-DD
    label: string;           // "Today", "This week", "This month", "Mar 1 - Mar 15"
  };
  hasMinimumData: boolean;   // true if >= 10 decisions
  message?: string;          // "No AI activity in this period" | "Collecting data..." | undefined
  sources: {
    arRecon: { total: number; reviewed: number };
    bankRecon: { total: number; reviewed: number };
    feeClassification: { total: number; reviewed: number };
    expenseOCR: { total: number; reviewed: number };
  };
  timestamp: number;         // Unix timestamp (ms) when calculated
}

// ============================================
// QUERY: Get Automation Rate Trend
// ============================================

/**
 * Get weekly automation rate trend data for chart visualization
 *
 * @example
 * const trend = useQuery(api.automationRate.getAutomationRateTrend, {
 *   businessId: business._id,
 *   weeks: 8
 * });
 */
export interface GetAutomationRateTrendArgs {
  businessId: Id<"businesses">;
  weeks?: number;            // Number of weeks to return (default: 8, max: 52)
}

export interface AutomationRateTrendPoint {
  weekStart: string;         // ISO date YYYY-MM-DD (Monday)
  weekEnd: string;           // ISO date YYYY-MM-DD (Sunday)
  week: string;              // Label "Week of Mar 3"
  rate: number | null;       // null if no activity in that week
  totalDecisions: number;
  decisionsReviewed: number;
  hasMinimumData: boolean;   // >= 10 decisions
  optimizationEvents: Array<{
    date: number;            // Unix timestamp (ms)
    label: string;           // "Model optimized"
    modelType: string;       // "ar_matching" | "bank_recon" | "fee_classification"
    optimizerType: string;   // "bootstrap_fewshot" | "miprov2"
  }>;
}

export type AutomationRateTrendResult = AutomationRateTrendPoint[];

// ============================================
// QUERY: Get Lifetime Automation Stats
// ============================================

/**
 * Get cumulative lifetime automation statistics since business created
 *
 * @example
 * const stats = useQuery(api.automationRate.getLifetimeStats, {
 *   businessId: business._id
 * });
 */
export interface GetLifetimeAutomationStatsArgs {
  businessId: Id<"businesses">;
}

export interface LifetimeAutomationStats {
  rate: number;              // Lifetime automation rate 0-100
  totalDecisions: number;    // Total AI decisions since inception
  decisionsReviewed: number; // Total reviewed since inception
  firstDecisionDate: string | null; // ISO date of first AI decision
  lastDecisionDate: string | null;  // ISO date of most recent decision
  sources: {
    arRecon: { total: number; reviewed: number };
    bankRecon: { total: number; reviewed: number };
    feeClassification: { total: number; reviewed: number };
    expenseOCR: { total: number; reviewed: number };
  };
  timesSaved: {
    totalSeconds: number;    // Estimated total time saved
    formatted: string;       // "152 hours"
  };
}

// ============================================
// MUTATION: Check and Trigger Milestones
// ============================================

/**
 * Check current automation rate and trigger notifications for newly achieved milestones
 * Called by daily cron job
 *
 * @internal This is an internal mutation called by cron, not exposed to clients
 */
export interface CheckMilestonesArgs {
  businessId: Id<"businesses">;
}

export interface MilestoneCheckResult {
  currentRate: number;       // Current week automation rate
  newlyAchieved: Array<{
    threshold: 90 | 95 | 99;
    currentRate: number;
    timestamp: number;       // Unix timestamp (ms) when achieved
  }>;
  alreadyAchieved: number[]; // List of thresholds already hit [90, 95]
}

// ============================================
// QUERY: Get Milestone Status
// ============================================

/**
 * Get milestone achievement status for a business
 * Used by client to show achievement badges, trigger toasts on updates
 *
 * @example
 * const milestones = useQuery(api.automationRate.getMilestones, {
 *   businessId: business._id
 * });
 */
export interface GetMilestonesArgs {
  businessId: Id<"businesses">;
}

export interface MilestoneStatus {
  milestone_90?: number;  // Unix timestamp when 90% first achieved (undefined if not achieved)
  milestone_95?: number;  // Unix timestamp when 95% first achieved
  milestone_99?: number;  // Unix timestamp when 99% first achieved
}

// ============================================
// HELPER TYPES
// ============================================

/**
 * Period calculation helper - converts period enum to date range
 */
export interface PeriodDateRange {
  start: number;  // Unix timestamp (ms)
  end: number;    // Unix timestamp (ms)
  label: string;  // Human-readable label
}

/**
 * Week range helper - generates week boundaries (Monday-Sunday)
 */
export interface WeekRange {
  start: number;  // Unix timestamp (ms) - Monday 00:00:00
  end: number;    // Unix timestamp (ms) - Sunday 23:59:59
  label: string;  // "Week of Mar 3"
}

// ============================================
// ERROR TYPES
// ============================================

/**
 * Custom error for automation rate queries
 */
export class AutomationRateError extends Error {
  code:
    | "INVALID_PERIOD"      // Invalid period enum value
    | "INVALID_DATE_RANGE"  // startDate > endDate
    | "MISSING_CUSTOM_DATES" // period="custom" but dates not provided
    | "BUSINESS_NOT_FOUND"  // businessId doesn't exist
    | "WEEKS_OUT_OF_RANGE"; // weeks < 1 or > 52

  constructor(message: string, code: AutomationRateError["code"]) {
    super(message);
    this.name = "AutomationRateError";
    this.code = code;
  }
}

// ============================================
// CONVEX SCHEMA ADDITION
// ============================================

/**
 * Add this to convex/schema.ts businesses table:
 *
 * automationMilestones: v.optional(v.object({
 *   milestone_90: v.optional(v.number()),  // Unix timestamp (ms)
 *   milestone_95: v.optional(v.number()),
 *   milestone_99: v.optional(v.number()),
 * })),
 */
