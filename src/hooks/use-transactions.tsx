'use client';

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Transaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  TransactionListParams,
  SupportedCurrency
} from '@/types/transaction';

interface TransactionListResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
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

interface TransactionResponse {
  success: boolean;
  data: {
    transaction: Transaction;
  };
  error?: string;
}

export interface TransactionFilters {
  search?: string;
  category?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
  vendor_name?: string;
  status?: string;
}

interface UseTransactionsReturn {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  updating: Set<string>;
  deleting: Set<string>;
  hasMore: boolean;
  isFetchingMore: boolean;
  totalCount: number;
  // CRUD operations
  createTransaction: (data: CreateTransactionRequest) => Promise<Transaction | null>;
  updateTransaction: (id: string, data: UpdateTransactionRequest) => Promise<Transaction | null>;
  deleteTransaction: (id: string) => Promise<boolean>;
  refreshTransactions: () => Promise<void>;
  // Infinite scroll operations
  fetchNextPage: () => void;
  // Utility
  getTransactionById: (id: string) => Transaction | undefined;
}

const DEFAULT_FILTERS: TransactionListParams = {
  page: 1,
  limit: 20,
  sort_by: 'created_at',
  sort_order: 'desc'
};

/**
 * Query function for TanStack Query useInfiniteQuery
 * Fetches transactions list from the API endpoint with server-side filtering and cursor-based pagination
 */
const fetchTransactions = async ({ queryKey, pageParam }: { queryKey: any[]; pageParam?: string }): Promise<TransactionListResponse> => {
  const [_key, filters] = queryKey;

  const searchParams = new URLSearchParams();

  // Add pagination parameters
  searchParams.append('limit', '20'); // Default page size for infinite scroll

  // Add cursor parameter for infinite scroll
  if (pageParam) {
    searchParams.append('cursor', pageParam);
  }

  // Add filter parameters for server-side filtering
  if (filters && typeof filters === 'object') {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(`/api/accounting-entries?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Transactions request failed: ${response.status}`);
  }

  const data: TransactionListResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Transactions fetch failed');
  }

  return data;
};

export function useTransactions(filters: TransactionFilters = {}): UseTransactionsReturn {
  const queryClient = useQueryClient();

  // State for tracking operations
  const [updating, setUpdating] = useState(new Set<string>());
  const [deleting, setDeleting] = useState(new Set<string>());

  // Merge user filters with defaults to ensure consistent sorting
  const mergedFilters = {
    ...DEFAULT_FILTERS,
    ...filters
  };

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
    queryKey: ['transactions', mergedFilters],

    // The function that fetches the data
    queryFn: fetchTransactions,

    // Initial page parameter (no cursor for first page)
    initialPageParam: undefined as string | undefined,

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
      if (error instanceof Error && error.message.includes('Transactions request failed: 4')) {
        return false;
      }
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
  });

  // Create transaction mutation with optimistic updates
  const createMutation = useMutation({
    mutationFn: async (data: CreateTransactionRequest): Promise<TransactionResponse> => {
      const response = await fetch('/api/accounting-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create transaction');
      }

      return result;
    },
    onSuccess: (response) => {
      // Optimistically update the transactions list for infinite query
      queryClient.setQueryData(['transactions', mergedFilters], (oldData: any) => {
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
    mutationFn: async ({ id, data }: { id: string; data: UpdateTransactionRequest }): Promise<TransactionResponse> => {
      const response = await fetch(`/api/accounting-entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update transaction');
      }

      return result;
    },
    onMutate: async ({ id }) => {
      setUpdating(prev => new Set(prev).add(id));
    },
    onSuccess: (response, { id }) => {
      // Optimistically update the transaction in the infinite query list
      queryClient.setQueryData(['transactions', mergedFilters], (oldData: any) => {
        if (!oldData) return oldData;

        const updatedTransaction = response.data.transaction;

        // Update transaction across all pages
        const newPages = oldData.pages.map((page: TransactionListResponse) => ({
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
      const response = await fetch(`/api/accounting-entries/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete transaction');
      }

      return result;
    },
    onMutate: async (id) => {
      setDeleting(prev => new Set(prev).add(id));

      // Optimistically remove from the infinite query list
      queryClient.setQueryData(['transactions', mergedFilters], (oldData: any) => {
        if (!oldData) return oldData;

        // Remove transaction from all pages
        const newPages = oldData.pages.map((page: TransactionListResponse) => ({
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
  const refreshTransactions = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // CRUD operation wrappers
  const createTransaction = useCallback(async (data: CreateTransactionRequest): Promise<Transaction | null> => {
    try {
      const result = await createMutation.mutateAsync(data);
      return result.data.transaction;
    } catch (error) {
      throw error;
    }
  }, [createMutation]);

  const updateTransaction = useCallback(async (id: string, data: UpdateTransactionRequest): Promise<Transaction | null> => {
    try {
      const result = await updateMutation.mutateAsync({ id, data });
      return result.data.transaction;
    } catch (error) {
      throw error;
    }
  }, [updateMutation]);

  const deleteTransaction = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (error) {
      throw error;
    }
  }, [deleteMutation]);

  // Get transaction by ID across all pages
  const getTransactionById = useCallback((id: string): Transaction | undefined => {
    if (!data?.pages) return undefined;

    for (const page of data.pages) {
      const transaction = page.data.transactions.find(t => t.id === id);
      if (transaction) return transaction;
    }
    return undefined;
  }, [data?.pages]);

  // Extract data with fallbacks for infinite query
  const transactions = data?.pages?.flatMap(page => page.data.transactions) || [];
  const totalCount = data?.pages?.[0]?.data?.pagination?.total || 0;

  return {
    transactions,
    loading: isLoading,
    error: isError ? (error instanceof Error ? error.message : 'Failed to fetch transactions') : null,
    creating: createMutation.isPending,
    updating,
    deleting,
    hasMore: hasNextPage || false,
    isFetchingMore: isFetchingNextPage,
    totalCount,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    refreshTransactions,
    fetchNextPage,
    getTransactionById
  };
}

// Utility functions for currency formatting (unchanged from original)
export function formatCurrency(amount: number | null | undefined, currency: SupportedCurrency): string {
  // Handle null/undefined amounts
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `${currency} 0.00`;
  }

  try {
    // Use explicit currency code format for better clarity (e.g., "SGD 108.61")
    return `${currency} ${amount.toFixed(2)}`;
  } catch {
    // Fallback for unsupported currencies
    return `0.00 ${currency}`;
  }
}

export function getTransactionTypeColor(type: string): string {
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

export function getTransactionTypeIcon(type: string): string {
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