/**
 * Domain-Agnostic Error Display Components
 *
 * Provides consistent error messaging UI across all document processing domains
 * Supports: invoices, expense-claims, and any future domains
 */

'use client'

import { AlertCircle, RefreshCw, Phone, Clock, CheckCircle } from 'lucide-react'
import { formatErrorForUI, getRetryRecommendation, type ErrorContext } from '../error-message-mapper'

interface ErrorDisplayProps {
  errorContext: ErrorContext
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
  showRetryButton?: boolean
  showDismissButton?: boolean
}

/**
 * Main error display component with user-friendly messaging and actionable steps
 * Works across all document processing domains (invoices, expense-claims)
 */
export function ErrorDisplay({
  errorContext,
  onRetry,
  onDismiss,
  className = '',
  showRetryButton = true,
  showDismissButton = true
}: ErrorDisplayProps) {
  const errorDetails = formatErrorForUI(errorContext)
  const retryRecommendation = getRetryRecommendation(errorContext)

  // Determine color scheme based on severity
  const severityStyles = {
    low: {
      bg: 'bg-yellow-50 border-yellow-200',
      icon: 'text-yellow-600',
      title: 'text-yellow-800',
      text: 'text-yellow-700',
      button: 'bg-yellow-600 hover:bg-yellow-700'
    },
    medium: {
      bg: 'bg-orange-50 border-orange-200',
      icon: 'text-orange-600',
      title: 'text-orange-800',
      text: 'text-orange-700',
      button: 'bg-orange-600 hover:bg-orange-700'
    },
    high: {
      bg: 'bg-red-50 border-red-200',
      icon: 'text-red-600',
      title: 'text-red-800',
      text: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700'
    },
    critical: {
      bg: 'bg-red-100 border-red-300',
      icon: 'text-red-700',
      title: 'text-red-900',
      text: 'text-red-800',
      button: 'bg-red-700 hover:bg-red-800'
    }
  }

  const styles = severityStyles[errorDetails.severity]

  return (
    <div className={`rounded-lg border p-4 ${styles.bg} ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertCircle className={`h-5 w-5 mt-0.5 ${styles.icon}`} />
        <div className="flex-1 min-w-0">
          {/* Error title */}
          <h3 className={`text-sm font-semibold ${styles.title}`}>
            {errorDetails.title}
          </h3>

          {/* Main error message */}
          <p className={`mt-1 text-sm ${styles.text}`}>
            {errorDetails.message}
          </p>

          {/* Actionable steps */}
          {errorDetails.actionableSteps && errorDetails.actionableSteps.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-medium ${styles.title} mb-2`}>
                What you can do:
              </p>
              <ul className={`text-xs ${styles.text} space-y-1`}>
                {errorDetails.actionableSteps.map((step, index) => (
                  <li key={index} className="flex items-start">
                    <span className="inline-block w-1 h-1 rounded-full bg-current mt-2 mr-2 flex-shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Support contact info */}
          {errorDetails.contactInfo && (
            <div className={`mt-3 text-xs ${styles.text} flex items-center`}>
              <Phone className="h-3 w-3 mr-1" />
              {errorDetails.contactInfo}
            </div>
          )}

          {/* Domain-specific context display */}
          {errorContext.domain && errorContext.documentType && (
            <div className={`mt-2 text-xs ${styles.text} opacity-75`}>
              Domain: {errorContext.domain} • Document: {errorContext.documentType}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Retry button */}
            {showRetryButton && onRetry && retryRecommendation.shouldRetry && (
              <button
                onClick={onRetry}
                className={`inline-flex items-center px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${styles.button}`}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Try Again
                {retryRecommendation.retryDelay && (
                  <span className="ml-1 opacity-75">
                    (wait {Math.floor(retryRecommendation.retryDelay / 60)}m)
                  </span>
                )}
              </button>
            )}

            {/* Dismiss button */}
            {showDismissButton && onDismiss && (
              <button
                onClick={onDismiss}
                className={`inline-flex items-center px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${styles.text} border-current hover:bg-white/50`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact error display for inline use across all domains
 */
export function CompactErrorDisplay({
  errorContext,
  onRetry,
  className = ''
}: {
  errorContext: ErrorContext
  onRetry?: () => void
  className?: string
}) {
  const errorDetails = formatErrorForUI(errorContext)
  const retryRecommendation = getRetryRecommendation(errorContext)

  // Simplified styling for compact display
  const severityColor = {
    low: 'text-yellow-600',
    medium: 'text-orange-600',
    high: 'text-red-600',
    critical: 'text-red-700'
  }[errorDetails.severity]

  return (
    <div className={`flex items-center justify-between p-2 bg-gray-50 rounded text-sm ${className}`}>
      <div className="flex items-center space-x-2 min-w-0 flex-1">
        <AlertCircle className={`h-4 w-4 flex-shrink-0 ${severityColor}`} />
        <span className="text-gray-700 truncate">
          {errorDetails.message}
        </span>
      </div>

      {onRetry && retryRecommendation.shouldRetry && (
        <button
          onClick={onRetry}
          className="ml-3 inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Domain-agnostic error toast notification component
 */
export function ErrorToast({
  errorContext,
  onRetry,
  onDismiss,
  autoHideDuration = 10000
}: {
  errorContext: ErrorContext
  onRetry?: () => void
  onDismiss?: () => void
  autoHideDuration?: number
}) {
  const errorDetails = formatErrorForUI(errorContext)

  // Auto-hide non-critical errors
  React.useEffect(() => {
    if (errorDetails.severity !== 'critical' && onDismiss && autoHideDuration > 0) {
      const timer = setTimeout(onDismiss, autoHideDuration)
      return () => clearTimeout(timer)
    }
  }, [errorDetails.severity, onDismiss, autoHideDuration])

  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50">
      <div className="bg-white border border-red-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              {errorDetails.title}
            </h4>
            <p className="mt-1 text-sm text-gray-700">
              {errorDetails.message}
            </p>

            <div className="mt-3 flex space-x-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Domain-agnostic processing status indicator with error state support
 */
export function ProcessingStatusIndicator({
  status,
  errorContext,
  onRetry,
  domain
}: {
  status: 'processing' | 'success' | 'error'
  errorContext?: ErrorContext
  onRetry?: () => void
  domain?: 'invoices' | 'expense_claims'
}) {
  // Domain-specific processing messages
  const processingMessages = {
    invoices: 'Processing invoice...',
    expense_claims: 'Processing receipt...'
  };

  const successMessages = {
    invoices: 'Invoice processing complete',
    expense_claims: 'Receipt processing complete'
  };

  if (status === 'processing') {
    return (
      <div className="flex items-center space-x-2 text-blue-600">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm">
          {domain ? processingMessages[domain] : 'Processing...'}
        </span>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm">
          {domain ? successMessages[domain] : 'Processing complete'}
        </span>
      </div>
    )
  }

  if (status === 'error' && errorContext) {
    // Ensure domain context is passed to error display
    const contextWithDomain = {
      ...errorContext,
      domain: errorContext.domain || domain
    };

    return (
      <CompactErrorDisplay
        errorContext={contextWithDomain}
        onRetry={onRetry}
      />
    )
  }

  return null
}

/**
 * Domain-specific document upload error display
 */
export function DocumentUploadError({
  errorContext,
  onRetry,
  onCancel,
  domain = 'invoices'
}: {
  errorContext: ErrorContext
  onRetry?: () => void
  onCancel?: () => void
  domain?: 'invoices' | 'expense_claims'
}) {
  const contextWithDomain = {
    ...errorContext,
    domain
  };

  const domainLabels = {
    invoices: 'Invoice Upload Failed',
    expense_claims: 'Receipt Upload Failed'
  };

  return (
    <div className="border-2 border-dashed border-red-300 rounded-lg p-6 text-center bg-red-50">
      <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
      <h3 className="text-lg font-medium text-red-900 mb-2">
        {domainLabels[domain]}
      </h3>

      <ErrorDisplay
        errorContext={contextWithDomain}
        onRetry={onRetry}
        onDismiss={onCancel}
        showRetryButton={true}
        showDismissButton={true}
        className="mt-4 text-left"
      />
    </div>
  )
}

// React import for hooks
import React from 'react'