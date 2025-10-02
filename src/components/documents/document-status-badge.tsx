'use client'

import { Clock, CheckCircle, XCircle, Loader2, Upload, Cog, Eye, Brain, FileText } from 'lucide-react'

interface DocumentStatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'uploading' | 'classifying' | 'classification_failed' | 'pending_extraction' | 'extracting'
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
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'pending':
        return {
          icon: Clock,
          text: 'Pending',
          className: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50',
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
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'classifying':
        return {
          icon: Brain,
          text: 'Classifying Document',
          className: 'bg-indigo-900/20 text-indigo-300 border-indigo-700/50',
          animate: true
        }
      case 'classification_failed':
        return {
          icon: XCircle,
          text: 'Classification Failed',
          className: 'bg-red-900/20 text-red-300 border-red-700/50',
          animate: false
        }
      case 'pending_extraction':
        return {
          icon: Brain,
          text: 'Processing',
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'extracting':
        return {
          icon: FileText,
          text: 'Extracting Data',
          className: 'bg-cyan-900/20 text-cyan-300 border-cyan-700/50',
          animate: true
        }
      case 'completed':
        return {
          icon: CheckCircle,
          text: 'Completed',
          className: 'bg-green-900/20 text-green-300 border-green-700/50',
          animate: false
        }
      case 'failed':
        return {
          icon: XCircle,
          text: 'Failed',
          className: 'bg-red-900/20 text-red-300 border-red-700/50',
          animate: false
        }
      default:
        return {
          icon: Clock,
          text: 'Unknown',
          className: 'bg-gray-900/20 text-gray-300 border-gray-700/50',
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className} ${
        (status === 'failed' || status === 'classification_failed') && errorMessage ? 'cursor-help' : ''
      }`}
      title={(status === 'failed' || status === 'classification_failed') && errorMessage ? errorMessage : undefined}
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
    </span>
  )
}