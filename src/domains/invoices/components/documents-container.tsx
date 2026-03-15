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
    <div className="space-y-3">
      {/* Business Document Upload */}
      <div>
        <Suspense fallback={<div className="border-2 border-dashed border-border rounded-lg p-4 text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>}>
          <FileUploadZone
            onUploadSuccess={handleBusinessDocumentSuccess}
            onUploadStart={() => {/* Upload started callback */}}
            autoProcess={true}
            allowMultiple={true}
          />
        </Suspense>
      </div>

      {/* Documents List */}
      <div>
            <DocumentsList
              key={refreshTrigger}
              onRefresh={handleDocumentsRefresh}
              ref={documentsListRef}
            />
      </div>
    </div>
  )
}