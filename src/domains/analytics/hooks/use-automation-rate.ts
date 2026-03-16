/**
 * React hooks for automation rate data
 * Feature: 001-surface-automation-rate
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================
// HOOK: useAutomationRate
// ============================================

export interface UseAutomationRateOptions {
  businessId: Id<"businesses">;
  period: "today" | "week" | "month" | "custom";
  startDate?: string;  // ISO date (required if period="custom")
  endDate?: string;    // ISO date (required if period="custom")
}

export interface UseAutomationRateResult {
  // Data
  rate: number | undefined;              // Automation rate percentage
  totalDecisions: number | undefined;    // Total AI decisions
  decisionsReviewed: number | undefined; // Reviewed decisions
  message: string | undefined;           // "No AI activity" or "Collecting data..."
  hasMinimumData: boolean | undefined;   // >= 10 decisions
  sources:
    | {
        arRecon: { total: number; reviewed: number };
        bankRecon: { total: number; reviewed: number };
        feeClassification: { total: number; reviewed: number };
        expenseOCR: { total: number; reviewed: number };
      }
    | undefined;

  // Query state
  isLoading: boolean;
}

/**
 * Fetch current automation rate for a business
 */
export function useAutomationRate(
  options: UseAutomationRateOptions
): UseAutomationRateResult {
  const { businessId, period, startDate, endDate } = options;

  const data = useQuery(
    api.functions.automationRate.getAutomationRate,
    {
      businessId,
      period,
      startDate,
      endDate,
    }
  );

  return {
    rate: data?.rate,
    totalDecisions: data?.totalDecisions,
    decisionsReviewed: data?.decisionsReviewed,
    message: data?.message,
    hasMinimumData: data?.hasMinimumData,
    sources: data?.sources,
    isLoading: data === undefined,
  };
}

// ============================================
// HOOK: useAutomationRateTrend
// ============================================

export interface UseAutomationRateTrendOptions {
  businessId: Id<"businesses">;
  weeks?: number;           // Number of weeks (default: 8, max: 52)
}

export interface UseAutomationRateTrendResult {
  // Data
  trendData:
    | Array<{
        weekStart: string;
        weekEnd: string;
        week: string;
        rate: number | null;
        totalDecisions: number;
        decisionsReviewed: number;
        hasMinimumData: boolean;
        optimizationEvents: Array<{
          date: number;
          label: string;
          modelType: string;
          optimizerType: string;
        }>;
      }>
    | undefined;

  // Query state
  isLoading: boolean;
}

/**
 * Fetch weekly automation rate trend data
 */
export function useAutomationRateTrend(
  options: UseAutomationRateTrendOptions
): UseAutomationRateTrendResult {
  const { businessId, weeks = 8 } = options;

  const data = useQuery(api.functions.automationRate.getAutomationRateTrend, {
    businessId,
    weeks,
  });

  return {
    trendData: data,
    isLoading: data === undefined,
  };
}

// ============================================
// HOOK: useLifetimeStats
// ============================================

export interface UseLifetimeStatsOptions {
  businessId: Id<"businesses">;
}

export interface UseLifetimeStatsResult {
  // Data
  rate: number | undefined;
  totalDecisions: number | undefined;
  decisionsReviewed: number | undefined;
  firstDecisionDate: string | null | undefined;
  lastDecisionDate: string | null | undefined;
  sources:
    | {
        arRecon: { total: number; reviewed: number };
        bankRecon: { total: number; reviewed: number };
        feeClassification: { total: number; reviewed: number };
        expenseOCR: { total: number; reviewed: number };
      }
    | undefined;
  timesSaved:
    | {
        totalSeconds: number;
        formatted: string;
      }
    | undefined;

  // Query state
  isLoading: boolean;
}

/**
 * Fetch lifetime automation statistics
 */
export function useLifetimeStats(
  options: UseLifetimeStatsOptions
): UseLifetimeStatsResult {
  const { businessId } = options;

  const data = useQuery(api.functions.automationRate.getLifetimeStats, {
    businessId,
  });

  return {
    rate: data?.rate,
    totalDecisions: data?.totalDecisions,
    decisionsReviewed: data?.decisionsReviewed,
    firstDecisionDate: data?.firstDecisionDate,
    lastDecisionDate: data?.lastDecisionDate,
    sources: data?.sources,
    timesSaved: data?.timesSaved,
    isLoading: data === undefined,
  };
}

// ============================================
// HOOK: useMilestones
// ============================================

export interface UseMilestonesOptions {
  businessId: Id<"businesses">;
}

export interface UseMilestonesResult {
  // Data
  milestones:
    | {
        milestone_90: number | undefined;
        milestone_95: number | undefined;
        milestone_99: number | undefined;
      }
    | undefined;

  // Query state
  isLoading: boolean;
}

/**
 * Fetch milestone achievement status
 */
export function useMilestones(
  options: UseMilestonesOptions
): UseMilestonesResult {
  const { businessId } = options;

  const data = useQuery(api.functions.automationRate.getMilestones, {
    businessId,
  });

  return {
    milestones: data,
    isLoading: data === undefined,
  };
}
