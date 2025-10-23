'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation, useQueries } from '@tanstack/react-query';

interface PersonalDashboardData {
  summary: {
    total_claims: number;
    pending_approval: number;
    approved_amount: number;
    rejected_count: number;
  };
  recent_claims: any[];
}

interface DashboardResponse {
  success: boolean;
  data: PersonalDashboardData;
  error?: string;
}

interface ExpenseClaimResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface UseExpenseClaimsReturn {
  dashboardData: PersonalDashboardData | null;
  categories: any[] | null;
  loading: boolean;
  categoriesLoading: boolean;
  error: string | null;
  refreshDashboard: () => Promise<void>;
  deleteClaim: (claimId: string) => Promise<boolean>;
  submitClaim: (claimId: string) => Promise<boolean>;
  reprocessClaim: (claimId: string) => Promise<boolean>;
  // Operation loading states
  deleting: Set<string>;
  submitting: Set<string>;
  reprocessing: Set<string>;
}

/**
 * Query function for TanStack Query
 * Fetches expense claims dashboard data from the North Star v1 API endpoint
 */
const fetchDashboardData = async (): Promise<DashboardResponse> => {
  const response = await fetch('/api/v1/expense-claims?limit=10&sort_order=desc', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Dashboard request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Dashboard fetch failed');
  }

  // Transform v1 API response to match dashboard interface
  const claims = data.data?.claims || [];
  const pagination = data.data?.pagination || {};

  const summary = {
    total_claims: pagination.total || 0,
    pending_approval: claims.filter((claim: any) => claim.status === 'submitted').length,
    approved_amount: claims
      .filter((claim: any) => claim.status === 'approved' || claim.status === 'reimbursed')
      .reduce((sum: number, claim: any) => sum + (claim.home_currency_amount || claim.total_amount || 0), 0),
    rejected_count: claims.filter((claim: any) => claim.status === 'rejected').length,
  };

  return {
    success: true,
    data: {
      summary,
      recent_claims: claims
    }
  };
};

export function useExpenseClaims(): UseExpenseClaimsReturn {
  const queryClient = useQueryClient();

  // State for tracking operations
  const [deleting, setDeleting] = useState(new Set<string>());
  const [submitting, setSubmitting] = useState(new Set<string>());
  const [reprocessing, setReprocessing] = useState(new Set<string>());

  // Parallel queries for better performance - fetch dashboard and categories simultaneously
  const queries = useQueries({
    queries: [
      // Dashboard data query
      {
        queryKey: ['expenseClaimsDashboard'],
        queryFn: fetchDashboardData,
        staleTime: 1 * 60 * 1000, // 1 minute - expense claims change frequently
        gcTime: 10 * 60 * 1000, // 10 minutes - standard cache garbage collection
        refetchInterval: (query: any) => {
          const dashboardData = query.state.data?.data;
          const hasProcessingClaims = dashboardData?.recent_claims?.some((claim: any) =>
            claim.processing_status === 'processing'
          );
          return hasProcessingClaims ? 3000 : false; // 3 seconds polling for processing claims
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount: number, error: any) => {
          if (error instanceof Error && error.message.includes('Dashboard request failed: 4')) {
            return false;
          }
          return failureCount < 3;
        },
      },
      // Categories query - static data with longer cache
      {
        queryKey: ['expenseCategories'],
        queryFn: async () => {
          const response = await fetch('/api/v1/expense-claims/categories', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!response.ok) {
            throw new Error(`Categories request failed: ${response.status}`);
          }
          return response.json();
        },
        staleTime: 30 * 60 * 1000, // 30 minutes - categories rarely change
        gcTime: 60 * 60 * 1000, // 1 hour - keep in cache longer
        refetchOnWindowFocus: false,
        refetchOnReconnect: false, // Categories don't need immediate refresh
      },
    ],
  });

  const [dashboardQuery, categoriesQuery] = queries;

  // Delete claim mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (claimId: string): Promise<ExpenseClaimResponse> => {
      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete claim');
      }

      return result;
    },
    onMutate: async (claimId) => {
      setDeleting(prev => new Set(prev).add(claimId));

      // Optimistically remove from the claims list
      queryClient.setQueryData(['expenseClaimsDashboard'], (oldData: DashboardResponse | undefined) => {
        if (!oldData) return oldData;

        const filteredClaims = oldData.data.recent_claims.filter(claim => claim.id !== claimId);
        const updatedSummary = {
          ...oldData.data.summary,
          total_claims: Math.max(0, oldData.data.summary.total_claims - 1)
        };

        return {
          ...oldData,
          data: {
            ...oldData.data,
            summary: updatedSummary,
            recent_claims: filteredClaims
          }
        };
      });
    },
    onSuccess: () => {
      // Refetch to get accurate counts and any updated related data
      dashboardQuery.refetch();
    },
    onSettled: (_, __, claimId) => {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    },
    onError: (error, claimId) => {
      console.error('Error deleting claim:', error);
      // Refetch to restore correct state on error
      dashboardQuery.refetch();
    }
  });

  // Submit claim mutation with optimistic updates
  const submitMutation = useMutation({
    mutationFn: async (claimId: string): Promise<ExpenseClaimResponse> => {
      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit claim');
      }

      return result;
    },
    onMutate: async (claimId) => {
      setSubmitting(prev => new Set(prev).add(claimId));

      // Optimistically update the claim status to 'submitted'
      queryClient.setQueryData(['expenseClaimsDashboard'], (oldData: DashboardResponse | undefined) => {
        if (!oldData) return oldData;

        return {
          ...oldData,
          data: {
            ...oldData.data,
            recent_claims: oldData.data.recent_claims.map(claim =>
              claim.id === claimId
                ? { ...claim, status: 'submitted' }
                : claim
            )
          }
        };
      });
    },
    onSuccess: () => {
      // Refetch to get accurate server state
      dashboardQuery.refetch();
    },
    onSettled: (_, __, claimId) => {
      setSubmitting(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    },
    onError: (error, claimId) => {
      console.error('Error submitting claim:', error);
      // Refetch to restore correct state on error
      dashboardQuery.refetch();
    }
  });

  // Reprocess claim mutation - NOT IMPLEMENTED in North Star v1 API
  // TODO: Reprocessing is not part of the 5 core CRUD endpoints
  const reprocessMutation = useMutation({
    mutationFn: async (claimId: string): Promise<ExpenseClaimResponse> => {
      throw new Error('Reprocess functionality not implemented yet');
    },
    onMutate: async (claimId) => {
      setReprocessing(prev => new Set(prev).add(claimId));

      // Optimistically update the processing status to 'processing'
      queryClient.setQueryData(['expenseClaimsDashboard'], (oldData: DashboardResponse | undefined) => {
        if (!oldData) return oldData;

        return {
          ...oldData,
          data: {
            ...oldData.data,
            recent_claims: oldData.data.recent_claims.map(claim =>
              claim.id === claimId
                ? { ...claim, processing_status: 'processing' }
                : claim
            )
          }
        };
      });
    },
    onSuccess: () => {
      // Refetch to get accurate server state
      dashboardQuery.refetch();
    },
    onSettled: (_, __, claimId) => {
      setReprocessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    },
    onError: (error, claimId) => {
      console.error('Error reprocessing claim:', error);
      // Refetch to restore correct state on error
      dashboardQuery.refetch();
    }
  });

  // Manual refresh function - refresh both queries
  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      categoriesQuery.refetch()
    ]);
  }, [dashboardQuery, categoriesQuery]);

  // Operation wrapper functions
  const deleteClaim = useCallback(async (claimId: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(claimId);
      return true;
    } catch (error) {
      throw error;
    }
  }, [deleteMutation]);

  const submitClaim = useCallback(async (claimId: string): Promise<boolean> => {
    try {
      await submitMutation.mutateAsync(claimId);
      return true;
    } catch (error) {
      throw error;
    }
  }, [submitMutation]);

  const reprocessClaim = useCallback(async (claimId: string): Promise<boolean> => {
    try {
      await reprocessMutation.mutateAsync(claimId);
      return true;
    } catch (error) {
      throw error;
    }
  }, [reprocessMutation]);

  // Extract and memoize data with fallbacks
  const dashboardData = useMemo(() =>
    dashboardQuery.data?.data || null,
    [dashboardQuery.data]
  );

  const categories = useMemo(() =>
    categoriesQuery.data?.data || null,
    [categoriesQuery.data]
  );

  return {
    dashboardData,
    categories,
    loading: dashboardQuery.isLoading,
    categoriesLoading: categoriesQuery.isLoading,
    error: dashboardQuery.isError
      ? (dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Failed to fetch dashboard data')
      : null,
    refreshDashboard,
    deleteClaim,
    submitClaim,
    reprocessClaim,
    deleting,
    submitting,
    reprocessing
  };
}