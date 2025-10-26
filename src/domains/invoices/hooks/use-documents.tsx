'use client';

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: 'pending' | 'uploading' | 'analyzing' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classifying' | 'classification_failed';
  created_at: string;
  processed_at?: string;
  error_message?: string;
  extracted_data?: {
    text: string;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    document_summary?: {
      document_type?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      vendor_name?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      total_amount?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      transaction_date?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
    };
    financial_entities?: Array<{
      label: string;
      value: string;
      category: string;
      confidence: number;
      bbox?: number[];
    }>;
    line_items?: Array<{
      description?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      item_code?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      quantity?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      unit_measurement?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      unit_price?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
      line_total?: {
        value: string;
        confidence: number;
        bbox?: number[];
      };
    }>;
    metadata: {
      pageCount?: number;
      wordCount: number;
      language?: string;
      processingMethod?: 'ocr';
      layoutElements?: Array<{
        bbox?: number[];
        category?: string;
        text?: string;
      }>;
      boundingBoxes?: Array<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        category: string;
        text: string;
      }>;
    };
  };
  confidence_score?: number;
  linked_transaction?: {
    id: string;
    description: string;
    original_amount: number;
    original_currency: string;
    created_at: string;
  };
}

interface DocumentsListResponse {
  success: boolean;
  data: {
    documents: Document[];
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

export interface DocumentFilters {
  search?: string;
  status?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
}

interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  isFetchingMore: boolean;
  totalCount: number;
  // CRUD operations
  processDocument: (documentId: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  refreshDocuments: () => Promise<void>;
  // Infinite scroll operations
  fetchNextPage: () => void;
  // State tracking
  processingDocuments: Set<string>;
  deletingDocuments: Set<string>;
}

/**
 * Query function for TanStack Query useInfiniteQuery
 * Fetches documents list from the API endpoint with server-side filtering and cursor-based pagination
 */
const fetchDocuments = async ({ queryKey, pageParam }: { queryKey: any[]; pageParam?: string }): Promise<DocumentsListResponse> => {
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

  const response = await fetch(`/api/v1/invoices?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Documents request failed: ${response.status}`);
  }

  const data: DocumentsListResponse = await response.json();


  if (!data.success) {
    throw new Error(data.error || 'Documents fetch failed');
  }

  return data;
};

export function useDocuments(filters: DocumentFilters = {}): UseDocumentsReturn {
  const queryClient = useQueryClient();

  // State for tracking processing and deleting operations
  const [processingDocuments, setProcessingDocuments] = useState(new Set<string>());
  const [deletingDocuments, setDeletingDocuments] = useState(new Set<string>());

  // TanStack Query useInfiniteQuery for documents with server-side filtering
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
    queryKey: ['documents', filters],

    // The function that fetches the data
    queryFn: fetchDocuments,

    // Initial page parameter (no cursor for first page)
    initialPageParam: undefined as string | undefined,

    // Function to determine the next page parameter (cursor)
    getNextPageParam: (lastPage) => {
      return lastPage.data.nextCursor || undefined;
    },

    // ⚡ OPTIMIZATION: Extended cache configuration to reduce redundant API calls
    staleTime: 5 * 60 * 1000, // 5 minutes (was 30s) - keep data fresh for longer, reduce API calls
    gcTime: 30 * 60 * 1000, // 30 minutes (was 5m) - keep in cache longer for better UX on tab switches

    // Refetch configuration
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on window focus
    refetchOnReconnect: false, // Don't refetch on network reconnect (rely on staleTime instead)

    // Smart refetch for processing documents - auto-refetch every 3 seconds if processing documents exist
    refetchInterval: (query) => {
      const allDocuments = query.state.data?.pages?.flatMap(page => page.data.documents) || [];
      const hasProcessingDocuments = allDocuments.some((doc: Document) =>
        doc.status === 'analyzing' || doc.status === 'classifying'
      );
      return hasProcessingDocuments ? 3000 : false; // 3 seconds polling for processing documents
    },

    // Retry configuration (following useAccountingEntries pattern)
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Error && error.message.includes('Documents request failed: 4')) {
        return false;
      }
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
  });

  // Process document mutation with optimistic updates
  const processMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/v1/invoices/${documentId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process document');
      }

      return result;
    },
    onMutate: async (documentId) => {
      setProcessingDocuments(prev => new Set(prev).add(documentId));

      // Optimistically update the document status to 'processing'
      queryClient.setQueryData(['documents', filters], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: DocumentsListResponse) => ({
          ...page,
          data: {
            ...page.data,
            documents: page.data.documents.map((doc: Document) =>
              doc.id === documentId
                ? {
                    ...doc,
                    status: 'analyzing' as const,
                    error_message: undefined // Clear any previous error messages
                  }
                : doc
            )
          }
        }));

        return {
          ...oldData,
          pages: newPages
        };
      });
    },
    onSuccess: () => {
      // Refetch to get the latest server state
      refetch();
    },
    onError: (error, documentId) => {
      console.error('Error processing document:', error);

      // Update with error status
      queryClient.setQueryData(['documents', filters], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: DocumentsListResponse) => ({
          ...page,
          data: {
            ...page.data,
            documents: page.data.documents.map((doc: Document) =>
              doc.id === documentId
                ? {
                    ...doc,
                    status: 'failed',
                    error_message: error instanceof Error ? error.message : 'Network error occurred while processing'
                  }
                : doc
            )
          }
        }));

        return {
          ...oldData,
          pages: newPages
        };
      });
    },
    onSettled: (_, __, documentId) => {
      // Remove from processing set
      setProcessingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    }
  });

  // Delete document mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/v1/invoices/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete document');
      }

      return result;
    },
    onMutate: async (documentId) => {
      setDeletingDocuments(prev => new Set(prev).add(documentId));

      // Optimistically remove document from the infinite query list
      queryClient.setQueryData(['documents', filters], (oldData: any) => {
        if (!oldData) return oldData;

        // Remove document from all pages
        const newPages = oldData.pages.map((page: DocumentsListResponse) => ({
          ...page,
          data: {
            ...page.data,
            documents: page.data.documents.filter((doc: Document) => doc.id !== documentId)
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
    onSettled: (_, __, documentId) => {
      setDeletingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    },
    onError: (error, documentId) => {
      console.error('Error deleting document:', error);
      // Refetch to restore correct state on error
      refetch();
    }
  });

  // Manual refresh function
  const refreshDocuments = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // CRUD operation wrappers
  const processDocument = useCallback(async (documentId: string): Promise<void> => {
    try {
      await processMutation.mutateAsync(documentId);
    } catch (error) {
      throw error;
    }
  }, [processMutation]);

  const deleteDocument = useCallback(async (documentId: string): Promise<void> => {
    try {
      await deleteMutation.mutateAsync(documentId);
    } catch (error) {
      throw error;
    }
  }, [deleteMutation]);

  // Extract data with fallbacks for infinite query
  const documents = data?.pages?.flatMap(page => page.data.documents) || [];
  const totalCount = data?.pages?.[0]?.data?.pagination?.total || 0;

  // Auto-cleanup processingDocuments set when documents are no longer processing
  useState(() => {
    setProcessingDocuments(prev => {
      const newSet = new Set(prev);
      documents.forEach((doc: Document) => {
        if (doc.status !== 'analyzing' && doc.status !== 'classifying') {
          newSet.delete(doc.id);
        }
      });
      return newSet;
    });
  });

  return {
    documents,
    loading: isLoading,
    error: isError ? (error instanceof Error ? error.message : 'Failed to fetch documents') : null,
    hasMore: hasNextPage || false,
    isFetchingMore: isFetchingNextPage,
    totalCount,
    processDocument,
    deleteDocument,
    refreshDocuments,
    fetchNextPage,
    processingDocuments,
    deletingDocuments
  };
}