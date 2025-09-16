'use client'

import { useState, useCallback, useRef } from 'react'
import DocumentsList from './documents-list'
import FileUploadZone from './file-upload-zone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function DocumentsContainer() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const documentsListRef = useRef<{ refreshDocuments: () => Promise<void> } | null>(null)

  const handleBusinessDocumentSuccess = useCallback((document: {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
  }) => {
    console.log('Business document uploaded and processing triggered:', document)

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

  const handleDocumentsRefresh = useCallback(() => {
    console.log('Documents list refreshed')
  }, [])

  return (
    <div className="space-y-8">
      {/* Business Document Upload */}
      <div>
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Upload Business Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm mb-4">
              Upload general business documents for processing and storage.
              For expense receipts, use the expense claims section.
            </p>

            <FileUploadZone
              onUploadSuccess={handleBusinessDocumentSuccess}
              onUploadStart={() => console.log('Business document upload started')}
              autoProcess={true}
              allowMultiple={false}
            />
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <div>
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Business Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm mb-4">
              Your uploaded business documents and their processing status.
            </p>

            <DocumentsList
              key={refreshTrigger}
              onRefresh={handleDocumentsRefresh}
              ref={documentsListRef}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}