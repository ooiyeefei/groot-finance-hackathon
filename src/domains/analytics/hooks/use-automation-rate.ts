/**
 * React hooks for automation rate data
 * Feature: 001-surface-automation-rate
 *
 * Uses useAction (not useQuery) to avoid reactive re-runs.
 * See CLAUDE.md "Convex Bandwidth & Query Budget" for rationale.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================
// HOOK: useAutomationRate
// ============================================

export interface UseAutomationRateOptions {
  businessId: Id<"businesses">;
  period: "today" | "week" | "month" | "custom";
  startDate?: string;
  endDate?: string;
}

export interface UseAutomationRateResult {
  rate: number | undefined;
  totalDecisions: number | undefined;
  decisionsReviewed: number | undefined;
  message: string | undefined;
  hasMinimumData: boolean | undefined;
  sources:
    | {
        arRecon: { total: number; reviewed: number };
        bankRecon: { total: number; reviewed: number };
        feeClassification: { total: number; reviewed: number };
        expenseOCR: { total: number; reviewed: number };
      }
    | undefined;
  isLoading: boolean;
  refresh: () => void;
}

export function useAutomationRate(
  options: UseAutomationRateOptions
): UseAutomationRateResult {
  const { businessId, period, startDate, endDate } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.functions.automationRate.getAutomationRate);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ businessId, period, startDate, endDate });
      if (isMounted.current) setData(result);
    } catch (error) {
      console.error("Failed to fetch automation rate:", error);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetchAction, businessId, period, startDate, endDate]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return {
    rate: data?.rate,
    totalDecisions: data?.totalDecisions,
    decisionsReviewed: data?.decisionsReviewed,
    message: data?.message,
    hasMinimumData: data?.hasMinimumData,
    sources: data?.sources,
    isLoading,
    refresh: fetchData,
  };
}

// ============================================
// HOOK: useAutomationRateTrend
// ============================================

export interface UseAutomationRateTrendOptions {
  businessId: Id<"businesses">;
  weeks?: number;
}

export interface UseAutomationRateTrendResult {
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
  isLoading: boolean;
  refresh: () => void;
}

export function useAutomationRateTrend(
  options: UseAutomationRateTrendOptions
): UseAutomationRateTrendResult {
  const { businessId, weeks = 8 } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.functions.automationRate.getAutomationRateTrend);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ businessId, weeks });
      if (isMounted.current) setData(result);
    } catch (error) {
      console.error("Failed to fetch automation rate trend:", error);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetchAction, businessId, weeks]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return {
    trendData: data,
    isLoading,
    refresh: fetchData,
  };
}

// ============================================
// HOOK: useLifetimeStats
// ============================================

export interface UseLifetimeStatsOptions {
  businessId: Id<"businesses">;
}

export interface UseLifetimeStatsResult {
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
  isLoading: boolean;
  refresh: () => void;
}

export function useLifetimeStats(
  options: UseLifetimeStatsOptions
): UseLifetimeStatsResult {
  const { businessId } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.functions.automationRate.getLifetimeStats);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ businessId });
      if (isMounted.current) setData(result);
    } catch (error) {
      console.error("Failed to fetch lifetime stats:", error);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetchAction, businessId]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return {
    rate: data?.rate,
    totalDecisions: data?.totalDecisions,
    decisionsReviewed: data?.decisionsReviewed,
    firstDecisionDate: data?.firstDecisionDate,
    lastDecisionDate: data?.lastDecisionDate,
    sources: data?.sources,
    timesSaved: data?.timesSaved,
    isLoading,
    refresh: fetchData,
  };
}

// ============================================
// HOOK: useMilestones (kept as reactive query — single doc lookup)
// ============================================

export interface UseMilestonesOptions {
  businessId: Id<"businesses">;
}

export interface UseMilestonesResult {
  milestones:
    | {
        milestone_90: number | undefined;
        milestone_95: number | undefined;
        milestone_99: number | undefined;
      }
    | undefined;
  isLoading: boolean;
}

/**
 * Milestone status — uses reactive query (OK: single document lookup)
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
