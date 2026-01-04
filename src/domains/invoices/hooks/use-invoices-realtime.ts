'use client'

/**
 * Real-time invoices hook using Convex subscriptions
 *
 * This hook provides TRUE real-time updates for the invoices list.
 * Unlike polling-based solutions, Convex subscriptions push updates
 * instantly when data changes in the database.
 *
 * Architecture:
 * - useQuery subscribes to Convex query via WebSocket
 * - Any mutation to the invoices table triggers instant UI update
 * - No polling, no manual refresh needed
 */

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useMemo } from 'react'
import { ErrorDetails } from '@/domains/invoices/lib/data-access'

// Extracted data type for OCR results
interface ExtractedDataEntity {
  type: string
  value: string
  bbox?: number[]
}

interface FinancialEntity {
  label: string
  value: string
  category: string
  bbox?: number[]
}

interface LineItem {
  description: string
  quantity?: number
  unit_price?: number
  amount?: number
}

interface ExtractedData {
  entities?: ExtractedDataEntity[]
  financial_entities?: FinancialEntity[]
  line_items?: LineItem[]
  [key: string]: unknown // Allow additional properties
}

// Type for the linked transaction as returned by Convex
interface ConvexLinkedTransaction {
  id: string
  description: string
  originalAmount: number
  originalCurrency: string
  createdAt: number
}

// Type for the invoice as returned by Convex
interface ConvexInvoice {
  _id: Id<'invoices'>
  _creationTime: number
  businessId?: Id<'businesses'>
  userId: Id<'users'>
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  convertedImagePath?: string
  convertedImageWidth?: number
  convertedImageHeight?: number
  status: string
  processingMethod?: string
  processingTier?: number
  confidenceScore?: number
  documentClassificationConfidence?: number
  classificationMethod?: string
  classificationTaskId?: string
  extractionTaskId?: string
  extractedData?: unknown
  processingMetadata?: unknown
  documentMetadata?: unknown
  errorMessage?: unknown
  requiresReview?: boolean
  processingStartedAt?: number
  processedAt?: number
  failedAt?: number
  deletedAt?: number
  updatedAt?: number
  // Joined from accounting_entries via Convex query
  linkedTransaction?: ConvexLinkedTransaction | null
}

// Type for the API response format (matches existing use-documents.tsx)
export interface Invoice {
  id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  converted_image_path?: string
  converted_image_width?: number
  converted_image_height?: number
  status: 'pending' | 'uploading' | 'analyzing' | 'classifying' | 'extracting' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paid' | 'overdue' | 'disputed' | 'classification_failed'
  created_at: string
  processed_at?: string
  error_message?: ErrorDetails | string | null
  extracted_data?: ExtractedData | null
  confidence_score?: number
  // Linked transaction data (joined from accounting_entries)
  linked_transaction?: {
    id: string
    description: string
    original_amount: number
    original_currency: string
    created_at: string
  } | null
}

interface UseInvoicesRealtimeOptions {
  businessId?: string
  status?: string
  limit?: number
}

interface UseInvoicesRealtimeReturn {
  invoices: Invoice[]
  isLoading: boolean
  error: Error | null
  totalCount: number
  hasMore: boolean
  nextCursor: string | null
}

/**
 * Map Convex invoice to API response format
 * This ensures compatibility with existing components
 */
function mapConvexInvoice(invoice: ConvexInvoice): Invoice {
  // DEBUG: Log extractedData from Convex to trace category fields
  if (invoice.extractedData) {
    const ed = invoice.extractedData as Record<string, unknown>
    console.log('[Convex Hook Debug] invoice._id:', invoice._id)
    console.log('[Convex Hook Debug] extractedData keys:', Object.keys(ed))
    console.log('[Convex Hook Debug] suggested_category:', ed.suggested_category)
    console.log('[Convex Hook Debug] accounting_category:', ed.accounting_category)
  }

  return {
    id: invoice._id,
    file_name: invoice.fileName,
    file_type: invoice.fileType,
    file_size: invoice.fileSize,
    storage_path: invoice.storagePath,
    converted_image_path: invoice.convertedImagePath,
    converted_image_width: invoice.convertedImageWidth,
    converted_image_height: invoice.convertedImageHeight,
    status: invoice.status as Invoice['status'],
    created_at: new Date(invoice._creationTime).toISOString(),
    processed_at: invoice.processedAt ? new Date(invoice.processedAt).toISOString() : undefined,
    error_message: invoice.errorMessage as ErrorDetails | string | null | undefined,
    extracted_data: invoice.extractedData as ExtractedData | null | undefined,
    confidence_score: invoice.confidenceScore,
    // Map linked transaction from Convex query join
    linked_transaction: invoice.linkedTransaction
      ? {
          id: invoice.linkedTransaction.id,
          description: invoice.linkedTransaction.description,
          original_amount: invoice.linkedTransaction.originalAmount,
          original_currency: invoice.linkedTransaction.originalCurrency,
          created_at: new Date(invoice.linkedTransaction.createdAt).toISOString(),
        }
      : null,
  }
}

/**
 * Real-time hook for invoices using Convex subscriptions
 *
 * Usage:
 * ```tsx
 * const { invoices, isLoading, error } = useInvoicesRealtime({
 *   businessId: 'abc123',
 *   status: 'pending',
 * })
 * ```
 */
export function useInvoicesRealtime(options: UseInvoicesRealtimeOptions = {}): UseInvoicesRealtimeReturn {
  const { businessId, status, limit = 50 } = options

  // Subscribe to Convex query - this creates a real-time subscription
  const result = useQuery(
    api.functions.invoices.list,
    {
      businessId: businessId ? (businessId as Id<'businesses'>) : undefined,
      status,
      limit,
    }
  )

  // Map Convex response to API format
  const invoices = useMemo(() => {
    if (!result?.invoices) return []
    return result.invoices.map(mapConvexInvoice)
  }, [result?.invoices])

  return {
    invoices,
    isLoading: result === undefined,
    error: null, // Convex throws errors, doesn't return them
    totalCount: result?.totalCount ?? 0,
    hasMore: result?.nextCursor !== null,
    nextCursor: result?.nextCursor ?? null,
  }
}
