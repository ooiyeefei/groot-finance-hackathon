'use client';

import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  AccountingEntry,
  CreateAccountingEntryRequest,
  UpdateAccountingEntryRequest,
  AccountingEntryListParams
} from '@/domains/accounting-entries/lib/data-access';
import type { SupportedCurrency } from '@/domains/accounting-entries/types';

interface AccountingEntryListResponse {
  success: boolean;
  data: {
    transactions: AccountingEntry[]; // Keep "transactions" key for backwards compatibility
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      total_pages: number;
    };
    nextCursor?: string | null;
  };
  error?: string;
}

interface AccountingEntryResponse {
  success: boolean;
  data: {
    transaction: AccountingEntry; // Keep "transaction" key for backwards compatibility
  };
  error?: string;
}

export interface AccountingEntryFilters {
  search?: string;
  category?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
  vendor_name?: string;
  status?: string;
}

interface UseAccountingEntriesReturn {
  accountingEntries: AccountingEntry[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  updating: Set<string>;
  deleting: Set<string>;
  hasMore: boolean;
  isFetchingMore: boolean;
  totalCount: number;
  // CRUD operations
  createAccountingEntry: (data: CreateAccountingEntryRequest) => Promise<AccountingEntry | null>;
  updateAccountingEntry: (id: string, data: UpdateAccountingEntryRequest) => Promise<AccountingEntry | null>;
  deleteAccountingEntry: (id: string) => Promise<boolean>;
  refreshAccountingEntries: () => Promise<void>;
  // Infinite scroll operations
  fetchNextPage: () => void;
  // Utility
  getAccountingEntryById: (id: string) => AccountingEntry | undefined;
}

const DEFAULT_FILTERS: AccountingEntryListParams = {
  page: 1,
  limit: 20,
  sort_by: 'created_at',
  sort_order: 'desc'
};

/**
 * Query function for TanStack Query useInfiniteQuery
 * Fetches accounting entries list from the v1 API endpoint with server-side filtering and cursor-based pagination
 */
const fetchAccountingEntries = async ({ queryKey, pageParam }: { queryKey: any[]; pageParam?: string }): Promise<AccountingEntryListResponse> => {
  const [_key, filters] = queryKey;

  const searchParams = new URLSearchParams();

  // Add pagination parameters
  searchParams.append('limit', String(filters.limit || 20)); // Default page size for infinite scroll
  searchParams.append('page', String(filters.page || 1)); // Default to page 1

  // Add cursor parameter for infinite scroll
  if (pageParam) {
    searchParams.append('cursor', pageParam);
  }

  // Add filter parameters for server-side filtering (exclude pagination params to prevent duplication)
  if (filters && typeof filters === 'object') {
    Object.entries(filters).forEach(([key, value]) => {
      // Skip pagination parameters that are handled separately
      if (key === 'limit' || key === 'page') return;

      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(`/api/v1/accounting-entries?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Accounting entries request failed: ${response.status}`);
  }

  const data: AccountingEntryListResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Accounting entries fetch failed');
  }

  return data;
};

export function useAccountingEntries(
  filters: AccountingEntryFilters = {},
  initialData?: {
    transactions: AccountingEntry[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
      total_pages: number
    }
  } | null
): UseAccountingEntriesReturn {
  const queryClient = useQueryClient();

  // State for tracking operations
  const [updating, setUpdating] = useState(new Set<string>());
  const [deleting, setDeleting] = useState(new Set<string>());

  // Merge user filters with defaults to ensure consistent sorting
  // Memoize to prevent unnecessary query refetches due to object reference changes
  const mergedFilters = useMemo(() => ({
    ...DEFAULT_FILTERS,
    ...filters
  }), [filters]);

  // ⚡ PERFORMANCE: Transform initial data into React Query format
  const queryInitialData = useMemo(() => {
    if (!initialData) return undefined;

    return {
      pages: [{
        success: true,
        data: {
          transactions: initialData.transactions,
          pagination: initialData.pagination,
          nextCursor: initialData.pagination.has_more ? `page-${initialData.pagination.page + 1}` : null
        }
      }],
      pageParams: [undefined]
    };
  }, [initialData]);

  // TanStack Query useInfiniteQuery for transactions with server-side filtering
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    // CRITICAL: Query key includes filters for automatic cache invalidation and server-side filtering
    queryKey: ['accounting-entries', mergedFilters],

    // The function that fetches the data
    queryFn: fetchAccountingEntries,

    // Initial page parameter (no cursor for first page)
    initialPageParam: undefined as string | undefined,

    // ⚡ PERFORMANCE: Seed React Query with server-fetched data
    // This eliminates initial loading state and provides instant data display
    initialData: queryInitialData,

    // Function to determine the next page parameter (cursor)
    getNextPageParam: (lastPage) => {
      return lastPage.data.nextCursor || undefined;
    },

    // Cache configuration optimized for transactions (following useFinancialAnalytics gold standard)
    staleTime: 2 * 60 * 1000, // 2 minutes - transactions change moderately
    gcTime: 10 * 60 * 1000, // 10 minutes - standard cache garbage collection

    // Refetch configuration
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on window focus
    refetchOnReconnect: true, // Refetch when network reconnects

    // Retry configuration (following useFinancialAnalytics pattern)
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Error && error.message.includes('Accounting entries request failed: 4')) {
        return false;
      }
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
  });

  // Create transaction mutation with optimistic updates
  const createMutation = useMutation({
    mutationFn: async (data: CreateAccountingEntryRequest): Promise<AccountingEntryResponse> => {
      const response = await fetch('/api/v1/accounting-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create accounting entry');
      }

      return result;
    },
    onSuccess: (response) => {
      // Optimistically update the accounting entries list for infinite query
      queryClient.setQueryData(['accounting-entries', mergedFilters], (oldData: any) => {
        if (!oldData) return oldData;

        const newTransaction = response.data.transaction;

        // Add to the beginning of the first page
        const newPages = [...oldData.pages];
        if (newPages.length > 0) {
          newPages[0] = {
            ...newPages[0],
            data: {
              ...newPages[0].data,
              transactions: [newTransaction, ...newPages[0].data.transactions]
            }
          };
        }

        return {
          ...oldData,
          pages: newPages
        };
      });

      // Refetch to get accurate counts and pagination
      refetch();
    },
    onError: (error) => {
      console.error('Error creating transaction:', error);
    }
  });

  // Update transaction mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountingEntryRequest }): Promise<AccountingEntryResponse> => {
      const response = await fetch(`/api/v1/accounting-entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update accounting entry');
      }

      return result;
    },
    onMutate: async ({ id }) => {
      setUpdating(prev => new Set(prev).add(id));
    },
    onSuccess: (response, { id }) => {
      // Optimistically update the accounting entry in the infinite query list
      queryClient.setQueryData(['accounting-entries', mergedFilters], (oldData: any) => {
        if (!oldData) return oldData;

        const updatedTransaction = response.data.transaction;

        // Update accounting entry across all pages
        const newPages = oldData.pages.map((page: AccountingEntryListResponse) => ({
          ...page,
          data: {
            ...page.data,
            transactions: page.data.transactions.map(t =>
              t.id === id ? updatedTransaction : t
            )
          }
        }));

        return {
          ...oldData,
          pages: newPages
        };
      });
    },
    onSettled: (_, __, { id }) => {
      setUpdating(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    },
    onError: (error, { id }) => {
      console.error('Error updating transaction:', error);
    }
  });

  // Delete transaction mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<{ success: boolean }> => {
      const response = await fetch(`/api/v1/accounting-entries/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete accounting entry');
      }

      return result;
    },
    onMutate: async (id) => {
      setDeleting(prev => new Set(prev).add(id));

      // Optimistically remove from the infinite query list
      queryClient.setQueryData(['accounting-entries', mergedFilters], (oldData: any) => {
        if (!oldData) return oldData;

        // Remove accounting entry from all pages
        const newPages = oldData.pages.map((page: AccountingEntryListResponse) => ({
          ...page,
          data: {
            ...page.data,
            transactions: page.data.transactions.filter(t => t.id !== id)
          }
        }));

        return {
          ...oldData,
          pages: newPages
        };
      });
    },
    onSuccess: () => {
      // Refetch to get accurate pagination counts
      refetch();
    },
    onSettled: (_, __, id) => {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    },
    onError: (error, id) => {
      console.error('Error deleting transaction:', error);
      // Refetch to restore correct state on error
      refetch();
    }
  });

  // Manual refresh function
  const refreshAccountingEntries = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // CRUD operation wrappers
  const createAccountingEntry = useCallback(async (data: CreateAccountingEntryRequest): Promise<AccountingEntry | null> => {
    try {
      const result = await createMutation.mutateAsync(data);
      return result.data.transaction;
    } catch (error) {
      throw error;
    }
  }, [createMutation]);

  const updateAccountingEntry = useCallback(async (id: string, data: UpdateAccountingEntryRequest): Promise<AccountingEntry | null> => {
    try {
      const result = await updateMutation.mutateAsync({ id, data });
      return result.data.transaction;
    } catch (error) {
      throw error;
    }
  }, [updateMutation]);

  const deleteAccountingEntry = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (error) {
      throw error;
    }
  }, [deleteMutation]);

  // Get accounting entry by ID across all pages
  const getAccountingEntryById = useCallback((id: string): AccountingEntry | undefined => {
    if (!data?.pages) return undefined;

    for (const page of data.pages) {
      const transaction = page.data.transactions.find(t => t.id === id);
      if (transaction) return transaction;
    }
    return undefined;
  }, [data?.pages]);

  // Extract data with fallbacks for infinite query
  const accountingEntries = data?.pages?.flatMap(page => page.data.transactions) || [];
  const totalCount = data?.pages?.[0]?.data?.pagination?.total || 0;

  return {
    accountingEntries,
    loading: isLoading,
    error: isError ? (error instanceof Error ? error.message : 'Failed to fetch accounting entries') : null,
    creating: createMutation.isPending,
    updating,
    deleting,
    hasMore: hasNextPage || false,
    isFetchingMore: isFetchingNextPage,
    totalCount,
    createAccountingEntry,
    updateAccountingEntry,
    deleteAccountingEntry,
    refreshAccountingEntries,
    fetchNextPage,
    getAccountingEntryById
  };
}

// Utility functions for currency formatting (unchanged from original)
export function formatCurrency(amount: number | null | undefined, currency: SupportedCurrency): string {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `${currency} 0.00`;
  }

  try {
    // Use explicit currency code format with comma separators (e.g., "SGD 108.61" or "IDR 101,596,428.00")
    const formattedAmount = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${formattedAmount}`;
  } catch {
    // Fallback for unsupported currencies
    return `0.00 ${currency}`;
  }
}

export function getAccountingEntryTypeColor(type: string): string {
  switch (type) {
    case 'income':
      return 'text-green-400';
    case 'expense':
      return 'text-red-400';
    case 'transfer':
      return 'text-blue-400';
    case 'asset':
      return 'text-purple-400';
    case 'liability':
      return 'text-orange-400';
    case 'equity':
      return 'text-yellow-400';
    default:
      return 'text-gray-400';
  }
}

export function getAccountingEntryTypeIcon(type: string): string {
  switch (type) {
    case 'income':
      return '↗️';
    case 'expense':
      return '↙️';
    case 'transfer':
      return '↔️';
    case 'asset':
      return '📈';
    case 'liability':
      return '📊';
    case 'equity':
      return '🏛️';
    default:
      return '💰';
  }
}