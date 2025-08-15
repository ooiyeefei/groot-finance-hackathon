'use client'

import { useState, useCallback } from 'react'
import FileUploadZone from './file-upload-zone'
import DocumentsList from './documents-list'

export default function DocumentsContainer() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleUploadSuccess = useCallback((document: {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
  }) => {
    console.log('Document uploaded successfully:', document)
    // Trigger a refresh of the documents list
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const handleUploadStart = useCallback(() => {
    console.log('Upload started')
  }, [])

  const handleDocumentsRefresh = useCallback(() => {
    console.log('Documents list refreshed')
  }, [])

  return (
    <>
      {/* File Upload Zone */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <FileUploadZone 
          onUploadSuccess={handleUploadSuccess}
          onUploadStart={handleUploadStart}
          autoProcess={true}
        />
      </div>
      
      {/* Documents List */}
      <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-8">
        <DocumentsList 
          key={refreshTrigger} // This will force a re-render when refreshTrigger changes
          onRefresh={handleDocumentsRefresh}
        />
      </div>
    </>
  )
}