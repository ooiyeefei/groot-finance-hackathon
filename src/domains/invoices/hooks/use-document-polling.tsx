'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DocumentFilters } from './use-documents'

interface Document {
  id: string
  file_name: string
  file_type: string
  file_size: number
  processing_status: 'pending' | 'processing' | 'ocr_processing' | 'completed' | 'failed' | 'classification_failed'
  document_type?: string
  created_at: string
  processed_at?: string
  error_message?: string
  // ... other document properties remain the same for compatibility
}

interface UseDocumentPollingProps {
  documents: Document[]
  filters?: DocumentFilters
  enabled?: boolean
}

interface UseDocumentPollingReturn {
  // Only expose essential polling controls - no document management
  isPolling: boolean
}

/**
 * Refactored polling hook that works with the unified useDocuments data-fetching
 *
 * This hook no longer maintains its own document state or makes fetch calls.
 * Instead, it:
 * 1. Receives documents from the main useDocuments hook
 * 2. Identifies which documents are processing
 * 3. Uses queryClient to trigger refetches of the unified ['documents', filters] query
 *
 * This ensures all data flows through the new /api/v1/invoices endpoint.
 */
export function useDocumentPolling({
  documents,
  filters = {},
  enabled = true
}: UseDocumentPollingProps): UseDocumentPollingReturn {
  const queryClient = useQueryClient()
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)

  // Identify processing documents using the expanded status list from the original hook
  const hasProcessingDocuments = useCallback(() => {
    return documents.some(doc =>
      doc.processing_status === 'processing' ||
      doc.processing_status === 'ocr_processing' ||
      // Keep legacy status support for compatibility during migration
      (doc.processing_status as any) === 'classifying' ||
      (doc.processing_status as any) === 'pending_extraction' ||
      (doc.processing_status as any) === 'extracting'
    )
  }, [documents])

  // Trigger refetch of the unified documents query
  const triggerRefetch = useCallback(() => {
    // Use queryClient to refetch the main documents query
    // This will cause useDocuments to fetch from /api/v1/invoices
    queryClient.refetchQueries({
      queryKey: ['documents', filters],
      type: 'active'
    })
  }, [queryClient, filters])

  // Start polling when processing documents are detected
  const startPolling = useCallback(() => {
    if (pollingInterval.current || !enabled) {
      return // Already polling or disabled
    }

    pollingInterval.current = setInterval(() => {
      if (hasProcessingDocuments()) {
        triggerRefetch()
      } else {
        // No more processing documents, stop polling
        stopPolling()
      }
    }, 3000) // Poll every 3 seconds (same as original)
  }, [hasProcessingDocuments, triggerRefetch, enabled])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }, [])

  // Effect to manage polling based on processing document detection
  useEffect(() => {
    if (!enabled) {
      stopPolling()
      return
    }

    if (hasProcessingDocuments()) {
      startPolling()
    } else {
      stopPolling()
    }

    // Cleanup function
    return () => stopPolling()
  }, [hasProcessingDocuments, startPolling, stopPolling, enabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    isPolling: pollingInterval.current !== null
  }
}