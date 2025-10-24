'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'

// File validation constants
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf']

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
}

export default function FileUploadZone({
  onUploadSuccess,
  onBatchUploadSuccess,
  onUploadStart,
  autoProcess = true,
  allowMultiple = false,
  domain = 'invoices' // Default to invoices for backward compatibility
}: FileUploadZoneProps) {
  const { businessId } = useActiveBusiness()
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
      return 'Invalid file type. Only JPG, PNG, and PDF files are allowed.'
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
      const formData = new FormData()
      formData.append('file', file)
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
          : result.data

        // Auto-process the document if enabled
        if (autoProcess && domain === 'invoices') {
          // Invoice processing logic (only for images, PDFs need conversion first)
          if (file.type !== 'application/pdf') {
            try {
              // Immediately trigger processing for image files only
              const processResponse = await fetch(`/api/v1/invoices/${uploadedDocument.id}/process`, {
                method: 'POST'
              })

              if (processResponse.ok) {
                // Update the returned document status to processing
                uploadedDocument.status = 'processing'
              }
            } catch (error) {
              console.error('Auto-processing failed:', error)
            }
          } else {
            // PDF will be processed automatically after convert-pdf-to-image job completes
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
          const waitTime = retryAfter ? `${retryAfter} seconds` : 'a moment'
          throw new Error(`Upload limit reached. Please wait ${waitTime} before uploading again.`)
        }

        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    }
  }

  // Upload multiple files
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

    for (let i = 0; i < files.length; i++) {
      try {
        const uploadedDocument = await uploadFile(files[i])
        uploadedDocuments.push(uploadedDocument)

        // Update progress
        setUploadState(prev => ({
          ...prev,
          uploadedFiles: i + 1,
          progress: ((i + 1) / files.length) * 100
        }))

        // Notify parent for single file success
        onUploadSuccess?.(uploadedDocument)
      } catch (error) {
        errors.push(`${files[i].name}: ${error instanceof Error ? error.message : 'Upload failed'}`)
      }
    }

    // Finalize upload state
    if (errors.length === 0) {
      setUploadState({
        uploading: false,
        progress: 100,
        error: null,
        success: uploadedDocuments.length === 1
          ? `Successfully uploaded "${uploadedDocuments[0].fileName}"`
          : `Successfully uploaded ${uploadedDocuments.length} files`,
        uploadedFiles: uploadedDocuments.length,
        totalFiles: files.length
      })

      // Notify parent of batch success
      if (allowMultiple && uploadedDocuments.length > 1) {
        onBatchUploadSuccess?.(uploadedDocuments)
      }
    } else if (uploadedDocuments.length > 0) {
      setUploadState({
        uploading: false,
        progress: 100,
        error: `Some uploads failed: ${errors.join(', ')}`,
        success: `Successfully uploaded ${uploadedDocuments.length} of ${files.length} files`,
        uploadedFiles: uploadedDocuments.length,
        totalFiles: files.length
      })

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
  const handleClick = () => {
    if (uploadState.uploading) return
    fileInputRef.current?.click()
  }

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
  }

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragActive
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-muted-foreground hover:bg-muted/50'
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
          accept=".jpg,.jpeg,.png,.pdf"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploadState.uploading}
          multiple={allowMultiple}
        />

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
              <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="text-foreground font-medium">
                  {dragActive
                    ? `Drop your ${allowMultiple ? 'files' : 'file'} here`
                    : `Click to upload or drag and drop`
                  }
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  JPG, PNG, or PDF files up to 10MB
                  {allowMultiple && ' (multiple files supported)'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {uploadState.error && (
        <div className="flex items-center space-x-2 p-4 bg-danger/10 border border-danger rounded-lg">
          <AlertCircle className="w-5 h-5 text-danger-foreground" />
          <p className="text-danger-foreground">{uploadState.error}</p>
        </div>
      )}

      {uploadState.success && (
        <div className="flex items-center space-x-2 p-4 bg-success border border-success rounded-lg">
          <CheckCircle className="w-5 h-5 text-success-foreground" />
          <p className="text-success-foreground">{uploadState.success}</p>
        </div>
      )}

      {/* File Format Info */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h3 className="text-foreground font-medium mb-2 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          Supported File Types
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">Images:</strong>
            <br />JPG, JPEG, PNG
          </div>
          <div>
            <strong className="text-foreground">Documents:</strong>
            <br />PDF (converted to image for OCR)
          </div>
          <div>
            <strong className="text-foreground">Size Limit:</strong>
            <br />Maximum 10MB
          </div>
        </div>
      </div>
    </div>
  )
}