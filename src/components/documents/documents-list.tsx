'use client'

import { useState } from 'react'
import { FileText, Image, File, Play, RotateCcw, Eye, Trash2 } from 'lucide-react'
import { useDocumentPolling } from '@/hooks/use-document-polling'
import DocumentStatusBadge from './document-status-badge'
import ConfidenceScoreMeter from './confidence-score-meter'
import DocumentAnalysisModal from './document-analysis-modal'

interface DocumentsListProps {
  onRefresh?: () => void
}

export default function DocumentsList({ onRefresh }: DocumentsListProps) {
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

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
  }

  // Handle delete confirmation
  const confirmDelete = (documentId: string) => {
    setDeleteConfirmId(documentId)
  }

  // Handle delete execution
  const executeDelete = async (documentId: string) => {
    try {
      await deleteDocument(documentId)
      setDeleteConfirmId(null)
    } catch (error) {
      console.error('Delete failed:', error)
      // Keep the confirmation dialog open on error
    }
  }

  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirmId(null)
  }

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-2 text-gray-400">Loading documents...</span>
      </div>
    )
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
                    onClick={() => confirmDelete(document.id)}
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
            
            {/* Show extracted entities for completed documents */}
            {document.processing_status === 'completed' && document.extracted_data?.entities && document.extracted_data.entities.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <h5 className="text-sm font-medium text-gray-300 mb-2">Extracted Information</h5>
                <div className="flex flex-wrap gap-2">
                  {document.extracted_data.entities.slice(0, 5).map((entity, index) => (
                    <span
                      key={index}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Delete Document</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(deleteConfirmId)}
                disabled={deletingDocuments.has(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                {deletingDocuments.has(deleteConfirmId) ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}