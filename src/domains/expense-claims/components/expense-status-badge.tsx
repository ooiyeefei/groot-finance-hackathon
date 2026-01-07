'use client'

import { Clock, CheckCircle, XCircle, Loader2, Upload, Cog, Brain, FileText, Send, ThumbsUp, Wallet, ThumbsDown } from 'lucide-react'

interface ExpenseStatusBadgeProps {
  status: string
  errorMessage?: string | { message?: string } | null
  processingStage?: 'uploading' | 'classifying' | 'extracting' | 'processing' | 'analyzing'
  animated?: boolean
}

/**
 * Animated status badge for expense claims
 * Shows processing states with spinning icons like the invoice page
 */
export default function ExpenseStatusBadge({
  status,
  errorMessage,
  processingStage,
  animated = true
}: ExpenseStatusBadgeProps) {

  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          icon: Upload,
          text: 'Uploading',
          variant: 'info' as const,
          animate: true
        }
      case 'classifying':
        return {
          icon: Brain,
          text: 'Classifying',
          variant: 'info' as const,
          animate: true
        }
      case 'extracting':
      case 'processing':
        return {
          icon: Brain,
          text: 'Processing',
          variant: 'info' as const,
          animate: true
        }
      case 'analyzing':
        return {
          icon: Loader2,
          text: 'Analyzing',
          variant: 'info' as const,
          animate: true
        }
      case 'draft':
        return {
          icon: Clock,
          text: 'Draft',
          variant: 'default' as const,
          animate: false
        }
      case 'submitted':
        return {
          icon: Send,
          text: 'Submitted',
          variant: 'warning' as const,
          animate: false
        }
      case 'approved':
        return {
          icon: ThumbsUp,
          text: 'Approved',
          variant: 'success' as const,
          animate: false
        }
      case 'rejected':
        return {
          icon: ThumbsDown,
          text: 'Rejected',
          variant: 'error' as const,
          animate: false
        }
      case 'reimbursed':
        return {
          icon: Wallet,
          text: 'Reimbursed',
          variant: 'success' as const,
          animate: false
        }
      case 'completed':
        return {
          icon: CheckCircle,
          text: 'Completed',
          variant: 'success' as const,
          animate: false
        }
      case 'classification_failed':
        return {
          icon: XCircle,
          text: 'Classification Failed',
          variant: 'error' as const,
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
          text: status || 'Unknown',
          variant: 'default' as const,
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  // Map variant to CSS class (matching semantic design system)
  const getCSSClass = () => {
    switch (config.variant) {
      case 'success':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      case 'error':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      case 'info':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
      default:
        return 'bg-muted text-muted-foreground border border-border'
    }
  }

  // Extract error message string from ErrorDetails or use string directly
  const getErrorMessage = (): string | undefined => {
    if (!errorMessage) return undefined
    if (typeof errorMessage === 'object' && errorMessage !== null && 'message' in errorMessage) {
      return errorMessage.message
    }
    if (typeof errorMessage === 'string') {
      return errorMessage
    }
    return undefined
  }

  const isProcessing = ['uploading', 'classifying', 'extracting', 'processing', 'analyzing'].includes(status)

  return (
    <div
      className={`${getCSSClass()} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        (status === 'failed' || status === 'classification_failed') && errorMessage ? 'cursor-help' : ''
      }`}
      title={(status === 'failed' || status === 'classification_failed') && errorMessage ? getErrorMessage() : undefined}
    >
      <Icon
        className={`w-3 h-3 mr-1 ${
          config.animate && animated ? 'animate-spin' : ''
        }`}
      />
      {config.text}

      {/* Pulsing dot indicator during active processing */}
      {isProcessing && (
        <span className="ml-1 w-1 h-1 bg-current rounded-full animate-pulse" />
      )}
    </div>
  )
}
