'use client'

import { Clock, CheckCircle, XCircle, Loader2, Upload, Cog } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface DocumentStatusBadgeProps {
  status: 'pending' | 'processing' | 'ocr_processing' | 'completed' | 'failed' | 'uploading'
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
  const t = useTranslations('documents.status')

  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          icon: Upload,
          text: t('uploading'),
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'pending':
        return {
          icon: Clock,
          text: t('pending'),
          className: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50',
          animate: false
        }
      case 'processing':
        const stageText = processingStage
          ? `${t('processing')} (${processingStage})`
          : t('processing')
        return {
          icon: processingStage === 'extracting' ? Upload :
                processingStage === 'analyzing' ? Cog : Loader2,
          text: stageText,
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'ocr_processing':
        return {
          icon: Cog,
          text: t('ocrProcessing'),
          className: 'bg-purple-900/20 text-purple-300 border-purple-700/50',
          animate: true
        }
      case 'completed':
        return {
          icon: CheckCircle,
          text: t('completed'),
          className: 'bg-green-900/20 text-green-300 border-green-700/50',
          animate: false
        }
      case 'failed':
        return {
          icon: XCircle,
          text: t('failed'),
          className: 'bg-red-900/20 text-red-300 border-red-700/50',
          animate: false
        }
      default:
        return {
          icon: Clock,
          text: t('unknown'),
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
        status === 'failed' && errorMessage ? 'cursor-help' : ''
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
    </span>
  )
}