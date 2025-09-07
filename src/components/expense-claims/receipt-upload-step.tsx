/**
 * Receipt Upload Step - Single Responsibility Component
 * DSPy-Inspired Architecture: Handles only file upload and camera capture
 * Part of the upload → process → pre-filled form workflow
 */

'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, FileImage, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import MobileCameraCapture from './mobile-camera-capture'

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

  // DSPy Principle: Single responsibility - only handle file selection and validation
  const handleFileSelect = useCallback((file: File) => {
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

    setSelectedFile(file)

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }

    // DSPy Flow: Pass validated file to parent orchestrator
    onFileSelected(file)
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
          <FileImage className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Receipt Selected</h3>
          <p className="text-gray-400">Your receipt is ready for processing</p>
        </div>

        <Card className="bg-gray-700 border-gray-600">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <img 
                src={previewUrl} 
                alt="Receipt preview" 
                className="w-20 h-20 object-cover rounded"
              />
              <div className="flex-1">
                <p className="text-white font-medium">{selectedFile.name}</p>
                <p className="text-gray-400 text-sm">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <div className="mt-2">
                  <Button
                    onClick={() => {
                      setSelectedFile(null)
                      setPreviewUrl(null)
                    }}
                    variant="outline"
                    size="sm"
                    className="border-gray-600 text-gray-300 hover:bg-gray-600"
                    disabled={isProcessing}
                  >
                    Choose Different File
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isProcessing && (
          <Alert className="bg-blue-900/20 border-blue-700">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-blue-400">
              Processing receipt with DSPy extraction engine...
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  // Main upload interface (DSPy-inspired clean UX)
  return (
    <div className="space-y-6">
      <div className="text-center">
        <Camera className="w-16 h-16 mx-auto text-blue-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Upload Receipt</h3>
        <p className="text-gray-400">
          Capture or upload your receipt for automatic DSPy-powered data extraction
        </p>
      </div>

      {error && (
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">
            {error === 'error/validation' && 'Please select a valid image (JPEG, PNG, WebP) or PDF file'}
            {error === 'error/size' && 'File size must be less than 10MB'}
            {error !== 'error/validation' && error !== 'error/size' && error}
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Options - DSPy-inspired clean design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          onClick={handleCameraCapture}
          className="h-32 bg-blue-600 hover:bg-blue-700 flex flex-col items-center justify-center space-y-3"
          disabled={isProcessing}
        >
          <Camera className="w-10 h-10" />
          <div className="text-center">
            <div className="font-medium">Use Camera</div>
            <div className="text-xs opacity-80">Capture receipt photo</div>
          </div>
        </Button>

        <Button
          onClick={handleFileUpload}
          variant="outline"
          className="h-32 border-gray-600 hover:bg-gray-700 flex flex-col items-center justify-center space-y-3"
          disabled={isProcessing}
        >
          <Upload className="w-10 h-10" />
          <div className="text-center">
            <div className="font-medium">Upload File</div>
            <div className="text-xs opacity-80">Select from device</div>
          </div>
        </Button>
      </div>

      {/* DSPy Flow: Allow manual entry option */}
      <div className="text-center">
        <Button 
          variant="ghost" 
          onClick={onSkip} 
          className="text-gray-400 hover:text-white"
          disabled={isProcessing}
        >
          Skip receipt upload and enter details manually
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