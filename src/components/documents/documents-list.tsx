'use client'

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Image, File, Play, RotateCcw, Eye, Trash2, Plus } from 'lucide-react'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { useDocumentPolling } from '@/hooks/use-document-polling'
import DocumentStatusBadge from './document-status-badge'
import ConfidenceScoreMeter from './confidence-score-meter'
import DocumentAnalysisModal from './document-analysis-modal'
import TransactionFormModal from '@/components/transactions/transaction-form-modal'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { mapDocumentToTransaction, canCreateTransactionFromDocument } from '@/lib/document-to-transaction-mapper'
import { CreateTransactionRequest } from '@/types/transaction'

interface DocumentsListProps {
  onRefresh?: () => void
}

interface DocumentsListRef {
  refreshDocuments: () => Promise<void>
}

const DocumentsList = forwardRef<DocumentsListRef, DocumentsListProps>(({ onRefresh }, ref) => {
  const router = useRouter()
  const { 
    documents, 
    loading, 
    refreshDocuments, 
    processDocument, 
    deleteDocument,
    processingDocuments,
    deletingDocuments 
  } = useDocumentPolling()

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

  // Handle refresh from parent component
  const handleRefresh = async () => {
    await refreshDocuments()
    onRefresh?.()
  }

  // Handle retry processing for failed documents
  const retryProcessing = async (documentId: string) => {
    await processDocument(documentId)
  }

  // Handle reprocess for completed documents
  const reprocessDocument = async (documentId: string) => {
    await processDocument(documentId)
    // Track that this document has been reprocessed
    setReprocessedDocuments(prev => new Set(prev).add(documentId))
  }

  // Handle delete confirmation
  const handleDeleteClick = (documentId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      documentId,
      isLoading: false
    })
  }

  // Handle delete execution
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.documentId) return

    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))

    try {
      await deleteDocument(deleteConfirmation.documentId)
      setDeleteConfirmation({
        isOpen: false,
        documentId: null,
        isLoading: false
      })
    } catch (error) {
      console.error('Delete failed:', error)
      // Keep dialog open on error, just stop loading
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
    }
  }

  // Cancel delete
  const handleDeleteCancel = () => {
    setDeleteConfirmation({
      isOpen: false,
      documentId: null,
      isLoading: false
    })
  }

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
    // Navigate to transactions page with the specific transaction focused using Next.js router
    router.push(`/transactions?highlight=${transactionId}`)
  }

  // Close transaction form modal
  const closeTransactionForm = () => {
    setTransactionFormDocument(null)
  }

  // Close transaction edit modal
  const closeTransactionEditForm = () => {
    setEditTransactionData(null)
  }

  // Handle transaction creation from document
  const handleCreateTransaction = async (data: CreateTransactionRequest) => {
    try {
      console.log('[Documents List] Sending transaction data to API:', JSON.stringify(data, null, 2))
      console.log('[Documents List] Home currency being sent:', data.home_currency)
      console.log('[Documents List] Source document ID being sent:', data.source_document_id)
      
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error('Failed to create transaction')
      }

      console.log('Transaction created successfully from document')
      setTransactionFormDocument(null)
      
      // Refresh documents list to update the linked transaction status
      await refreshDocuments()
      
      // Optional: Show success message or redirect to transactions page
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to create transaction:', error)
      // Optional: Show error message
    }
  }

  // Handle transaction update from reprocessed document
  const handleUpdateTransaction = async (data: CreateTransactionRequest) => {
    if (!editTransactionData) return
    
    try {
      console.log('[Documents List] Updating transaction with reprocessed data:', JSON.stringify(data, null, 2))
      
      const response = await fetch(`/api/transactions/${editTransactionData.transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // Remove fields that shouldn't be in the update request
          source_document_id: undefined,
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update transaction')
      }

      console.log('Transaction updated successfully with reprocessed data')
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
      console.error('Failed to update transaction:', error)
      // Optional: Show error message
    }
  }

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
      const response = await fetch(`/api/transactions/${transactionId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setEditTransactionDetails(result.data.transaction)
        }
      }
    } catch (error) {
      console.error('Failed to fetch transaction details:', error)
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-400" />
    } else if (fileType === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-400" />
    }
    return <File className="w-5 h-5 text-gray-400" />
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
        <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400">No documents uploaded yet.</p>
        <p className="text-gray-500 text-sm mt-1">Upload your first document above to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Your Documents</h3>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {documents.map((document) => (
          <div
            key={document.id}
            className="bg-gray-700/50 rounded-lg border border-gray-600 p-4 hover:bg-gray-700/70 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getFileIcon(document.file_type)}
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium truncate">{document.file_name}</h4>
                  <div className="flex items-center space-x-4 text-sm text-gray-400 mt-1">
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
                    status={document.processing_status}
                    errorMessage={document.error_message}
                  />
                  
                  {/* Show transaction linked status */}
                  {document.linked_transaction && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/20 text-green-400 border border-green-700">
                      💰 Transaction Created
                    </span>
                  )}
                  
                  {/* Show reprocessed status for documents that have been reprocessed */}
                  {reprocessedDocuments.has(document.id) && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-900/20 text-orange-400 border border-orange-700">
                      🔄 Reprocessed
                    </span>
                  )}
                  
                  {/* Show confidence score for completed documents */}
                  {document.processing_status === 'completed' && document.confidence_score && (
                    <ConfidenceScoreMeter 
                      score={document.confidence_score} 
                      entityCount={document.extracted_data?.entities?.length}
                      size="sm"
                    />
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Process button for pending documents */}
                  {document.processing_status === 'pending' && (
                    <button
                      onClick={() => processDocument(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                    >
                      <Play className="w-4 h-4 mr-1.5" />
                      Process
                    </button>
                  )}
                  
                  {/* Analyze Document button for completed documents */}
                  {document.processing_status === 'completed' && document.extracted_data && (
                    <button
                      onClick={() => viewExtractedData(document.id)}
                      className="inline-flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                      title="Analyze document and view extracted data"
                    >
                      <Eye className="w-4 h-4 mr-1.5" />
                      Analyze
                    </button>
                  )}

                  {/* Add/View/Update Transaction button for completed documents with extractable data */}
                  {document.processing_status === 'completed' && document.extracted_data && canCreateTransactionFromDocument(document as any) && (
                    document.linked_transaction ? (
                      reprocessedDocuments.has(document.id) ? (
                        // Show Update Transaction for reprocessed documents
                        <button
                          onClick={() => openTransactionEditForm(document.id, document.linked_transaction!.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-md transition-colors"
                          title={`Update transaction with reprocessed data: ${document.linked_transaction.description}`}
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Update Transaction
                        </button>
                      ) : (
                        // Show View Transaction for normal processed documents
                        <button
                          onClick={() => openTransactionView(document.linked_transaction!.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                          title={`View transaction: ${document.linked_transaction.description}`}
                        >
                          <Eye className="w-4 h-4 mr-1.5" />
                          View Transaction
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => openTransactionForm(document.id)}
                        className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                        title="Create transaction from extracted document data"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Transaction
                      </button>
                    )
                  )}

                  {/* Reprocess button for completed documents */}
                  {document.processing_status === 'completed' && (
                    <button
                      onClick={() => reprocessDocument(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      className="inline-flex items-center px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                      title="Reprocess this document"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Reprocess
                    </button>
                  )}
                  
                  {/* Retry button for failed documents */}
                  {document.processing_status === 'failed' && (
                    <button
                      onClick={() => retryProcessing(document.id)}
                      disabled={processingDocuments.has(document.id)}
                      className="inline-flex items-center px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                      title="Retry processing"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Retry
                    </button>
                  )}

                  {/* Delete button for all documents */}
                  <button
                    onClick={() => handleDeleteClick(document.id)}
                    disabled={deletingDocuments.has(document.id)}
                    className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                    title="Delete this document"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
            
            {/* Show extracted information for completed documents */}
            {document.processing_status === 'completed' && document.extracted_data && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <h5 className="text-sm font-medium text-gray-300 mb-2">Extracted Information</h5>
                <div className="flex flex-wrap gap-2">
                  {/* Document Summary */}
                  {document.extracted_data.document_summary && (
                    <>
                      {document.extracted_data.document_summary.vendor_name && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-blue-600/20 text-blue-300 border border-blue-500/30">
                          <span className="font-medium">Vendor:</span>
                          <span className="ml-1">{document.extracted_data.document_summary.vendor_name.value}</span>
                        </span>
                      )}
                      {document.extracted_data.document_summary.total_amount && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-green-600/20 text-green-300 border border-green-500/30">
                          <span className="font-medium">Amount:</span>
                          <span className="ml-1">{document.extracted_data.document_summary.total_amount.value}</span>
                        </span>
                      )}
                      {document.extracted_data.document_summary.transaction_date && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-purple-600/20 text-purple-300 border border-purple-500/30">
                          <span className="font-medium">Date:</span>
                          <span className="ml-1">{document.extracted_data.document_summary.transaction_date.value}</span>
                        </span>
                      )}
                    </>
                  )}
                  
                  {/* Line Items Summary */}
                  {document.extracted_data.line_items && document.extracted_data.line_items.length > 0 && (
                    <>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-orange-600/20 text-orange-300 border border-orange-500/30">
                        <span className="font-medium">Items:</span>
                        <span className="ml-1">{document.extracted_data.line_items.length}</span>
                      </span>
                      {/* Show first few line items with new fields */}
                      {document.extracted_data.line_items.slice(0, 3).map((item, index) => (
                        <div key={`line-${index}`} className="flex flex-wrap gap-1">
                          {item.description && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-600/50 text-gray-300 border border-gray-500">
                              <span className="font-medium text-yellow-300">Item:</span>
                              <span className="ml-1">{item.description.value}</span>
                            </span>
                          )}
                          {item.item_code && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                              <span className="font-medium">Code:</span>
                              <span className="ml-1">{item.item_code.value}</span>
                            </span>
                          )}
                          {item.unit_measurement && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-teal-600/20 text-teal-300 border border-teal-500/30">
                              <span className="font-medium">Unit:</span>
                              <span className="ml-1">{item.unit_measurement.value}</span>
                            </span>
                          )}
                        </div>
                      ))}
                      {document.extracted_data.line_items.length > 3 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs text-gray-400">
                          +{document.extracted_data.line_items.length - 3} more items
                        </span>
                      )}
                    </>
                  )}
                  
                  {/* Financial Entities */}
                  {document.extracted_data.financial_entities && document.extracted_data.financial_entities.length > 0 && (
                    <>
                      {document.extracted_data.financial_entities.slice(0, 3).map((entity, index) => (
                        <span
                          key={`financial-${index}`}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                          title={`${entity.category} • Confidence: ${Math.round(entity.confidence * 100)}%`}
                        >
                          <span className="font-medium">{entity.label}:</span>
                          <span className="ml-1">{entity.value}</span>
                        </span>
                      ))}
                      {document.extracted_data.financial_entities.length > 3 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs text-gray-400">
                          +{document.extracted_data.financial_entities.length - 3} more
                        </span>
                      )}
                    </>
                  )}
                  
                  {/* Legacy entities fallback */}
                  {document.extracted_data.entities && document.extracted_data.entities.length > 0 && 
                   !document.extracted_data.document_summary && 
                   !document.extracted_data.line_items && 
                   !document.extracted_data.financial_entities && (
                    <>
                      {document.extracted_data.entities.slice(0, 5).map((entity, index) => (
                        <span
                          key={`legacy-${index}`}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-600/50 text-gray-300 border border-gray-500"
                          title={`Confidence: ${Math.round(entity.confidence * 100)}%`}
                        >
                          <span className="font-medium text-blue-300">{entity.type}:</span>
                          <span className="ml-1">{entity.value}</span>
                        </span>
                      ))}
                      {document.extracted_data.entities.length > 5 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs text-gray-400">
                          +{document.extracted_data.entities.length - 5} more
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Document Analysis Modal */}
      {selectedDocument && getDocumentById(selectedDocument) && (
        <DocumentAnalysisModal
          document={getDocumentById(selectedDocument)!}
          onClose={closeModal}
        />
      )}

      {/* Transaction Form Modal with pre-filled data */}
      {transactionFormDocument && getDocumentById(transactionFormDocument) && (
        <TransactionFormModal
          onClose={closeTransactionForm}
          onSubmit={handleCreateTransaction}
          prefilledData={{
            ...mapDocumentToTransaction(getDocumentById(transactionFormDocument)! as any),
            source_document_id: transactionFormDocument // Link transaction to document
          }}
        />
      )}

      {/* Transaction Edit Form Modal for reprocessed documents */}
      {editTransactionData && getDocumentById(editTransactionData.documentId) && editTransactionDetails && (
        <TransactionFormModal
          transaction={editTransactionDetails}
          prefilledData={{
            ...mapDocumentToTransaction(getDocumentById(editTransactionData.documentId)! as any)
            // Don't include source_document_id for updates
          }}
          onClose={closeTransactionEditForm}
          onSubmit={handleUpdateTransaction}
        />
      )}

      {/* Standardized Delete Confirmation Dialog */}
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
    </div>
  )
})

DocumentsList.displayName = 'DocumentsList'

export default DocumentsList