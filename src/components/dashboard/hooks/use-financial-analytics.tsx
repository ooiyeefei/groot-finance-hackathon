'use client';

import { useState, useEffect, useCallback } from 'react';
import { SupportedCurrency } from '@/types/transaction';
import { AnalyticsResponse, AnalyticsData, AnalyticsTrends } from '../types/analytics';

interface UseFinancialAnalyticsOptions {
  period?: 'month' | 'quarter' | 'year';
  homeCurrency?: SupportedCurrency;
  includeTrends?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseFinancialAnalyticsReturn {
  analytics: AnalyticsData | null;
  trends: AnalyticsTrends | null;
  previousPeriod: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export default function useFinancialAnalytics(
  options: UseFinancialAnalyticsOptions = {}
): UseFinancialAnalyticsReturn {
  const {
    period = 'month',
    homeCurrency = 'SGD',
    includeTrends = true,
    autoRefresh = false,
    refreshInterval = 300000 // 5 minutes
  } = options;

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAnalytics = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Use period-based approach but fallback to 60-day window for consistency
      const params = new URLSearchParams({
        period,
        homeCurrency,
        includeTrends: includeTrends.toString(),
        ...(forceRefresh && { forceRefresh: 'true' })
      });

      const response = await fetch(`/api/analytics?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Analytics request failed: ${response.status}`);
      }

      const data: AnalyticsResponse = await response.json();

      if (!data.success) {
        throw new Error('Analytics calculation failed');
      }

      setAnalytics(data.analytics);
      setTrends(data.trends || null);
      setPreviousPeriod(data.previous_period || null);
      setLastUpdated(new Date());

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics';
      setError(errorMessage);
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, homeCurrency, includeTrends]);

  const refresh = useCallback(async () => {
    await fetchAnalytics(true); // Force refresh
  }, [fetchAnalytics]);

  // Initial fetch and period/currency change effect
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchAnalytics();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAnalytics]);

  return {
    analytics,
    trends,
    previousPeriod,
    loading,
    error,
    refresh,
    lastUpdated
  };
}

/**
 * Hook for batch analytics fetching across multiple periods
 */
export function useBatchAnalytics(periods: Array<{
  period?: 'month' | 'quarter' | 'year';
  start?: string;
  end?: string;
  date?: string;
}>, homeCurrency: SupportedCurrency = 'SGD') {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBatch = useCallback(async (forceRefresh = false) => {
    if (periods.length === 0) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          periods,
          homeCurrency,
          forceRefresh
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Batch analytics request failed');
      }

      const result = await response.json();
      setData(result.results || []);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch batch analytics';
      setError(errorMessage);
      console.error('Batch analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [periods, homeCurrency]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  return {
    data,
    loading,
    error,
    refresh: () => fetchBatch(true)
  };
}