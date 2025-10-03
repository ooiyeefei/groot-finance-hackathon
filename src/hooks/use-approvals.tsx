'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UserRole {
  employee: boolean;
  manager: boolean;
  admin: boolean;
}

interface ManagementDashboardData {
  role: UserRole;
  summary: {
    total_claims: number;
    pending_approval: number;
    approved_amount: number;
    rejected_count: number;
  };
  recent_claims: any[];
}

interface ApprovalsDashboardResponse {
  success: boolean;
  data: ManagementDashboardData;
  error?: string;
}

interface UseApprovalsReturn {
  dashboardData: ManagementDashboardData | null;
  loading: boolean;
  error: string | null;
  refreshDashboard: () => Promise<void>;
}

/**
 * Query function for TanStack Query
 * Fetches approvals dashboard data from the same API endpoint as expense claims
 */
const fetchApprovalsDashboard = async (): Promise<ApprovalsDashboardResponse> => {
  const response = await fetch('/api/expense-claims/dashboard', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Approvals dashboard request failed: ${response.status}`);
  }

  const data: ApprovalsDashboardResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Approvals dashboard fetch failed');
  }

  return data;
};

export function useApprovals(): UseApprovalsReturn {
  // TanStack Query for approvals dashboard fetching with smart caching
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    // Query key for approvals dashboard
    queryKey: ['approvalsDashboard'],

    // The function that fetches the data
    queryFn: fetchApprovalsDashboard,

    // Cache configuration optimized for approvals dashboard (following gold standard)
    staleTime: 2 * 60 * 1000, // 2 minutes - approvals change moderately
    gcTime: 10 * 60 * 1000, // 10 minutes - standard cache garbage collection

    // Refetch configuration
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on window focus
    refetchOnReconnect: true, // Refetch when network reconnects

    // No automatic polling needed for approvals dashboard - it's less dynamic than expense claims

    // Retry configuration (following useFinancialAnalytics pattern)
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Error && error.message.includes('Approvals dashboard request failed: 4')) {
        return false;
      }
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
  });

  // Manual refresh function
  const refreshDashboard = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Extract data with fallbacks
  const dashboardData = data?.data || null;

  return {
    dashboardData,
    loading: isLoading,
    error: isError ? (error instanceof Error ? error.message : 'Failed to fetch approvals dashboard') : null,
    refreshDashboard
  };
}