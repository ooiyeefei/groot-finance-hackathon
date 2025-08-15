'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'

// File validation constants
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf']

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
  success: string | null
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
  onUploadStart?: () => void
  autoProcess?: boolean
}

export default function FileUploadZone({ 
  onUploadSuccess, 
  onUploadStart,
  autoProcess = true 
}: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: null
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

  // Upload file to API
  const uploadFile = async (file: File) => {
    // Notify parent component that upload is starting
    onUploadStart?.()
    
    setUploadState({
      uploading: true,
      progress: 0,
      error: null,
      success: null
    })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        const uploadedDocument = result.data
        
        setUploadState({
          uploading: false,
          progress: 100,
          error: null,
          success: `Successfully uploaded "${uploadedDocument.fileName}"`
        })
        
        // Notify parent component of successful upload
        onUploadSuccess?.(uploadedDocument)
        
        // Auto-process the document if enabled
        if (autoProcess) {
          setTimeout(async () => {
            try {
              await fetch(`/api/documents/${uploadedDocument.id}/process`, {
                method: 'POST'
              })
            } catch (error) {
              console.error('Auto-processing failed:', error)
            }
          }, 1000) // Small delay to ensure UI updates
        }
        
        // Clear success message after 3 seconds (reduced for better UX)
        setTimeout(() => {
          setUploadState(prev => ({ ...prev, success: null }))
        }, 3000)
      } else {
        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadState({
        uploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
        success: null
      })
    }
  }

  // Handle file selection
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    const validationError = validateFile(file)
    
    if (validationError) {
      setUploadState({
        uploading: false,
        progress: 0,
        error: validationError,
        success: null
      })
      return
    }

    uploadFile(file)
  }, [uploadFile])

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
            ? 'border-blue-400 bg-blue-400/10' 
            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
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
        />
        
        <div className="space-y-4">
          {uploadState.uploading ? (
            <>
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <div>
                <p className="text-white font-medium">Uploading file...</p>
                <p className="text-gray-400 text-sm">Please wait while we process your document</p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <div>
                <p className="text-white font-medium">
                  {dragActive ? 'Drop your file here' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  JPG, PNG, or PDF files up to 10MB
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {uploadState.error && (
        <div className="flex items-center space-x-2 p-4 bg-red-900/20 border border-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">{uploadState.error}</p>
        </div>
      )}
      
      {uploadState.success && (
        <div className="flex items-center space-x-2 p-4 bg-green-900/20 border border-green-700 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <p className="text-green-300">{uploadState.success}</p>
        </div>
      )}

      {/* File Format Info */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-medium mb-2 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          Supported File Types
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
          <div>
            <strong className="text-white">Images:</strong>
            <br />JPG, JPEG, PNG
          </div>
          <div>
            <strong className="text-white">Documents:</strong>
            <br />PDF files
          </div>
          <div>
            <strong className="text-white">Size Limit:</strong>
            <br />Maximum 10MB
          </div>
        </div>
      </div>
    </div>
  )
}