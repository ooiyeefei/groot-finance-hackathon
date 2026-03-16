'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

type Period = "this_month" | "last_3_months" | "all_time";

interface AIPerformanceMetrics {
  overallConfidence: number;
  editRate: number;
  noEditRate: number;
  automationRate: number;
  missingFieldsRate: number;
  totalAiDecisions: number;
  decisionsRequiringReview: number;
  estimatedHoursSaved: number;
  distribution: {
    noEdit: number;
    edited: number;
    missing: number;
  };
  featureBreakdown: {
    ar: { total: number; confidence: number; corrections: number };
    bank: { total: number; confidence: number; corrections: number };
    fee: { total: number; confidence: number; corrections: number };
  };
  trends: {
    confidenceDelta: number | null;
    editRateDelta: number | null;
    automationRateDelta: number | null;
    hoursSavedDelta: number | null;
  } | null;
  periodLabel: string;
  isEmpty: boolean;
}

interface UseAIPerformanceReturn {
  metrics: AIPerformanceMetrics | null;
  period: Period;
  setPeriod: (period: Period) => void;
  loading: boolean;
  isEmpty: boolean;
  refresh: () => void;
  lastUpdated: Date | null;
}

export function useAIPerformance(businessId: string): UseAIPerformanceReturn {
  const [period, setPeriodState] = useState<Period>("this_month");
  const [metrics, setMetrics] = useState<AIPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fetchAction = useAction(api.functions.aiPerformanceMetrics.getAIPerformanceMetrics);
  const isMounted = useRef(true);

  const fetchMetrics = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const result = await fetchAction({
        businessId: businessId as Id<"businesses">,
        period: p,
      });
      if (isMounted.current) {
        setMetrics(result as AIPerformanceMetrics | null);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch AI performance metrics:", error);
      if (isMounted.current) {
        setMetrics(null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [fetchAction, businessId]);

  useEffect(() => {
    isMounted.current = true;
    fetchMetrics(period);
    return () => { isMounted.current = false; };
  }, [fetchMetrics, period]);

  const setPeriod = useCallback((newPeriod: Period) => {
    setPeriodState(newPeriod);
  }, []);

  const refresh = useCallback(() => {
    fetchMetrics(period);
  }, [fetchMetrics, period]);

  const isEmpty = metrics?.isEmpty ?? true;

  return {
    metrics,
    period,
    setPeriod,
    loading,
    isEmpty,
    refresh,
    lastUpdated,
  };
}
