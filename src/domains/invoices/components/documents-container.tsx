'use client'

import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import DocumentsList from './documents-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Loader2 } from 'lucide-react'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const FileUploadZone = lazy(() => import('@/domains/utilities/components/file-upload-zone'))

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
    // Documents list refreshed - callback handled
  }, [])

  return (
    <div className="space-y-8">
      {/* Business Document Upload */}
      <div>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">

            <Suspense fallback={<div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>}>
              <FileUploadZone
                onUploadSuccess={handleBusinessDocumentSuccess}
                onUploadStart={() => {/* Upload started callback */}}
                autoProcess={true}
                allowMultiple={true}
              />
            </Suspense>
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