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
          <CardContent className="pt-6">

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
          <CardContent className="pt-6">

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