'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface Document {
  id: string
  file_name: string
  file_type: string
  file_size: number
  processing_status: 'pending' | 'processing' | 'ocr_processing' | 'completed' | 'failed'
  created_at: string
  processed_at?: string
  error_message?: string
  extracted_data?: {
    text: string
    entities: Array<{
      type: string
      value: string
      confidence: number
    }>
    metadata: {
      pageCount?: number
      wordCount: number
      language?: string
    }
  }
  confidence_score?: number
}

interface UseDocumentPollingReturn {
  documents: Document[]
  loading: boolean
  refreshDocuments: () => Promise<void>
  processDocument: (documentId: string) => Promise<void>
  deleteDocument: (documentId: string) => Promise<void>
  processingDocuments: Set<string>
  deletingDocuments: Set<string>
}

export function useDocumentPolling(): UseDocumentPollingReturn {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [processingDocuments, setProcessingDocuments] = useState(new Set<string>())
  const [deletingDocuments, setDeletingDocuments] = useState(new Set<string>())
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)

  // Fetch documents from API
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents/list')
      if (response.ok) {
        const result = await response.json()
        setDocuments(result.data || [])
      } else {
        console.error('Failed to fetch documents')
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Public refresh function
  const refreshDocuments = useCallback(async () => {
    await fetchDocuments()
  }, [fetchDocuments])

  // Calculate overall confidence score from extracted data
  const calculateOverallConfidence = useCallback((extractedData: {
    entities?: Array<{ confidence?: number }>
  }): number => {
    if (!extractedData?.entities || extractedData.entities.length === 0) {
      return 0
    }
    
    const totalConfidence = extractedData.entities.reduce(
      (sum: number, entity) => sum + (entity.confidence || 0), 
      0
    )
    
    return Math.round((totalConfidence / extractedData.entities.length) * 100) / 100
  }, [])

  // Process a document (works for pending, failed, and completed documents)
  const processDocument = useCallback(async (documentId: string) => {
    setProcessingDocuments(prev => new Set(prev).add(documentId))
    
    // Update document status to processing and clear any error messages
    setDocuments(prev => prev.map(doc => 
      doc.id === documentId 
        ? { 
            ...doc, 
            processing_status: 'processing' as const,
            error_message: undefined // Clear any previous error messages
          }
        : doc
    ))
    
    try {
      const response = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Update with completed status and extracted data
        setDocuments(prev => prev.map(doc => 
          doc.id === documentId 
            ? { 
                ...doc, 
                processing_status: 'completed',
                processed_at: new Date().toISOString(),
                extracted_data: result.data.extractedData,
                confidence_score: calculateOverallConfidence(result.data.extractedData),
                error_message: undefined
              }
            : doc
        ))
      } else {
        // Update status to failed
        setDocuments(prev => prev.map(doc => 
          doc.id === documentId 
            ? { ...doc, processing_status: 'failed', error_message: result.error }
            : doc
        ))
        console.error('Processing failed:', result.error)
      }
    } catch (error) {
      console.error('Error processing document:', error)
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId 
          ? { ...doc, processing_status: 'failed', error_message: 'Network error occurred while processing' }
          : doc
      ))
    } finally {
      setProcessingDocuments(prev => {
        const newSet = new Set(prev)
        newSet.delete(documentId)
        return newSet
      })
    }
  }, [calculateOverallConfidence])

  // Delete a document
  const deleteDocument = useCallback(async (documentId: string) => {
    setDeletingDocuments(prev => new Set(prev).add(documentId))
    
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Remove document from state
        setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      } else {
        console.error('Delete failed:', result.error)
        throw new Error(result.error || 'Failed to delete document')
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      throw error
    } finally {
      setDeletingDocuments(prev => {
        const newSet = new Set(prev)
        newSet.delete(documentId)
        return newSet
      })
    }
  }, [])

  // Start polling for processing documents
  const startPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
    }
    
    pollingInterval.current = setInterval(() => {
      const hasProcessingDocuments = documents.some(doc => 
        doc.processing_status === 'processing' || doc.processing_status === 'ocr_processing'
      )
      
      if (hasProcessingDocuments) {
        fetchDocuments()
      }
    }, 10000) // Poll every 10 seconds for OCR tasks (5-8 min processing)
  }, [documents, fetchDocuments])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Start/stop polling based on processing documents
  useEffect(() => {
    const hasProcessingDocuments = documents.some(doc => 
      doc.processing_status === 'processing'
    )
    
    if (hasProcessingDocuments) {
      startPolling()
    } else {
      stopPolling()
    }
    
    return () => stopPolling()
  }, [documents, startPolling, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    documents,
    loading,
    refreshDocuments,
    processDocument,
    deleteDocument,
    processingDocuments,
    deletingDocuments
  }
}