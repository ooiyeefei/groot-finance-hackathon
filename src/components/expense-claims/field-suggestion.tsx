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
    <Card className="bg-blue-900/20 border-blue-700 mt-2">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Brain className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-blue-300 font-medium text-sm">AI Suggestion for {fieldLabel}</span>
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
                <span className="text-gray-400 block mb-1">Current:</span>
                <div className="bg-gray-600 p-2 rounded border border-gray-500">
                  <span className="text-white">
                    {currentValue || <span className="text-gray-400 italic">Empty</span>}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-blue-400" />
              </div>

              <div>
                <span className="text-blue-300 block mb-1">AI Suggests:</span>
                <div className="bg-blue-900/30 p-2 rounded border border-blue-600">
                  <span className="text-blue-100 font-medium">{suggestedValue}</span>
                </div>
              </div>
            </div>

            {/* Suggestion Reason */}
            {suggestionReason && (
              <div className="text-xs text-blue-300 bg-blue-900/20 p-2 rounded">
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
                className="bg-green-600 hover:bg-green-700 text-white"
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
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
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
}

export function BulkSuggestions({
  suggestions,
  onAcceptAll,
  onRejectAll,
  onFieldAccept,
  onFieldReject,
  dismissedFields = new Set()
}: BulkSuggestionsProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  // Filter out dismissed and identical suggestions
  const activeSuggestions = suggestions.filter(
    s => !dismissedFields.has(s.fieldName) && s.currentValue !== s.suggestedValue
  )

  if (activeSuggestions.length === 0) {
    return null
  }

  const handleAcceptAll = async () => {
    setIsProcessing(true)
    try {
      const acceptedSuggestions: Record<string, string | number> = {}
      activeSuggestions.forEach(s => {
        acceptedSuggestions[s.fieldName] = s.suggestedValue
      })
      await onAcceptAll(acceptedSuggestions)
    } finally {
      setIsProcessing(false)
    }
  }

  const averageConfidence = activeSuggestions.reduce((sum, s) => sum + (s.confidence || 0), 0) / activeSuggestions.length

  return (
    <Card className="bg-blue-900/20 border-blue-700 mb-6">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-6 h-6 text-blue-400" />
          <div>
            <h3 className="text-blue-300 font-semibold">AI Processing Complete</h3>
            <p className="text-blue-200 text-sm">
              Found {activeSuggestions.length} suggested improvements
              {averageConfidence > 0 && (
                <span className="ml-2 text-xs">
                  Avg confidence: {Math.round(averageConfidence)}%
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-3 mb-4">
          <Button
            onClick={handleAcceptAll}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isProcessing ? (
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
            disabled={isProcessing}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            <X className="w-4 h-4 mr-2" />
            Keep All Current
          </Button>
        </div>

        {/* Individual Suggestions */}
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
      </CardContent>
    </Card>
  )
}