'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { compressReceiptImage } from '@/lib/pwa/image-compression'
import { useToast } from '@/components/ui/toast'

// File validation constants
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.heic', '.heif']

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
  success: string | null
  uploadedFiles: number
  totalFiles: number
}

interface UploadedDocument {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: string
}

interface FileUploadZoneProps {
  onUploadSuccess?: (document: UploadedDocument) => void
  onBatchUploadSuccess?: (documents: UploadedDocument[]) => void
  onUploadStart?: () => void
  autoProcess?: boolean
  allowMultiple?: boolean
  domain?: 'invoices' | 'expense-claims' // Domain configuration
  submissionId?: string // Link uploaded receipts to an expense submission
  /** Compact mode: slim inline upload strip without the file types info section */
  compact?: boolean
}

export default function FileUploadZone({
  onUploadSuccess,
  onBatchUploadSuccess,
  onUploadStart,
  autoProcess = true,
  allowMultiple = false,
  domain = 'invoices', // Default to invoices for backward compatibility
  submissionId,
  compact = false,
}: FileUploadZoneProps) {
  const { businessId } = useActiveBusiness()
  const { addToast } = useToast()
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: null,
    uploadedFiles: 0,
    totalFiles: 0
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate file before upload
  const validateFile = (file: File): string | null => {
    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Only JPG, PNG, HEIC, and PDF files are allowed.'
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return 'File too large. Maximum size is 10MB.'
    }

    // Check file extension as additional validation
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return 'Invalid file extension. Only .jpg, .png, and .pdf files are allowed.'
    }

    return null
  }

  // Upload single file to API
  const uploadFile = async (file: File) => {
    // Check if businessId is available
    if (!businessId) {
      throw new Error('No business selected. Please select a business first.')
    }

    try {
      // Convert HEIC/HEIF to JPEG before processing (iPhone photos)
      let fileToUpload = file
      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
      if (isHeic) {
        try {
          const heic2any = (await import('heic2any')).default
          const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }) as Blob
          fileToUpload = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' })
          console.log(`[Upload] Converted HEIC to JPEG: ${file.name} (${(file.size/1024).toFixed(0)}KB → ${(blob.size/1024).toFixed(0)}KB)`)
        } catch (heicError) {
          console.error('[Upload] HEIC conversion failed, uploading as-is:', heicError)
        }
      }

      // Compress images before upload (skip PDFs)
      if (fileToUpload.type.startsWith('image/')) {
        fileToUpload = await compressReceiptImage(fileToUpload)
      }

      const formData = new FormData()
      formData.append('file', fileToUpload)

      // Add businessId for invoice compatibility (expense-claims ignores this and uses user context instead)
      formData.append('businessId', businessId)

      // Add domain-specific fields for expense claims
      if (domain === 'expense-claims') {
        formData.append('processing_mode', 'ai') // Enable AI processing for expense claims

        // Add required form fields for unified API - use placeholder values, AI will update
        formData.append('description', 'Receipt Processing - AI Extraction')
        formData.append('business_purpose', 'Business Expense - Receipt Upload')
        formData.append('original_amount', '0') // Temporary amount (zero), will be updated by AI
        formData.append('original_currency', 'SGD') // Default currency
        formData.append('transaction_date', new Date().toISOString().split('T')[0]) // Today's date
        formData.append('vendor_name', 'Processing...') // Placeholder vendor name

        // Link to expense submission if provided
        if (submissionId) {
          formData.append('submissionId', submissionId)
        }
      }

      // Use domain-specific API endpoint
      const endpoint = domain === 'expense-claims' ? '/api/v1/expense-claims' : '/api/v1/invoices'
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        // Handle different response structures based on domain
        const uploadedDocument = domain === 'expense-claims'
          ? {
              id: result.data?.expense_claim_id || result.data?.expense_claim?.id,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              status: result.data?.expense_claim?.status || 'processing'
            }
          : {
              id: result.data?.id,
              fileName: result.data?.file_name || file.name, // Map file_name to fileName, fallback to original file name
              fileSize: result.data?.file_size || file.size,
              fileType: result.data?.file_type || file.type,
              status: result.data?.status || 'pending'
            }

        // Auto-process the document if enabled
        if (autoProcess && domain === 'invoices') {
          // Lambda handles both PDF conversion and image processing
          // Always trigger processing for all file types
          try {
            console.log(`[Upload] Triggering processing for document: ${uploadedDocument.id}`)
            const processResponse = await fetch(`/api/v1/invoices/${uploadedDocument.id}/process`, {
              method: 'POST'
            })

            if (processResponse.ok) {
              // Update the returned document status to processing
              uploadedDocument.status = 'processing'
              console.log(`[Upload] Processing triggered successfully for: ${uploadedDocument.id}`)
            } else {
              const errorData = await processResponse.json().catch(() => ({}))
              console.error('[Upload] Process endpoint failed:', processResponse.status, errorData)
            }
          } catch (error) {
            console.error('[Upload] Auto-processing failed:', error)
          }
        } else if (autoProcess && domain === 'expense-claims') {
          // Expense claims processing - AI processing is triggered automatically via the API
          // For expense claims, processing is handled by the API when processing_mode='ai'
        }

        return uploadedDocument
      } else {
        // Handle rate limit errors with user-friendly messages
        if (response.status === 429 || result.error?.includes('Rate limit exceeded')) {
          const retryAfter = response.headers.get('Retry-After')
          const waitTime = retryAfter ? parseInt(retryAfter) : null
          const waitMessage = waitTime
            ? `${waitTime} second${waitTime !== 1 ? 's' : ''}`
            : 'a moment'
          throw new Error(`Upload limit reached. Please wait ${waitMessage} before uploading again.`)
        }

        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    }
  }

  // Upload multiple files in parallel with concurrency limit
  const CONCURRENCY_LIMIT = 5

  const uploadFiles = async (files: File[]) => {
    // Notify parent component that upload is starting
    onUploadStart?.()

    setUploadState({
      uploading: true,
      progress: 0,
      error: null,
      success: null,
      uploadedFiles: 0,
      totalFiles: files.length
    })

    const uploadedDocuments: UploadedDocument[] = []
    const errors: string[] = []
    let completedCount = 0

    // Process files in parallel batches of CONCURRENCY_LIMIT
    const processFile = async (file: File) => {
      try {
        const uploadedDocument = await uploadFile(file)
        uploadedDocuments.push(uploadedDocument)
        onUploadSuccess?.(uploadedDocument)
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed'}`)
      } finally {
        completedCount++
        setUploadState(prev => ({
          ...prev,
          uploadedFiles: completedCount,
          progress: (completedCount / files.length) * 100
        }))
      }
    }

    // Sliding-window concurrency pool: always keep CONCURRENCY_LIMIT uploads in-flight
    const pool = new Set<Promise<void>>()
    for (const file of files) {
      const task = processFile(file).then(() => { pool.delete(task) })
      pool.add(task)
      if (pool.size >= CONCURRENCY_LIMIT) {
        await Promise.race(pool)
      }
    }
    // Wait for remaining uploads to complete
    await Promise.all(pool)

    // Finalize upload state
    if (errors.length === 0) {
      const successMsg = uploadedDocuments.length === 1
        ? `Successfully uploaded "${uploadedDocuments[0].fileName}"`
        : `Successfully uploaded ${uploadedDocuments.length} files`
      setUploadState({
        uploading: false,
        progress: 100,
        error: null,
        success: null,
        uploadedFiles: uploadedDocuments.length,
        totalFiles: files.length
      })
      addToast({ type: 'success', title: successMsg })

      // Notify parent of batch success
      if (allowMultiple && uploadedDocuments.length > 1) {
        onBatchUploadSuccess?.(uploadedDocuments)
      }
    } else if (uploadedDocuments.length > 0) {
      const successMsg = `Successfully uploaded ${uploadedDocuments.length} of ${files.length} files`
      setUploadState({
        uploading: false,
        progress: 100,
        error: `Some uploads failed: ${errors.join(', ')}`,
        success: null,
        uploadedFiles: uploadedDocuments.length,
        totalFiles: files.length
      })
      addToast({ type: 'warning', title: successMsg, description: `Some uploads failed: ${errors.join(', ')}` })

      // Notify parent of partial success
      if (allowMultiple && uploadedDocuments.length > 0) {
        onBatchUploadSuccess?.(uploadedDocuments)
      }
    } else {
      setUploadState({
        uploading: false,
        progress: 0,
        error: `All uploads failed: ${errors.join(', ')}`,
        success: null,
        uploadedFiles: 0,
        totalFiles: files.length
      })
    }

    // Clear messages after 5 seconds for batch uploads
    setTimeout(() => {
      setUploadState(prev => ({ ...prev, success: null, error: null }))
    }, 5000)
  }

  // Handle file selection
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return

    // Convert FileList to Array and validate
    const fileArray = Array.from(files)
    const validFiles: File[] = []
    const errors: string[] = []

    // If not allowing multiple, take only the first file
    const filesToProcess = allowMultiple ? fileArray : [fileArray[0]]

    for (const file of filesToProcess) {
      const validationError = validateFile(file)
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`)
      } else {
        validFiles.push(file)
      }
    }

    if (errors.length > 0) {
      setUploadState({
        uploading: false,
        progress: 0,
        error: errors.join('; '),
        success: null,
        uploadedFiles: 0,
        totalFiles: filesToProcess.length
      })
      return
    }

    if (validFiles.length > 0) {
      uploadFiles(validFiles)
    }
  }, [allowMultiple, uploadFiles])

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  // Handle drop event
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (uploadState.uploading) return

    handleFiles(e.dataTransfer.files)
  }, [handleFiles, uploadState.uploading])

  // Handle click to open file dialog
  // Reset input value before click to ensure dialog always opens
  // (fixes stale input after page idle/background)
  const handleClick = () => {
    if (uploadState.uploading) return
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    fileInputRef.current?.click()
  }

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Upload Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg ${compact ? 'px-4 py-3' : 'p-10'} text-center cursor-pointer
          transition-all duration-200
          ${dragActive
            ? 'border-primary bg-primary/15'
            : compact
              ? 'border-border hover:border-muted-foreground hover:bg-muted/50'
              : 'border-primary/40 bg-gradient-to-b from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/15 hover:border-primary/60'
          }
          ${uploadState.uploading ? 'pointer-events-none opacity-50' : ''}
        `}
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.heic,.heif"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploadState.uploading}
          multiple={allowMultiple}
        />

        {compact ? (
          /* Compact: single row layout */
          <div className="flex items-center justify-center gap-3">
            {uploadState.uploading ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full flex-shrink-0" />
                <p className="text-foreground text-sm font-medium">
                  {uploadState.totalFiles > 1
                    ? `Uploading ${uploadState.uploadedFiles}/${uploadState.totalFiles}...`
                    : 'Uploading...'}
                </p>
                {uploadState.totalFiles > 1 && (
                  <div className="w-24 bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <p className="text-foreground text-sm font-medium">
                  {dragActive ? 'Drop files here' : 'Upload receipts'}
                </p>
                <span className="text-muted-foreground text-xs">
                  JPG, PNG, HEIC, or PDF up to 10MB
                </span>
              </>
            )}
          </div>
        ) : (
          /* Default: large centered layout */
          <div className="space-y-4">
            {uploadState.uploading ? (
              <>
                <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <div>
                  <p className="text-foreground font-medium">
                    {uploadState.totalFiles > 1 ? 'Uploading files...' : 'Uploading file...'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {uploadState.totalFiles > 1
                      ? `Processing ${uploadState.uploadedFiles} of ${uploadState.totalFiles} files`
                      : 'Please wait while we process your document'
                    }
                  </p>
                  {uploadState.totalFiles > 1 && (
                    <div className="w-full bg-muted rounded-full h-2 mt-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-primary/50 mx-auto" />
                <div>
                  <p className="text-foreground font-medium text-base">
                    {dragActive
                      ? `Drop your ${allowMultiple ? 'files' : 'file'} here`
                      : `Click to upload or drag and drop`
                    }
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    JPG, PNG, HEIC, or PDF files up to 10MB
                    {allowMultiple && ' (multiple files supported)'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status Messages */}
      {uploadState.error && (
        <div className={`flex items-center space-x-2 ${compact ? 'p-2 text-sm' : 'p-4'} bg-danger/10 border border-danger rounded-lg`}>
          <AlertCircle className={compact ? 'w-4 h-4 text-danger-foreground flex-shrink-0' : 'w-5 h-5 text-danger-foreground'} />
          <p className="text-danger-foreground">{uploadState.error}</p>
        </div>
      )}

      {/* Success messages now use toast notifications */}

    </div>
  )
}