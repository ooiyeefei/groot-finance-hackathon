'use client'

import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { FileText, Image, File, Play, RotateCcw, Eye, FileSearch, Trash2, Plus, Loader2, CheckSquare, Square, CheckCircle2 } from 'lucide-react'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { useDocuments } from '@/domains/invoices/hooks/use-documents'
import DocumentStatusBadge from './document-status-badge'
import ConfidenceScoreMeter from './confidence-score-meter'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { formatCurrency } from '@/lib/utils/format-number'
import ExtractedInfoTags from './ExtractedInfoTags'
import VendorContextNote from '@/domains/payables/components/vendor-context-note'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { ErrorMessageCard } from '@/components/ui/error-message-card'
import type { ErrorDetails } from '@/domains/invoices/lib/data-access'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

// Type guard for ErrorDetails
function isErrorDetails(value: unknown): value is ErrorDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as ErrorDetails).message === 'string'
  )
}

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const DocumentAnalysisModal = lazy(() => import('./document-analysis-modal'))
const ConfirmationDialog = lazy(() => import('@/components/ui/confirmation-dialog'))

// ⚡ OPTIMIZATION: Preload functions for hover-triggered modal loading (improves perceived performance)
const preloadDocumentAnalysisModal = () => import('./document-analysis-modal')
const preloadConfirmationDialog = () => import('@/components/ui/confirmation-dialog')


// Map raw Post-to-AP errors to user-friendly messages with resolution guidance
function formatPostToAPError(raw: string): { title: string; description: string } {
  // Period closed — extract period code from ConvexError JSON or plain text
  if (raw.includes('PERIOD_CLOSED') || raw.includes('closed accounting period')) {
    const periodMatch = raw.match(/period(?:Code)?["\s:]+(\d{4}-\d{2})/i)
    const period = periodMatch?.[1] || 'current period'
    return {
      title: 'Accounting period closed',
      description: `The accounting period ${period} is closed. Go to Settings > Accounting to reopen it, then try again.`
    }
  }
  if (raw.includes('Chart of accounts not configured')) {
    return {
      title: 'Chart of accounts missing',
      description: 'Your business needs Expense (5100) and AP (2100) accounts. Go to Accounting > Chart of Accounts to set them up.'
    }
  }
  if (raw.includes('Invoice not ready for posting')) {
    return {
      title: 'Invoice not ready',
      description: 'The invoice is still processing or missing extracted data. Wait for OCR to complete, then try again.'
    }
  }
  if (raw.includes('Invalid amount')) {
    return {
      title: 'Invalid invoice amount',
      description: 'The invoice total amount is missing or zero. Check the extracted data and correct the amount.'
    }
  }
  if (raw.includes('Already posted')) {
    return {
      title: 'Already posted',
      description: 'This invoice has already been posted to AP. Check the Accounting > Journal Entries page.'
    }
  }
  // Fallback — show cleaned message
  return {
    title: 'Post to AP failed',
    description: raw.length > 150 ? raw.substring(0, 150) + '...' : raw
  }
}

interface DocumentsListProps {
  onRefresh?: () => void
}

interface DocumentsListRef {
  refreshDocuments: () => Promise<void>
}

const DocumentsList = forwardRef<DocumentsListRef, DocumentsListProps>(({ onRefresh }, ref) => {
  const router = useRouter()
  const locale = useLocale()
  const { currency: userHomeCurrency } = useHomeCurrency()
  const { businessId } = useActiveBusiness()

  // Helper function to check if document is completed and has extractable data
  const isCompletedDocument = (status: string) => {
    return status === 'pending' || status === 'paid' || status === 'overdue' || status === 'disputed'
  }
  const { addToast } = useToast()
  // Use the unified documents hook for data fetching
  // CRITICAL: Pass businessId for multi-tenant data isolation
  const {
    documents,
    loading,
    error,
    refreshDocuments,
    processDocument,
    deleteDocument,
    processingDocuments,
    deletingDocuments
  } = useDocuments({ businessId: businessId ?? undefined })

  // Note: useDocumentPolling removed - use-documents hook handles polling for invoices

  const [selectedDocument, setSelectedDocument] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    documentId: string | null
    isLoading: boolean
  }>({
    isOpen: false,
    documentId: null,
    isLoading: false
  })
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [isPostingToAP, setIsPostingToAP] = useState(false)
  const [reprocessedDocuments, setReprocessedDocuments] = useState<Set<string>>(new Set())

  // Mutation for posting to AP
  const postToAPMutation = useMutation(api.functions.invoices.postToAP)

  // Expose refresh method to parent via ref
  useImperativeHandle(ref, () => ({
    refreshDocuments: async () => {
      await refreshDocuments()
    }
  }), [refreshDocuments])

  // CRITICAL FIX: Re-fetch documents when active business context changes
  useEffect(() => {
    if (businessId) {
      refreshDocuments()
    }
  }, [businessId, refreshDocuments])

  // Handle refresh from parent component
  // ⚡ OPTIMIZATION: Memoize handlers to prevent child re-renders (saves 100-300ms per interaction)
  const handleRefresh = useCallback(async () => {
    await refreshDocuments()
    onRefresh?.()
  }, [refreshDocuments, onRefresh])

  // Handle retry processing for failed documents
  const retryProcessing = useCallback(async (documentId: string) => {
    await processDocument(documentId)
  }, [processDocument])

  // Handle reprocess for completed documents
  const reprocessDocument = useCallback(async (documentId: string) => {
    await processDocument(documentId)
    // Track that this document has been reprocessed
    setReprocessedDocuments(prev => new Set(prev).add(documentId))
  }, [processDocument])

  // Handle delete confirmation
  const handleDeleteClick = useCallback((documentId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      documentId,
      isLoading: false
    })
  }, [])

  // Handle delete execution
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmation.documentId) return

    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))

    try {
      await deleteDocument(deleteConfirmation.documentId)
      setDeleteConfirmation({
        isOpen: false,
        documentId: null,
        isLoading: false
      })

      // Show success message
      addToast({
        type: 'success',
        title: 'Document deleted',
        description: 'The document has been successfully deleted'
      })
    } catch (error) {
      console.error('Delete failed:', error)
      // Keep dialog open on error, just stop loading
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))

      // Show error message
      addToast({
        type: 'error',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete the document'
      })
    }
  }, [deleteConfirmation.documentId, deleteDocument, addToast])

  // Cancel delete
  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmation({
      isOpen: false,
      documentId: null,
      isLoading: false
    })
  }, [])

  // Handle invoice selection toggle
  const toggleInvoiceSelection = useCallback((invoiceId: string) => {
    setSelectedInvoices(prev => {
      const newSet = new Set(prev)
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId)
      } else {
        newSet.add(invoiceId)
      }
      return newSet
    })
  }, [])

  // Handle select all postable invoices
  const handleSelectAllPostable = useCallback(() => {
    const postableInvoices = documents.filter(doc => {
      const isCompleted = ['completed', 'pending', 'paid', 'overdue'].includes(doc.status)
      const hasData = !!doc.extracted_data
      const notPosted = (doc as any).accountingStatus !== 'posted'
      return isCompleted && hasData && notPosted
    })
    setSelectedInvoices(new Set(postableInvoices.map(d => d.id)))
  }, [documents])

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedInvoices(new Set())
  }, [])

  // Handle post to AP
  const handlePostToAP = useCallback(async () => {
    if (selectedInvoices.size === 0 || !businessId) return

    setIsPostingToAP(true)
    try {
      const result = await postToAPMutation({
        invoiceIds: Array.from(selectedInvoices) as Id<"invoices">[],
        businessId: businessId as Id<"businesses">,
      })

      if (result.succeeded > 0) {
        addToast({
          type: 'success',
          title: 'Posted to AP',
          description: result.failed > 0
            ? `Posted ${result.succeeded} of ${result.total} invoices. ${result.failed} failed.`
            : `Successfully posted ${result.succeeded} invoice${result.succeeded > 1 ? 's' : ''} to AP`
        })
      } else {
        // All failed — show user-friendly error with resolution guidance
        const firstError = result.results?.find((r: { success: boolean; error?: string }) => !r.success)?.error || 'Unknown error'
        const { title, description } = formatPostToAPError(firstError)
        addToast({ type: 'error', title, description })
      }

      // Clear selection and refresh
      setSelectedInvoices(new Set())
      await refreshDocuments()
    } catch (error) {
      console.error('Post to AP failed:', error)
      const rawMsg = error instanceof Error ? error.message : 'Unable to post invoices to AP'
      const { title, description } = formatPostToAPError(rawMsg)
      addToast({ type: 'error', title, description })
    } finally {
      setIsPostingToAP(false)
    }
  }, [selectedInvoices, businessId, postToAPMutation, addToast, refreshDocuments])

  // Handle viewing extracted data
  const viewExtractedData = (documentId: string) => {
    setSelectedDocument(documentId)
  }

  // Close extracted data modal
  const closeModal = () => {
    setSelectedDocument(null)
  }

  // Get document by ID for modal display
  const getDocumentById = (id: string) => {
    return documents.find(doc => doc.id === id)
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-primary" />
    } else if (fileType === 'application/pdf') {
      return <FileText className="w-5 h-5 text-primary" />
    }
    return <File className="w-5 h-5 text-muted-foreground" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Extract compact title from extracted data
  const getCompactTitle = (document: any) => {
    if (!document.extracted_data) return null

    const extractedData = document.extracted_data
    const vendorName = extractedData?.vendor_name
      || extractedData?.document_summary?.vendor_name?.value
      || null
    const totalAmount = extractedData?.total_amount
      || extractedData?.document_summary?.total_amount?.value
      || null
    const currency = extractedData?.currency
      || extractedData?.document_summary?.currency?.value
      || userHomeCurrency
      || 'MYR'
    const invoiceNumber = extractedData?.document_number
      || extractedData?.invoice_number
      || extractedData?.document_summary?.document_number?.value
      || null

    if (!vendorName && !totalAmount) return null

    const parts: string[] = []
    if (vendorName) parts.push(vendorName)
    if (totalAmount) parts.push(formatCurrency(totalAmount, currency))
    if (invoiceNumber) parts.push(`Invoice: ${invoiceNumber}`)

    return parts.join(' | ')
  }

  // Check if invoice can be posted to AP
  const canPostToAP = (document: any) => {
    const isCompleted = ['completed', 'pending', 'paid', 'overdue'].includes(document.status)
    const hasData = !!document.extracted_data
    const notPosted = (document as any).accountingStatus !== 'posted'
    return isCompleted && hasData && notPosted
  }

  // Count postable invoices
  const postableCount = useMemo(() => {
    return documents.filter(canPostToAP).length
  }, [documents])

  if (loading) {
    return <SkeletonLoader variant="list" count={5} />
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No documents uploaded yet.</p>
        <p className="text-muted-foreground text-sm mt-1">Upload your first document above to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Bulk Action Bar */}
      {postableCount > 0 && (
        <div className="bg-card rounded-lg border border-border px-3 py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground">
                {selectedInvoices.size} of {postableCount} invoices selected
              </span>
              <Button
                onClick={handleSelectAllPostable}
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary/80"
              >
                Select All Postable
              </Button>
              {selectedInvoices.size > 0 && (
                <Button
                  onClick={handleClearSelection}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
            <Button
              onClick={handlePostToAP}
              disabled={selectedInvoices.size === 0 || isPostingToAP}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
            >
              {isPostingToAP ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Post to AP ({selectedInvoices.size})
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {documents.map((document) => (
          <div
            key={document.id}
            className="bg-muted/50 rounded-lg border border-border px-3 py-2 hover:bg-muted/70 transition-colors overflow-hidden"
          >
            {/* Desktop: single row | Mobile: stacked sections */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              {/* Checkbox + File info */}
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {/* Checkbox for postable invoices */}
                {canPostToAP(document) && (
                  <button
                    onClick={() => toggleInvoiceSelection(document.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Select invoice"
                  >
                    {selectedInvoices.has(document.id) ? (
                      <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                )}

                {getFileIcon(document.file_type)}
                <div className="flex-1 min-w-0">
                  {/* Compact title: VENDOR | Amount | Invoice: NUMBER */}
                  {getCompactTitle(document) ? (
                    <>
                      <h4 className="text-foreground font-medium truncate text-sm">
                        {getCompactTitle(document)}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {document.file_name} &middot; {formatFileSize(document.file_size)} &middot; {formatDate(document.created_at)}
                      </p>
                    </>
                  ) : (
                    <>
                      <h4 className="text-foreground font-medium truncate text-sm">
                        {document.file_name}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatFileSize(document.file_size)} &middot; {formatDate(document.created_at)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Badges + Actions */}
              <div className="flex flex-row items-center gap-1.5 sm:flex-col sm:items-end sm:space-y-1 min-w-0 max-w-full flex-wrap">
                <div className="doc-badges flex items-center flex-wrap gap-2">
                  <DocumentStatusBadge
                    status={document.status}
                    errorMessage={document.error_message}
                  />
                  
                  {/* AP Accounting Status Tag */}
                  {document.accountingStatus === 'posted' ? (
                    <button
                      onClick={() => {
                        if (document.journalEntryId) {
                          router.push(`/${locale}/accounting?tab=journal-entries&entry=${document.journalEntryId}`)
                        }
                      }}
                      className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors cursor-pointer"
                      title="Click to view journal entry"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Posted
                    </button>
                  ) : isCompletedDocument(document.status) && document.extracted_data ? (
                    <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                      Not Posted
                    </span>
                  ) : null}

                  {/* Show confidence score for completed documents */}
                  {isCompletedDocument(document.status) && document.confidence_score && (
                    <ConfidenceScoreMeter
                      score={document.confidence_score}
                      entityCount={document.extracted_data?.entities?.length}
                      size="sm"
                    />
                  )}

                  {/* 024-einv-buyer-reject-pivot: LHDN e-invoice status badge */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const doc = document as any
                    const verStatus = doc.lhdnVerificationStatus as string | undefined
                    const lhdnStatus = doc.lhdnStatus as string | undefined
                    const validatedAt = doc.lhdnValidatedAt as number | undefined
                    if (!verStatus || verStatus === 'not_einvoice') return null

                    const isRejected = lhdnStatus === 'rejected'
                    const withinWindow = validatedAt ? Date.now() - validatedAt < 72 * 60 * 60 * 1000 : false
                    const hoursLeft = validatedAt ? Math.max(0, Math.floor((72 * 60 * 60 * 1000 - (Date.now() - validatedAt)) / (60 * 60 * 1000))) : 0

                    if (isRejected) return (
                      <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 text-xs font-medium">
                        Rejected
                      </span>
                    )
                    if (verStatus === 'verified' && withinWindow) return (
                      <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                        {hoursLeft}h left to reject
                      </span>
                    )
                    if (verStatus === 'verified') return (
                      <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                        LHDN ✓
                      </span>
                    )
                    if (verStatus === 'pending') return (
                      <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">
                        LHDN...
                      </span>
                    )
                    return null
                  })()}
                </div>
                
                <div className="doc-actions flex items-center flex-wrap gap-2">

                  {/* Analyze Document button for completed documents */}
                  {isCompletedDocument(document.status) && document.extracted_data && (
                    <Button
                      onClick={() => viewExtractedData(document.id)}
                      onMouseEnter={preloadDocumentAnalysisModal}
                      variant="view"
                      size="sm"
                      title="Analyze"
                      className="doc-action-btn"
                    >
                      <FileSearch className="w-4 h-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Analyze</span>
                    </Button>
                  )}

                  {/* Reprocess button for completed documents */}
                  {isCompletedDocument(document.status) && (
                    <Button
                      onClick={() => reprocessDocument(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      variant="primary"
                      size="sm"
                      title="Reprocess"
                      className="doc-action-btn"
                    >
                      {processingDocuments.has(document.id) ? (
                        <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 sm:mr-1.5" />
                      )}
                      <span className="hidden sm:inline">{processingDocuments.has(document.id) ? 'Processing...' : 'Reprocess'}</span>
                    </Button>
                  )}

                  {/* Retry button for failed documents */}
                  {document.status === 'failed' && (
                    <Button
                      onClick={() => retryProcessing(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      variant="primary"
                      size="sm"
                      title="Retry"
                      className="doc-action-btn"
                    >
                      <RotateCcw className="w-4 h-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Retry</span>
                    </Button>
                  )}

                  {/* Delete button for all documents */}
                  <Button
                    onClick={() => handleDeleteClick(document.id)}
                    onMouseEnter={preloadConfirmationDialog}
                    disabled={deletingDocuments.has(document.id)}
                    variant="destructive"
                    size="sm"
                    title="Delete"
                    className="doc-action-btn"
                  >
                    <Trash2 className="w-4 h-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Show error details for classification failed documents */}
            {document.status === 'classification_failed' && document.error_message && (() => {
              const errorMsg = document.error_message
              const message = isErrorDetails(errorMsg)
                ? errorMsg.message
                : typeof errorMsg === 'string'
                ? errorMsg
                : 'Classification failed'
              const suggestions = isErrorDetails(errorMsg)
                ? errorMsg.suggestions || []
                : []

              return <ErrorMessageCard message={message} suggestions={suggestions} />
            })()}
          </div>
        ))}
      </div>

      {/* Document Analysis Modal */}
      {selectedDocument && getDocumentById(selectedDocument) && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-primary-foreground" /></div>}>
          <DocumentAnalysisModal
            document={getDocumentById(selectedDocument)! as any}
            onClose={closeModal}
          />
        </Suspense>
      )}

      {/* Standardized Delete Confirmation Dialog - wrapped in conditional to prevent Suspense flash on page load */}
      {deleteConfirmation.isOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-6 h-6 animate-spin text-primary-foreground" /></div>}>
          <ConfirmationDialog
            isOpen={deleteConfirmation.isOpen}
            onClose={handleDeleteCancel}
            onConfirm={handleDeleteConfirm}
            title="Delete Document"
            message="Are you sure you want to delete this document? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
            confirmVariant="danger"
            isLoading={deleteConfirmation.isLoading}
          />
        </Suspense>
      )}
    </div>
  )
})

DocumentsList.displayName = 'DocumentsList'

export default DocumentsList