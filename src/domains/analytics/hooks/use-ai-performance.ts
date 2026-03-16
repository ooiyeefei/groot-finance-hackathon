'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
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
  metrics: AIPerformanceMetrics | null | undefined;
  period: Period;
  setPeriod: (period: Period) => void;
  loading: boolean;
  isEmpty: boolean;
}

export function useAIPerformance(businessId: string): UseAIPerformanceReturn {
  const [period, setPeriod] = useState<Period>("this_month");

  const metrics = useQuery(
    api.functions.aiPerformanceMetrics.getAIPerformanceMetrics,
    { businessId: businessId as Id<"businesses">, period }
  );

  const loading = metrics === undefined;
  const isEmpty = metrics?.isEmpty ?? true;

  return {
    metrics,
    period,
    setPeriod,
    loading,
    isEmpty,
  };
}
