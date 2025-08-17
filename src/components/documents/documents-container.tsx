'use client'

import { useState, useCallback, useRef } from 'react'
import FileUploadZone from './file-upload-zone'
import DocumentsList from './documents-list'

export default function DocumentsContainer() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const documentsListRef = useRef<{ refreshDocuments: () => Promise<void> } | null>(null)

  const handleUploadSuccess = useCallback((document: {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
  }) => {
    console.log('Document uploaded and processing triggered:', document)
    
    // If document is auto-processing, trigger immediate refresh to show processing status
    if (document.status === 'processing') {
      // Trigger immediate refresh to show the processing status
      if (documentsListRef.current) {
        documentsListRef.current.refreshDocuments()
      } else {
        // Fallback to refresh trigger
        setRefreshTrigger(prev => prev + 1)
      }
    } else {
      // Standard refresh for pending documents
      setRefreshTrigger(prev => prev + 1)
    }
  }, [])

  const handleUploadStart = useCallback(() => {
    console.log('Upload started')
  }, [])

  const handleDocumentsRefresh = useCallback(() => {
    console.log('Documents list refreshed')
  }, [])

  return (
    <div className="space-y-8">
      {/* File Upload Zone */}
      <div>
        <FileUploadZone 
          onUploadSuccess={handleUploadSuccess}
          onUploadStart={handleUploadStart}
          autoProcess={true}
          allowMultiple={true}
        />
      </div>
      
      {/* Documents List */}
      <div>
        <DocumentsList 
          key={refreshTrigger} // This will force a re-render when refreshTrigger changes
          onRefresh={handleDocumentsRefresh}
          ref={documentsListRef}
        />
      </div>
    </div>
  )
}