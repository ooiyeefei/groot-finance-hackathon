/**
 * Mobile Camera Capture Component with PWA Features
 * Implements advanced camera handling for expense receipt capture
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, X, RotateCw, Zap, ZapOff, Grid, Square, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface MobileCameraCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
  isProcessing?: boolean
}

interface CameraStream {
  stream: MediaStream | null
  deviceId: string | null
  facingMode: 'user' | 'environment'
}

interface CameraSettings {
  flashEnabled: boolean
  gridEnabled: boolean
  quality: 'high' | 'medium' | 'low'
}

export default function MobileCameraCapture({ 
  onCapture, 
  onClose, 
  isProcessing = false 
}: MobileCameraCaptureProps) {
  const [cameraStream, setCameraStream] = useState<CameraStream>({
    stream: null,
    deviceId: null,
    facingMode: 'environment'
  })
  
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    flashEnabled: false,
    gridEnabled: true,
    quality: 'high'
  })
  
  const [isInitializing, setIsInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Initialize camera on mount
  useEffect(() => {
    initializeCamera()
    return () => {
      cleanup()
    }
  }, [])

  // Switch camera when facing mode changes
  useEffect(() => {
    if (cameraStream.stream) {
      switchCamera()
    }
  }, [cameraStream.facingMode])

  const initializeCamera = async () => {
    try {
      setIsInitializing(true)
      setError(null)

      // Check if camera is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device')
      }

      // Get available devices
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      setAvailableDevices(videoDevices)

      if (videoDevices.length === 0) {
        throw new Error('No camera found on this device')
      }

      // Start camera with optimal settings
      await startCamera()
    } catch (err) {
      console.error('Camera initialization failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize camera')
    } finally {
      setIsInitializing(false)
    }
  }

  const startCamera = async () => {
    try {
      // Enhanced constraints for optimal receipt capture
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: cameraStream.facingMode,
          width: { ideal: 1920, max: 4096 },
          height: { ideal: 1080, max: 3072 },
          aspectRatio: { ideal: 16/9 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      }

      // Add device-specific constraints if available
      if (cameraStream.deviceId) {
        delete (constraints.video as any).facingMode
        ;(constraints.video as any).deviceId = { exact: cameraStream.deviceId }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      streamRef.current = stream
      setCameraStream(prev => ({ ...prev, stream }))
    } catch (err) {
      console.error('Failed to start camera:', err)
      throw new Error('Unable to access camera. Please check permissions.')
    }
  }

  const switchCamera = async () => {
    cleanup()
    
    try {
      // Find device based on facing mode
      const targetDevice = availableDevices.find(device => {
        const label = device.label.toLowerCase()
        return cameraStream.facingMode === 'environment' 
          ? (label.includes('back') || label.includes('environment') || label.includes('rear'))
          : (label.includes('front') || label.includes('user') || label.includes('selfie'))
      })

      setCameraStream(prev => ({ 
        ...prev, 
        deviceId: targetDevice?.deviceId || null 
      }))
      
      await startCamera()
    } catch (err) {
      console.error('Camera switch failed:', err)
      setError('Failed to switch camera')
    }
  }

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return

    setIsCapturing(true)
    
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (!ctx) throw new Error('Canvas context not available')

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Apply flash effect if enabled
      if (cameraSettings.flashEnabled) {
        // Create flash overlay
        const flashOverlay = document.createElement('div')
        flashOverlay.style.cssText = `
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: white; z-index: 9999; pointer-events: none;
          animation: flash 200ms ease-out;
        `
        document.body.appendChild(flashOverlay)
        setTimeout(() => document.body.removeChild(flashOverlay), 200)
      }

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to blob with quality settings
      const qualityMap = { high: 0.95, medium: 0.85, low: 0.75 }
      const quality = qualityMap[cameraSettings.quality]

      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Failed to create image')

        // Create optimized file
        const file = new File([blob], `receipt-${Date.now()}.jpg`, { 
          type: 'image/jpeg' 
        })

        // Show preview
        const previewUrl = URL.createObjectURL(blob)
        setCapturedImage(previewUrl)
        setCapturedFile(file) // Store the file for manual confirmation

        // Removed auto-confirm to allow user to decide

      }, 'image/jpeg', quality)

    } catch (err) {
      console.error('Photo capture failed:', err)
      setError('Failed to capture photo. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }, [cameraSettings, isCapturing, capturedImage])

  const confirmCapture = (file: File) => {
    onCapture(file)
    cleanup()
  }

  const retakePhoto = () => {
    setCapturedImage(null)
    setCapturedFile(null)
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage)
    }
  }

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraStream(prev => ({ ...prev, stream: null }))
  }

  // Loading state
  if (isInitializing) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <Card className="bg-card border-border p-6">
          <CardContent className="text-center">
            <Camera className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-foreground">Initializing camera...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <Card className="bg-card border-border max-w-sm w-full m-4">
          <CardContent className="p-6 text-center">
            <Alert className="bg-destructive/10 border-destructive/30 mb-4">
              <AlertDescription className="text-destructive">{error}</AlertDescription>
            </Alert>
            <div className="space-y-3">
              <Button onClick={initializeCamera} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Try Again
              </Button>
              <Button onClick={onClose} variant="secondary" className="w-full">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Captured photo preview
  if (capturedImage) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="w-full max-w-md m-4">
          <div className="relative mb-4 bg-black rounded-lg overflow-hidden">
            <img 
              src={capturedImage} 
              alt="Captured receipt" 
              className="w-full h-auto max-h-96 object-contain"
            />
            <div className="absolute top-4 right-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={retakePhoto}
              className="flex-1 border-border text-muted-foreground hover:text-foreground"
            >
              Retake
            </Button>
            <Button
              onClick={() => capturedFile && confirmCapture(capturedFile)}
              disabled={isProcessing || !capturedFile}
              className="flex-1 bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600"
            >
              {isProcessing ? 'Processing...' : 'Use Photo'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Main camera interface
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-surface/90 backdrop-blur-sm border-b border-border">
        <h3 className="text-foreground font-medium">Capture Receipt</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-5 h-5 text-foreground" />
        </Button>
      </div>

      {/* Camera Viewport */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        
        {/* Camera Grid Overlay */}
        {cameraSettings.gridEnabled && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-full h-full grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20"></div>
              ))}
            </div>
          </div>
        )}

        {/* Document Frame Guide */}
        <div className="absolute inset-8 border-2 border-dashed border-blue-400 rounded-lg pointer-events-none">
          <div className="absolute -top-8 left-0 right-0 text-center">
            <span className="bg-blue-400 text-black px-2 py-1 rounded text-sm font-medium">
              Align receipt within frame
            </span>
          </div>
        </div>

        {/* Corner Guides */}
        <div className="absolute top-8 left-8 w-8 h-8 border-l-4 border-t-4 border-blue-400 pointer-events-none"></div>
        <div className="absolute top-8 right-8 w-8 h-8 border-r-4 border-t-4 border-blue-400 pointer-events-none"></div>
        <div className="absolute bottom-8 left-8 w-8 h-8 border-l-4 border-b-4 border-blue-400 pointer-events-none"></div>
        <div className="absolute bottom-8 right-8 w-8 h-8 border-r-4 border-b-4 border-blue-400 pointer-events-none"></div>
      </div>

      {/* Controls */}
      <div className="p-6 bg-surface/90 backdrop-blur-sm border-t border-border">
        {/* Settings Row */}
        <div className="flex justify-center items-center gap-6 mb-6">
          {/* Flash Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCameraSettings(prev => ({ 
              ...prev, 
              flashEnabled: !prev.flashEnabled 
            }))}
            className={`${cameraSettings.flashEnabled ? 'text-yellow-400' : 'text-gray-400'}`}
          >
            {cameraSettings.flashEnabled ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          </Button>

          {/* Grid Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCameraSettings(prev => ({ 
              ...prev, 
              gridEnabled: !prev.gridEnabled 
            }))}
            className={`${cameraSettings.gridEnabled ? 'text-blue-400' : 'text-gray-400'}`}
          >
            <Grid className="w-5 h-5" />
          </Button>

          {/* Camera Switch */}
          {availableDevices.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCameraStream(prev => ({ 
                ...prev, 
                facingMode: prev.facingMode === 'user' ? 'environment' : 'user' 
              }))}
              className="text-gray-400"
            >
              <RotateCw className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Capture Button */}
        <div className="flex justify-center">
          <Button
            onClick={capturePhoto}
            disabled={isCapturing}
            className="w-20 h-20 rounded-full bg-white hover:bg-gray-100 border-4 border-gray-300"
          >
            <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-400 flex items-center justify-center">
              {isCapturing ? (
                <div className="w-6 h-6 bg-red-500 rounded animate-pulse"></div>
              ) : (
                <Camera className="w-8 h-8 text-gray-800" />
              )}
            </div>
          </Button>
        </div>
      </div>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Flash animation styles */}
      <style jsx>{`
        @keyframes flash {
          0% { opacity: 0; }
          50% { opacity: 0.8; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}