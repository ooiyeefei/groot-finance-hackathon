'use client'

import { Clock, CheckCircle, XCircle, Loader2, Upload, Cog, Eye, Brain, FileText } from 'lucide-react'

interface DocumentStatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'uploading' | 'classifying' | 'classification_failed' | 'pending_extraction' | 'extracting' | 'ocr_processing'
  errorMessage?: string
  processingStage?: 'extracting' | 'analyzing' | 'finalizing'
  animated?: boolean
}

export default function DocumentStatusBadge({ 
  status, 
  errorMessage, 
  processingStage,
  animated = true 
}: DocumentStatusBadgeProps) {
  
  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          icon: Upload,
          text: 'Uploading',
          variant: 'info' as const,
          animate: true
        }
      case 'pending':
        return {
          icon: Clock,
          text: 'Pending',
          variant: 'warning' as const,
          animate: false
        }
      case 'processing':
        const stageText = processingStage
          ? `Processing (${processingStage})`
          : 'Processing'
        return {
          icon: processingStage === 'extracting' ? Upload :
                processingStage === 'analyzing' ? Cog : Loader2,
          text: stageText,
          variant: 'info' as const,
          animate: true
        }
      case 'ocr_processing':
        return {
          icon: Eye,
          text: 'OCR Processing',
          variant: 'info' as const,
          animate: true
        }
      case 'classifying':
        return {
          icon: Brain,
          text: 'Classifying Document',
          variant: 'info' as const,
          animate: true
        }
      case 'classification_failed':
        return {
          icon: XCircle,
          text: 'Classification Failed',
          variant: 'error' as const,
          animate: false
        }
      case 'pending_extraction':
        return {
          icon: Brain,
          text: 'Processing',
          variant: 'info' as const,
          animate: true
        }
      case 'extracting':
        return {
          icon: FileText,
          text: 'Extracting Data',
          variant: 'info' as const,
          animate: true
        }
      case 'completed':
        return {
          icon: CheckCircle,
          text: 'Completed',
          variant: 'success' as const,
          animate: false
        }
      case 'failed':
        return {
          icon: XCircle,
          text: 'Failed',
          variant: 'error' as const,
          animate: false
        }
      default:
        return {
          icon: Clock,
          text: 'Unknown',
          variant: 'default' as const,
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  // Map variant to CSS class
  const getCSSClass = () => {
    switch (config.variant) {
      case 'success':
        return 'badge-success-status'
      case 'warning':
        return 'badge-warning-status'
      case 'error':
        return 'badge-error-status'
      case 'info':
      default:
        return 'badge-info-metadata'
    }
  }

  return (
    <div
      className={`${getCSSClass()} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        (status === 'failed' || status === 'classification_failed') && errorMessage ? 'cursor-help' : ''
      }`}
      title={status === 'failed' && errorMessage ? errorMessage : undefined}
    >
      <Icon
        className={`w-3 h-3 mr-1 ${
          config.animate && animated ? 'animate-spin' : ''
        }`}
      />
      {config.text}

      {/* Processing stage indicator */}
      {status === 'processing' && processingStage && (
        <span className="ml-1 w-1 h-1 bg-current rounded-full animate-pulse" />
      )}
    </div>
  )
}