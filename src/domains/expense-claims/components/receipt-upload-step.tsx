/**
 * Receipt Upload Step - Single Responsibility Component
 * AI-Inspired Architecture: Handles only file upload and camera capture
 * Part of the upload → process → pre-filled form workflow
 */

'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, FileImage, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import MobileCameraCapture from './mobile-camera-capture'
import { compressReceiptImage, shouldCompressImage } from '@/lib/pwa/image-compression'

interface ReceiptUploadStepProps {
  onFileSelected: (file: File) => void
  onSkip: () => void
  error?: string
  isProcessing?: boolean
}

export default function ReceiptUploadStep({ 
  onFileSelected, 
  onSkip, 
  error, 
  isProcessing = false 
}: ReceiptUploadStepProps) {
  const [showCamera, setShowCamera] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State for compression progress
  const [isCompressing, setIsCompressing] = useState(false)

  // AI Principle: Single responsibility - only handle file selection and validation
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return

    // File validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      onFileSelected(new File([], '', { type: 'error/validation' })) // Signal validation error
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      onFileSelected(new File([], '', { type: 'error/size' })) // Signal size error
      return
    }

    let fileToUpload = file

    // Compress large images before upload (only for images, not PDFs)
    if (file.type.startsWith('image/') && shouldCompressImage(file)) {
      try {
        setIsCompressing(true)
        console.log(`[Receipt Upload] Compressing image: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        fileToUpload = await compressReceiptImage(file)
        console.log(`[Receipt Upload] Compressed to: ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`)
      } catch (error) {
        console.error('[Receipt Upload] Compression failed, using original:', error)
        // Fall back to original file if compression fails
      } finally {
        setIsCompressing(false)
      }
    }

    setSelectedFile(fileToUpload)

    // Create preview for images
    if (fileToUpload.type.startsWith('image/')) {
      const url = URL.createObjectURL(fileToUpload)
      setPreviewUrl(url)
    }

    // AI Flow: Pass validated (and possibly compressed) file to parent orchestrator
    onFileSelected(fileToUpload)
  }, [onFileSelected])

  const handleCameraCapture = () => {
    setShowCamera(true)
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleCameraClose = () => {
    setShowCamera(false)
  }

  // Mobile camera interface
  if (showCamera) {
    return (
      <MobileCameraCapture
        onCapture={handleFileSelect}
        onClose={handleCameraClose}
        isProcessing={isProcessing}
      />
    )
  }

  // If file is selected and processing, show preview
  if (selectedFile && previewUrl) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <FileImage className="w-16 h-16 mx-auto text-green-600 dark:text-green-400 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Receipt Selected</h3>
          <p className="text-muted-foreground">Your receipt is ready for processing</p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <img
                src={previewUrl}
                alt="Receipt preview"
                className="w-20 h-20 object-cover rounded border border-border"
              />
              <div className="flex-1">
                <p className="text-foreground font-medium">{selectedFile.name}</p>
                <p className="text-muted-foreground text-sm">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <div className="mt-2">
                  <Button
                    onClick={() => {
                      setSelectedFile(null)
                      setPreviewUrl(null)
                    }}
                    disabled={isProcessing}
                    variant="secondary"
                    size="sm"
                  >
                    Choose Different File
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isProcessing && (
          <Alert className="bg-primary/10 border-primary/30">
            <AlertCircle className="w-4 h-4 text-primary" />
            <AlertDescription className="text-primary">
              Processing receipt with AI extraction...
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  // Main upload interface (AI-inspired clean UX)
  return (
    <div className="space-y-4">
      <div className="text-center">
        <Camera className="w-8 h-8 mx-auto text-primary mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">Upload Receipt</h3>
        <p className="text-muted-foreground text-sm">
          Capture or upload your receipt for automatic data extraction
        </p>
      </div>

      {error && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <AlertDescription className="text-destructive">
            {error === 'error/validation' && 'Please select a valid image (JPEG, PNG, WebP) or PDF file'}
            {error === 'error/size' && 'File size must be less than 10MB'}
            {error !== 'error/validation' && error !== 'error/size' && error}
          </AlertDescription>
        </Alert>
      )}

      {/* Compression indicator */}
      {isCompressing && (
        <Alert className="bg-primary/10 border-primary/30">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <AlertDescription className="text-primary">
            Optimizing image for faster upload...
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Options - Compact buttons with 37% width */}
      <div className="flex justify-center gap-2">
        <Button
          onClick={handleCameraCapture}
          disabled={isProcessing || isCompressing}
          className="h-12 w-40 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Camera className="w-5 h-5 mr-2" />
          Camera
        </Button>

        <Button
          onClick={handleFileUpload}
          disabled={isProcessing || isCompressing}
          className="h-12 w-40 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Upload className="w-5 h-5 mr-2" />
          Upload
        </Button>
      </div>

      {/* AI Flow: Allow manual entry option */}
      <div className="flex justify-center">
        <Button
          onClick={onSkip}
          disabled={isProcessing || isCompressing}
          variant="secondary"
          size="sm"
        >
          Enter Manually
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        className="hidden"
      />
    </div>
  )
}