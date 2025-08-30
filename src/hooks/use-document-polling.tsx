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
    document_summary?: {
      document_type?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      vendor_name?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      total_amount?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      transaction_date?: {
        value: string
        confidence: number
        bbox?: number[]
      }
    }
    financial_entities?: Array<{
      label: string
      value: string
      category: string
      confidence: number
      bbox?: number[]
    }>
    line_items?: Array<{
      description?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      item_code?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      quantity?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      unit_measurement?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      unit_price?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      line_total?: {
        value: string
        confidence: number
        bbox?: number[]
      }
    }>
    metadata: {
      pageCount?: number
      wordCount: number
      language?: string
      processingMethod?: 'ocr'
      layoutElements?: Array<{
        bbox?: number[]
        category?: string
        text?: string
      }>
      boundingBoxes?: Array<{
        x1: number
        y1: number
        x2: number
        y2: number
        category: string
        text: string
      }>
    }
  }
  confidence_score?: number
  linked_transaction?: {
    id: string
    description: string
    original_amount: number
    original_currency: string
    created_at: string
  }
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
      
      if (response.ok && result.success) {
        // Processing was successfully queued - keep status as 'processing'
        // The actual completion will be detected by polling
        console.log('Document processing started successfully')
      } else if (response.status === 409) {
        // Document is already being processed - revert to actual status from server
        console.log('Document is already being processed')
        alert('This document is already being processed. Please wait for the current process to complete.')
        
        // Refresh documents to get the actual current status from server
        await fetchDocuments()
      } else {
        // Processing failed to start
        setDocuments(prev => prev.map(doc => 
          doc.id === documentId 
            ? { ...doc, processing_status: 'failed', error_message: result.error }
            : doc
        ))
        console.error('Processing failed to start:', result.error)
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
    }, 3000) // Poll every 3 seconds for more responsive status updates
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
      doc.processing_status === 'processing' || doc.processing_status === 'ocr_processing'
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