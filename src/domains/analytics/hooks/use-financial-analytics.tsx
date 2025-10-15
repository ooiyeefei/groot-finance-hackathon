'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SupportedCurrency } from '@/domains/accounting-entries/types';
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

/**
 * Query function for TanStack Query
 * Fetches financial analytics data from the API endpoint
 */
const fetchFinancialAnalytics = async ({ queryKey }: { queryKey: any[] }): Promise<AnalyticsResponse> => {
  const [_key, period, homeCurrency, includeTrends, forceRefresh] = queryKey;

  const params = new URLSearchParams({
    period,
    homeCurrency,
    includeTrends: includeTrends.toString(),
    ...(forceRefresh && { forceRefresh: 'true' })
  });

  const response = await fetch(`/api/v1/analytics/dashboards?${params}`, {
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

  return data;
};

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

  // Use TanStack Query for data fetching with smart caching
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    dataUpdatedAt
  } = useQuery({
    // Unique query key that includes all parameters that affect the data
    queryKey: ['financialAnalytics', period, homeCurrency, includeTrends, false],

    // The function that fetches the data
    queryFn: fetchFinancialAnalytics,

    // Cache configuration for optimal performance
    staleTime: 1 * 60 * 1000, // 1 minute - data considered fresh (faster than our 7.5ms RPC!)
    gcTime: 10 * 60 * 1000, // 10 minutes - cache garbage collection time

    // Auto-refresh configuration - use TanStack Query's built-in refetch
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on window focus
    refetchOnReconnect: true, // Refetch when network reconnects

    // Retry configuration
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Error && error.message.includes('Analytics request failed: 4')) {
        return false;
      }
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
  });

  // Manual refresh function that forces a fresh fetch
  const refresh = async () => {
    // Force refetch bypassing cache - this is equivalent to the original force refresh
    await refetch();
  };

  // Map TanStack Query results to the original hook interface
  return {
    analytics: data?.data?.analytics || null,
    trends: data?.data?.trends || null,
    previousPeriod: data?.data?.previous_period || null,
    loading: isLoading,
    error: isError ? (error instanceof Error ? error.message : 'Failed to fetch analytics') : null,
    refresh,
    lastUpdated: dataUpdatedAt ? new Date(dataUpdatedAt) : null
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

      const response = await fetch('/api/v1/analytics/dashboards', {
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
      setData(result.data?.results || []);

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