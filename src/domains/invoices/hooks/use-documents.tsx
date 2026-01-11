'use client';

/**
 * Documents Hook - Real-time data + REST mutations
 *
 * MIGRATION: Now uses Convex real-time subscriptions for data fetching.
 * - Data: Convex useQuery (real-time, automatic updates)
 * - Mutations: REST API (file uploads, processing triggers)
 *
 * Benefits:
 * - Instant UI updates when invoice status changes
 * - No polling needed
 * - Better UX during document processing
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useInvoicesRealtime, type Invoice } from './use-invoices-realtime';

// Re-export Invoice type for consumers
export type { Invoice };

// Legacy Document type alias for backward compatibility
export type Document = Invoice;

export interface DocumentFilters {
  businessId?: string;
  search?: string;
  status?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
}

interface UseDocumentsReturn {
  documents: Invoice[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  isFetchingMore: boolean;
  totalCount: number;
  // CRUD operations
  processDocument: (documentId: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  refreshDocuments: () => Promise<void>;
  // Infinite scroll operations (no-op for real-time, kept for API compatibility)
  fetchNextPage: () => void;
  // State tracking
  processingDocuments: Set<string>;
  deletingDocuments: Set<string>;
}

export function useDocuments(filters: DocumentFilters = {}): UseDocumentsReturn {
  // State for tracking processing and deleting operations
  const [processingDocuments, setProcessingDocuments] = useState(new Set<string>());
  const [deletingDocuments, setDeletingDocuments] = useState(new Set<string>());

  // Real-time data from Convex - automatically updates when data changes
  const {
    invoices,
    isLoading,
    error: realtimeError,
    totalCount,
    hasMore,
  } = useInvoicesRealtime({
    businessId: filters.businessId,
    status: filters.status,
    limit: 50,
  });

  // Filter out documents being deleted (optimistic UI)
  const documents = invoices.filter(doc => !deletingDocuments.has(doc.id));

  // Process document mutation
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
    },
    onSettled: (_, __, documentId) => {
      // Remove from processing set
      // Note: Convex real-time will automatically update the status
      setProcessingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    },
    onError: (error, documentId) => {
      console.error('Error processing document:', error);
    }
  });

  // Delete document mutation
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
      // Optimistic removal
      setDeletingDocuments(prev => new Set(prev).add(documentId));
    },
    onSettled: (_, __, documentId) => {
      // Convex real-time will remove the document from the list
      setDeletingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    },
    onError: (error, documentId) => {
      console.error('Error deleting document:', error);
      // Remove from deleting set to restore visibility
      setDeletingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    }
  });

  // CRUD operation wrappers
  const processDocument = useCallback(async (documentId: string): Promise<void> => {
    await processMutation.mutateAsync(documentId);
  }, [processMutation]);

  const deleteDocument = useCallback(async (documentId: string): Promise<void> => {
    await deleteMutation.mutateAsync(documentId);
  }, [deleteMutation]);

  // Refresh is now a no-op since Convex is real-time
  // Kept for API compatibility with existing components
  const refreshDocuments = useCallback(async () => {
    // Real-time subscription handles updates automatically
    // This function is kept for backward compatibility
  }, []);

  // fetchNextPage is a no-op for now (could implement cursor-based pagination later)
  const fetchNextPage = useCallback(() => {
    // Real-time subscription loads all documents up to limit
    // Pagination could be implemented with cursor if needed
  }, []);

  return {
    documents,
    loading: isLoading,
    error: realtimeError ? realtimeError.message : null,
    hasMore,
    isFetchingMore: false, // Real-time doesn't have "fetching more" state
    totalCount,
    processDocument,
    deleteDocument,
    refreshDocuments,
    fetchNextPage,
    processingDocuments,
    deletingDocuments
  };
}
