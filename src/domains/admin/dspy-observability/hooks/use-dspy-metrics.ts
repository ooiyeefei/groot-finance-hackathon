'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';

export type TimeWindow = '24h' | '7d' | '30d';

export interface ToolSummary {
  tool: string;
  tier1Hits: number;
  tier2Invocations: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  refineRetryRate: number | null;
  fallbackRate: number | null;
  avgConfidence: number | null;
  avgConfidenceDspy: number | null;
  avgConfidenceBase: number | null;
  dspyUsageRate: number | null;
  tier1HitRate: number | null;
  estimatedCostUsd: number;
  overrideCount: number;
  totalClassifications: number;
  accuracy: number | null;
  isDegraded: boolean;
}

export interface BusinessOverview {
  businessId: string;
  businessName: string;
  tools: ToolSummary[];
}

export interface CorrectionFunnel {
  businessId: string;
  businessName: string;
  tools: Array<{ tool: string; correctionCount: number; threshold: number }>;
}

export interface DailyMetric {
  date: string;
  tier1Hits: number;
  tier2Invocations: number;
  successCount: number;
  fallbackCount: number;
  dspyUsedCount: number;
  sumConfidence: number;
  sumConfidenceDspy: number;
  sumConfidenceBase: number;
  sumLatencyMs: number;
  totalRefineRetries: number;
  sumInputTokens: number;
  sumOutputTokens: number;
  overrideCount: number;
}

export function useDspyOverview(timeWindow: TimeWindow) {
  const [data, setData] = useState<BusinessOverview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchAction = useAction(api.functions.dspyMetrics.getDspyOverview);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAction({ timeWindow });
      if (isMounted.current) {
        setData(result as BusinessOverview[]);
      }
    } catch (error) {
      console.error('Failed to fetch DSPy overview:', error);
      if (isMounted.current) setData(null);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchAction, timeWindow]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
}

export function useDspyBusinessDetail(businessId: string | null, timeWindow: TimeWindow) {
  const [data, setData] = useState<Record<string, DailyMetric[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchAction = useAction(api.functions.dspyMetrics.getDspyBusinessDetail);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const result = await fetchAction({
        businessId: businessId as Id<'businesses'>,
        timeWindow,
      });
      if (isMounted.current) {
        setData(result as Record<string, DailyMetric[]>);
      }
    } catch (error) {
      console.error('Failed to fetch DSPy business detail:', error);
      if (isMounted.current) setData(null);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchAction, businessId, timeWindow]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
}

export function useCorrectionFunnels() {
  const [data, setData] = useState<CorrectionFunnel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchAction = useAction(api.functions.dspyMetrics.getCorrectionFunnels);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAction();
      if (isMounted.current) {
        setData(result as CorrectionFunnel[]);
      }
    } catch (error) {
      console.error('Failed to fetch correction funnels:', error);
      if (isMounted.current) setData(null);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchAction]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
}
