'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

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
}

export default function FileUploadZone({ 
  onUploadSuccess,
  onBatchUploadSuccess, 
  onUploadStart,
  autoProcess = true,
  allowMultiple = false
}: FileUploadZoneProps) {
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

  const t = useTranslations('documents.upload');

  // Validate file before upload
  const validateFile = (file: File): string | null => {
    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return t('validation.invalidFileType')
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return t('validation.fileTooLarge')
    }

    // Check file extension as additional validation
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return t('validation.invalidFileExtension')
    }

    return null
  }

  // Upload single file to API
  const uploadFile = async (file: File) => {
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
        
        // Auto-process the document if enabled
        if (autoProcess) {
          try {
            // Immediately trigger processing without delay
            const processResponse = await fetch(`/api/documents/${uploadedDocument.id}/process`, {
              method: 'POST'
            })
            
            if (processResponse.ok) {
              console.log('Auto-processing triggered successfully for:', uploadedDocument.id)
              // Update the returned document status to processing
              uploadedDocument.status = 'processing'
            } else {
              console.error('Auto-processing failed to start')
            }
          } catch (error) {
            console.error('Auto-processing failed:', error)
          }
        }
        
        return uploadedDocument
      } else {
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
          ? `${t('successfullyUploaded')} "${uploadedDocuments[0].fileName}"`
          : `${t('successfullyUploaded')} ${uploadedDocuments.length} files`,
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
        error: `${t('someUploadsFailed')} ${errors.join(', ')}`,
        success: `${t('successfullyUploaded')} ${uploadedDocuments.length} of ${files.length} files`,
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
        error: `${t('allUploadsFailed')} ${errors.join(', ')}`,
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
  }, [allowMultiple])

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
          multiple={allowMultiple}
        />
        
        <div className="space-y-4">
          {uploadState.uploading ? (
            <>
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <div>
                <p className="text-white font-medium">
                  {uploadState.totalFiles > 1 ? t('uploadingFiles') : t('uploadingFile')}
                </p>
                <p className="text-gray-400 text-sm">
                  {uploadState.totalFiles > 1
                    ? t('processingFiles', { current: uploadState.uploadedFiles, total: uploadState.totalFiles })
                    : t('pleaseWait')
                  }
                </p>
                {uploadState.totalFiles > 1 && (
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <div>
                <p className="text-white font-medium">
                  {dragActive
                    ? allowMultiple ? t('dropFilesHere') : t('dropFileHere')
                    : t('clickToUpload')
                  }
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {t('jpgPngPdfFiles')}
                  {allowMultiple && ` ${t('multipleSupported')}`}
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
          {t('supportedFileTypes')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
          <div>
            <strong className="text-white">{t('images')}</strong>
            <br />JPG, JPEG, PNG
          </div>
          <div>
            <strong className="text-white">{t('documents')}</strong>
            <br />{t('pdfConvertedOcr')}
          </div>
          <div>
            <strong className="text-white">{t('sizeLimit')}</strong>
            <br />{t('maximum10MB')}
          </div>
        </div>
      </div>
    </div>
  )
}