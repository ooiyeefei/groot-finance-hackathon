/**
 * Field Suggestion Component
 * Displays AI-suggested values alongside current manual entries
 * Allows users to accept or reject individual field suggestions
 */

'use client'

import { useState } from 'react'
import { CheckCircle, X, Brain, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface FieldSuggestionProps {
  fieldName: string
  currentValue: string | number
  suggestedValue: string | number
  fieldLabel: string
  confidence?: number
  onAccept: (suggestedValue: string | number) => void
  onReject: () => void
  isDismissed?: boolean
  suggestionReason?: string
}

export default function FieldSuggestion({
  fieldName,
  currentValue,
  suggestedValue,
  fieldLabel,
  confidence = 0,
  onAccept,
  onReject,
  isDismissed = false,
  suggestionReason
}: FieldSuggestionProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  // Don't show if values are the same or suggestion is dismissed
  if (currentValue === suggestedValue || isDismissed) {
    return null
  }

  const handleAccept = async () => {
    setIsProcessing(true)
    try {
      await onAccept(suggestedValue)
    } finally {
      setIsProcessing(false)
    }
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'text-green-400'
    if (conf >= 60) return 'text-yellow-400'
    return 'text-orange-400'
  }

  const getConfidenceBadge = (conf: number) => {
    if (conf >= 80) return { color: 'bg-green-600', label: 'High Confidence' }
    if (conf >= 60) return { color: 'bg-yellow-600', label: 'Medium Confidence' }
    return { color: 'bg-orange-600', label: 'Low Confidence' }
  }

  return (
    <Card className="bg-blue-500/10 border border-blue-500/30 mt-2">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">AI Suggestion for {fieldLabel}</span>
              {confidence > 0 && (
                <Badge className={`text-white text-xs ${getConfidenceBadge(confidence).color}`}>
                  {getConfidenceBadge(confidence).label}
                </Badge>
              )}
              {confidence > 0 && (
                <span className={`text-xs ${getConfidenceColor(confidence)}`}>
                  {Math.round(confidence)}%
                </span>
              )}
            </div>

            {/* Value Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Current:</span>
                <div className="bg-muted p-2 rounded border border-border">
                  <span className="text-foreground">
                    {currentValue || <span className="text-muted-foreground italic">Empty</span>}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-primary" />
              </div>

              <div>
                <span className="text-blue-600 dark:text-blue-400 block mb-1">AI Suggests:</span>
                <div className="bg-blue-500/10 p-2 rounded border border-blue-500/30">
                  <span className="text-blue-600 dark:text-blue-400 font-medium">{suggestedValue}</span>
                </div>
              </div>
            </div>

            {/* Suggestion Reason */}
            {suggestionReason && (
              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 p-2 rounded border border-blue-500/20">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                {suggestionReason}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleAccept}
                disabled={isProcessing}
                className="bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600"
              >
                {isProcessing ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Accept
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isProcessing}
                className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-3 h-3 mr-1" />
                Keep Current
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Bulk suggestion component for multiple fields
interface BulkSuggestionsProps {
  suggestions: Array<{
    fieldName: string
    currentValue: string | number
    suggestedValue: string | number
    fieldLabel: string
    confidence?: number
    suggestionReason?: string
  }>
  onAcceptAll: (acceptedSuggestions: Record<string, string | number>) => void
  onRejectAll: () => void
  onFieldAccept: (fieldName: string, value: string | number) => void
  onFieldReject: (fieldName: string) => void
  dismissedFields?: Set<string>
  isProcessing?: boolean // NEW: Track if AI processing is currently in progress
  processingStatus?: 'idle' | 'processing' | 'completed' | 'failed' // NEW: Processing status
}

export function BulkSuggestions({
  suggestions,
  onAcceptAll,
  onRejectAll,
  onFieldAccept,
  onFieldReject,
  dismissedFields = new Set(),
  isProcessing = false,
  processingStatus = 'idle'
}: BulkSuggestionsProps) {
  const [isLocalProcessing, setIsLocalProcessing] = useState(false)

  // Filter out dismissed and identical suggestions
  const activeSuggestions = suggestions.filter(
    s => !dismissedFields.has(s.fieldName) && s.currentValue !== s.suggestedValue
  )

  // Don't show suggestions if currently processing or if no active suggestions (unless we want to show status)
  if (isProcessing) {
    return null
  }

  // Handle different processing states
  const shouldShowComponent = (
    processingStatus === 'processing' ||
    processingStatus === 'failed' ||
    (processingStatus === 'completed' && activeSuggestions.length > 0) ||
    activeSuggestions.length > 0
  )

  if (!shouldShowComponent) {
    return null
  }

  const handleAcceptAll = async () => {
    setIsLocalProcessing(true)
    try {
      const acceptedSuggestions: Record<string, string | number> = {}
      activeSuggestions.forEach(s => {
        acceptedSuggestions[s.fieldName] = s.suggestedValue
      })
      await onAcceptAll(acceptedSuggestions)
    } finally {
      setIsLocalProcessing(false)
    }
  }

  const averageConfidence = activeSuggestions.reduce((sum, s) => sum + (s.confidence || 0), 0) / activeSuggestions.length

  // Helper functions for status display
  function getStatusTitle(status: 'idle' | 'processing' | 'completed' | 'failed'): string {
    switch (status) {
      case 'processing':
        return 'AI Analyzing...'
      case 'failed':
        return 'AI Processing Failed'
      case 'completed':
        return 'AI Processing Complete'
      case 'idle':
      default:
        return 'AI Processing Complete'
    }
  }

  function getStatusDescription(status: 'idle' | 'processing' | 'completed' | 'failed', suggestionsCount: number): string {
    switch (status) {
      case 'processing':
        return 'Analyzing document and extracting data...'
      case 'failed':
        return 'AI extraction failed. You can continue editing with existing data or try re-extracting again.'
      case 'completed':
        return `Found ${suggestionsCount} suggested improvements`
      case 'idle':
      default:
        return `Found ${suggestionsCount} suggested improvements`
    }
  }

  return (
    <Card className="bg-blue-900/20 border-blue-700 mb-6">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Brain className={`w-6 h-6 text-blue-400 ${processingStatus === 'processing' ? 'animate-spin' : ''}`} />
          <div>
            <h3 className="text-blue-300 font-semibold">
              {getStatusTitle(processingStatus)}
            </h3>
            <p className="text-blue-200 text-sm">
              {getStatusDescription(processingStatus, activeSuggestions.length)}
              {processingStatus === 'completed' && averageConfidence > 0 && (
                <span className="ml-2 text-xs">
                  Avg confidence: {Math.round(averageConfidence)}%
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Bulk Actions */}
        {processingStatus === 'completed' && (
          <div className="flex gap-3 mb-4">
            <Button
              onClick={handleAcceptAll}
              disabled={isLocalProcessing || isProcessing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isLocalProcessing ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2 animate-spin" />
                  Applying All...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Accept All ({activeSuggestions.length})
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={onRejectAll}
              disabled={isLocalProcessing || isProcessing}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              <X className="w-4 h-4 mr-2" />
              Keep All Current
            </Button>
          </div>
        )}

        {/* Failed Status Action */}
        {processingStatus === 'failed' && (
          <div className="flex gap-3 mb-4">
            <Button
              onClick={() => {
                // This will be connected to reprocess functionality
                console.log('User wants to retry AI extraction after failure')
                // The parent component should handle this
              }}
              disabled={isProcessing}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Brain className="w-4 h-4 mr-2" />
              Try AI Extract Again
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                // Continue with current data - dismiss the failed status
                onRejectAll()
              }}
              disabled={isProcessing}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Continue with Current Data
            </Button>
          </div>
        )}

        {/* Individual Suggestions */}
        {processingStatus === 'completed' && (
          <div className="space-y-3">
            {activeSuggestions.map((suggestion) => (
              <FieldSuggestion
                key={suggestion.fieldName}
                fieldName={suggestion.fieldName}
                currentValue={suggestion.currentValue}
                suggestedValue={suggestion.suggestedValue}
                fieldLabel={suggestion.fieldLabel}
                confidence={suggestion.confidence}
                onAccept={(value) => onFieldAccept(suggestion.fieldName, value)}
                onReject={() => onFieldReject(suggestion.fieldName)}
                suggestionReason={suggestion.suggestionReason}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}