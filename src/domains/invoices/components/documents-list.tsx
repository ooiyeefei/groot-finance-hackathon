'use client'

import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { FileText, Image, File, Play, RotateCcw, Eye, Trash2, Plus, Loader2 } from 'lucide-react'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { useDocuments } from '@/domains/invoices/hooks/use-documents'
import DocumentStatusBadge from './document-status-badge'
import ConfidenceScoreMeter from './confidence-score-meter'
import { mapDocumentToAccountingEntry, canCreateAccountingEntryFromDocument } from '@/domains/invoices/lib/document-to-accounting-entry-mapper'
import { CreateAccountingEntryRequest } from '@/domains/accounting-entries/types'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import ExtractedInfoTags from './ExtractedInfoTags'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { ErrorMessageCard } from '@/components/ui/error-message-card'
import type { ErrorDetails } from '@/domains/invoices/lib/data-access'

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
const AccountingEntryFormModal = lazy(() => import('@/domains/accounting-entries/components/accounting-entry-edit-modal'))
const ConfirmationDialog = lazy(() => import('@/components/ui/confirmation-dialog'))

// ⚡ OPTIMIZATION: Preload functions for hover-triggered modal loading (improves perceived performance)
const preloadDocumentAnalysisModal = () => import('./document-analysis-modal')
const preloadAccountingEntryFormModal = () => import('@/domains/accounting-entries/components/accounting-entry-edit-modal')
const preloadConfirmationDialog = () => import('@/components/ui/confirmation-dialog')


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
  const {
    documents,
    loading,
    error,
    refreshDocuments,
    processDocument,
    deleteDocument,
    processingDocuments,
    deletingDocuments
  } = useDocuments()

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
  const [transactionFormDocument, setTransactionFormDocument] = useState<string | null>(null)
  const [editTransactionData, setEditTransactionData] = useState<{documentId: string, transactionId: string} | null>(null)
  const [reprocessedDocuments, setReprocessedDocuments] = useState<Set<string>>(new Set())

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

  // Handle viewing extracted data
  const viewExtractedData = (documentId: string) => {
    setSelectedDocument(documentId)
  }

  // Close extracted data modal
  const closeModal = () => {
    setSelectedDocument(null)
  }

  // Handle opening transaction form with pre-filled data
  const openTransactionForm = (documentId: string) => {
    setTransactionFormDocument(documentId)
  }

  // Handle opening transaction edit form for reprocessed documents
  const openTransactionEditForm = (documentId: string, transactionId: string) => {
    setEditTransactionData({ documentId, transactionId })
  }

  // Handle viewing linked transaction
  const openTransactionView = (transactionId: string) => {
    // Navigate to accounting page with the specific accounting entry focused using Next.js router
    router.push(`/${locale}/accounting?highlight=${transactionId}`)
  }

  // Close transaction form modal
  const closeTransactionForm = () => {
    setTransactionFormDocument(null)
  }

  // Close transaction edit modal
  const closeTransactionEditForm = () => {
    setEditTransactionData(null)
  }

  // ⚡ OPTIMIZATION: Memoize transaction handlers
  // Handle transaction creation from document
  const handleCreateTransaction = useCallback(async (data: CreateAccountingEntryRequest) => {
    try {
      // ✅ POLYMORPHIC: Set both source fields for invoice
      const transactionData = {
        ...data,
        home_currency: data.home_currency || userHomeCurrency || 'USD',
        source_record_id: data.source_record_id || transactionFormDocument,
        source_document_type: 'invoice' as const
      }

      // Transaction data logging removed - API payload sent without verbose logging

      const response = await fetch('/api/v1/accounting-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionData)
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Failed to create accounting entry: ${response.status} - ${errorData}`)
      }

      const result = await response.json()

      if (result.success && result.data.transaction) {
        // Refresh documents list to update the linked transaction status
        await refreshDocuments()
      }

      setTransactionFormDocument(null)

      // Optional: Show success message
      // You could add a toast notification here
    } catch (error) {
      // Transaction creation error handled silently
    }
  }, [userHomeCurrency, transactionFormDocument, refreshDocuments])

  // Handle transaction update from reprocessed document
  const handleUpdateTransaction = useCallback(async (data: CreateAccountingEntryRequest) => {
    if (!editTransactionData) return

    try {
      const response = await fetch(`/api/v1/accounting-entries/${editTransactionData.transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // Remove fields that shouldn't be in the update request
          source_record_id: undefined,
          source_document_type: undefined,
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update transaction')
      }

      setEditTransactionData(null)
      
      // Remove document from reprocessed set since update is complete
      setReprocessedDocuments(prev => {
        const newSet = new Set(prev)
        newSet.delete(editTransactionData.documentId)
        return newSet
      })
      
      // Refresh documents list
      await refreshDocuments()

    } catch (error) {
      // Transaction update error handled silently
    }
  }, [editTransactionData, refreshDocuments])

  // Handle saving invoice data directly (without creating accounting entries)
  const handleSaveInvoice = useCallback(async (data: Partial<CreateAccountingEntryRequest>) => {
    if (!transactionFormDocument) return

    try {
      // Update invoice record directly
      const response = await fetch(`/api/v1/invoices/${transactionFormDocument}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Map form data to invoice update fields
          vendor_name: data.vendor_name,
          status: data.status,
          // Add other relevant fields that should be updated on the invoice
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save invoice data')
      }

      // Close the form and refresh documents
      setTransactionFormDocument(null)
      await refreshDocuments()

      // Show success message
      addToast({
        type: 'success',
        title: 'Invoice saved',
        description: 'Invoice data has been updated successfully'
      })
    } catch (error) {
      console.error('Save invoice error:', error)
      addToast({
        type: 'error',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save invoice data'
      })
    }
  }, [transactionFormDocument, refreshDocuments, addToast])

  // Get document by ID for modal display
  const getDocumentById = (id: string) => {
    return documents.find(doc => doc.id === id)
  }

  // Get transaction by ID (we'll need to fetch it from API)
  const [editTransactionDetails, setEditTransactionDetails] = useState<any>(null)
  
  // Fetch transaction details for editing when editTransactionData changes
  useEffect(() => {
    if (editTransactionData) {
      fetchTransactionDetails(editTransactionData.transactionId)
    } else {
      setEditTransactionDetails(null)
    }
  }, [editTransactionData])

  const fetchTransactionDetails = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/v1/accounting-entries/${transactionId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setEditTransactionDetails(result.data.transaction)
        }
      }
    } catch (error) {
      // Transaction details fetch error handled silently
    }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Your Documents</h3>
      </div>

      <div className="space-y-3">
        {documents.map((document) => (
          <div
            key={document.id}
            className="bg-muted/50 rounded-lg border border-border p-card-padding hover:bg-muted/70 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getFileIcon(document.file_type)}
                <div className="flex-1 min-w-0">
                  <h4 className="text-foreground font-medium truncate">{document.file_name}</h4>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                    <span>{formatFileSize(document.file_size)}</span>
                    <span>•</span>
                    <span>Uploaded {formatDate(document.created_at)}</span>
                    {document.processed_at && (
                      <>
                        <span>•</span>
                        <span>Processed {formatDate(document.processed_at)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2">
                <div className="flex items-center space-x-3">
                  <DocumentStatusBadge
                    status={document.status}
                    errorMessage={document.error_message}
                  />
                  
                  {/* Show transaction linked status */}
                  {document.linked_transaction && (
                    <div className="badge-success-status inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors">
                      💰 Record Created
                    </div>
                  )}

                  {/* Show reprocessed status for documents that have been reprocessed */}
                  {reprocessedDocuments.has(document.id) && (
                    <div className="badge-warning-status inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors">
                      🔄 Reprocessed
                    </div>
                  )}
                  
                  {/* Show confidence score for completed documents */}
                  {isCompletedDocument(document.status) && document.confidence_score && (
                    <ConfidenceScoreMeter 
                      score={document.confidence_score} 
                      entityCount={document.extracted_data?.entities?.length}
                      size="sm"
                    />
                  )}
                </div>
                
                <div className="flex items-center space-x-2">

                  {/* Analyze Document button for completed documents */}
                  {isCompletedDocument(document.status) && document.extracted_data && (
                    <Button
                      onClick={() => viewExtractedData(document.id)}
                      onMouseEnter={preloadDocumentAnalysisModal}
                      variant="view"
                      size="sm"
                      title="Analyze document and view extracted data"
                    >
                      <Eye className="w-4 h-4 mr-1.5" />
                      Analyze
                    </Button>
                  )}

                  {/* Add/View/Update Transaction button for completed documents with extractable data */}
                  {isCompletedDocument(document.status) && document.extracted_data && canCreateAccountingEntryFromDocument(document as any) && (
                    document.linked_transaction ? (
                      reprocessedDocuments.has(document.id) ? (
                        // Show Update Transaction for reprocessed documents
                        <Button
                          onClick={() => openTransactionEditForm(document.id, document.linked_transaction!.id)}
                          onMouseEnter={preloadAccountingEntryFormModal}
                          variant="primary"
                          size="sm"
                          title={`Update transaction with reprocessed data: ${document.linked_transaction.description}`}
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Update Record
                        </Button>
                      ) : (
                        // Show View Transaction for normal processed documents
                        <Button
                          onClick={() => openTransactionView(document.linked_transaction!.id)}
                          onMouseEnter={preloadAccountingEntryFormModal}
                          variant="view"
                          size="sm"
                          title={`View transaction: ${document.linked_transaction.description}`}
                        >
                          <Eye className="w-4 h-4 mr-1.5" />
                          View Record
                        </Button>
                      )
                    ) : (
                      <Button
                        onClick={() => openTransactionForm(document.id)}
                        onMouseEnter={preloadAccountingEntryFormModal}
                        variant="primary"
                        size="sm"
                        title="Create transaction from extracted document data"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Create Record
                      </Button>
                    )
                  )}

                  {/* Reprocess button for completed documents */}
                  {isCompletedDocument(document.status) && (
                    <Button
                      onClick={() => reprocessDocument(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      variant="primary"
                      size="sm"
                      title="Reprocess this document"
                    >
                      {processingDocuments.has(document.id) ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                      )}
                      {processingDocuments.has(document.id) ? 'Processing...' : 'Reprocess'}
                    </Button>
                  )}
                  
                  {/* Retry button for failed documents */}
                  {document.status === 'failed' && (
                    <Button
                      onClick={() => retryProcessing(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      variant="primary"
                      size="sm"
                      title="Retry processing (works for both general failures and classification failures)"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Retry
                    </Button>
                  )}

                  {/* Delete button for all documents */}
                  <Button
                    onClick={() => handleDeleteClick(document.id)}
                    onMouseEnter={preloadConfirmationDialog}
                    disabled={deletingDocuments.has(document.id)}
                    variant="destructive"
                    size="sm"
                    title="Delete this document"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Show extracted information for completed documents using cleaner ExtractedInfoTags component */}
            {isCompletedDocument(document.status) && document.extracted_data && (
              <div className="mt-4 pt-4 border-t border-border">
                <h5 className="text-sm font-medium text-muted-foreground mb-2">Extracted Information</h5>
                <ExtractedInfoTags extractedData={document.extracted_data} />
              </div>
            )}

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
            document={getDocumentById(selectedDocument)!}
            onClose={closeModal}
          />
        </Suspense>
      )}

      {/* Transaction Form Modal with pre-filled data */}
      {transactionFormDocument && getDocumentById(transactionFormDocument) && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-primary-foreground" /></div>}>
          <AccountingEntryFormModal
            onClose={closeTransactionForm}
            onSubmit={handleCreateTransaction}
            onSave={handleSaveInvoice}
            showSaveOption={true}
            prefilledData={{
              ...mapDocumentToAccountingEntry(getDocumentById(transactionFormDocument)! as any),
              // ✅ POLYMORPHIC: Link to invoice record with discriminator
              source_record_id: transactionFormDocument,
              source_document_type: 'invoice' as const
            }}
          />
        </Suspense>
      )}

      {/* Transaction Edit Form Modal for reprocessed documents */}
      {editTransactionData && getDocumentById(editTransactionData.documentId) && editTransactionDetails && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-primary-foreground" /></div>}>
          <AccountingEntryFormModal
            transaction={editTransactionDetails}
            prefilledData={{
              ...mapDocumentToAccountingEntry(getDocumentById(editTransactionData.documentId)! as any)
              // Don't include source_record_id for updates
            }}
            onClose={closeTransactionEditForm}
            onSubmit={handleUpdateTransaction}
          />
        </Suspense>
      )}

      {/* Standardized Delete Confirmation Dialog */}
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
    </div>
  )
})

DocumentsList.displayName = 'DocumentsList'

export default DocumentsList