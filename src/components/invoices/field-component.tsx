'use client'

import { Calendar, DollarSign, Hash, Type, CheckSquare, AlertTriangle } from 'lucide-react'
import { DocumentField } from '@/hooks/useDocumentSchema'

interface FieldComponentProps {
  field: DocumentField
  value: any
  onHover?: (fieldKey: string | null) => void
  sectionKey: string
}

export default function FieldComponent({
  field,
  value,
  onHover,
  sectionKey
}: FieldComponentProps) {
  const hasValue = value !== undefined && value !== null && value !== ''

  // Get field type icon
  const getFieldIcon = () => {
    switch (field.dataType) {
      case 'date':
        return <Calendar className="w-4 h-4" />
      case 'currency':
      case 'number':
        return field.dataType === 'currency' ? <DollarSign className="w-4 h-4" /> : <Hash className="w-4 h-4" />
      case 'boolean':
        return <CheckSquare className="w-4 h-4" />
      case 'text':
      default:
        return <Type className="w-4 h-4" />
    }
  }

  // Format value based on data type
  const formatValue = () => {
    if (!hasValue) return null

    switch (field.dataType) {
      case 'currency':
        // Handle currency values
        if (typeof value === 'number') {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'MYR' // Default to MYR for Malaysian documents
          }).format(value)
        } else if (typeof value === 'string') {
          // Try to extract numeric value from string
          const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''))
          if (!isNaN(numericValue)) {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'MYR'
            }).format(numericValue)
          }
          return value // Return as-is if can't parse
        }
        break

      case 'date':
        // Handle date values with consistent formatting to avoid hydration mismatch
        if (typeof value === 'string') {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            // Use consistent ISO formatting to avoid locale-based hydration issues
            return date.toISOString().split('T')[0] // Returns YYYY-MM-DD format
          }
        }
        return value

      case 'number':
        // Handle numeric values with consistent formatting
        if (typeof value === 'number') {
          return value.toString() // Use simple toString to avoid locale issues
        } else if (typeof value === 'string') {
          const numericValue = parseFloat(value)
          if (!isNaN(numericValue)) {
            return numericValue.toString()
          }
        }
        return value

      case 'boolean':
        // Handle boolean values
        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No'
        } else if (typeof value === 'string') {
          const lowerValue = value.toLowerCase()
          if (['true', 'yes', '1', 'on'].includes(lowerValue)) return 'Yes'
          if (['false', 'no', '0', 'off'].includes(lowerValue)) return 'No'
        }
        return value

      case 'text':
      default:
        // Handle arrays (like line items)
        if (Array.isArray(value)) {
          return `${value.length} items`
        }

        // Handle objects
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2)
        }

        return String(value)
    }

    return value
  }

  // Get importance styling
  const getImportanceStyles = () => {
    switch (field.importance) {
      case 'critical':
        return {
          border: hasValue ? 'border-red-500/50' : 'border-red-700/30',
          background: hasValue ? 'bg-red-900/10' : 'bg-red-900/5',
          accent: 'border-l-red-500'
        }
      case 'important':
        return {
          border: hasValue ? 'border-amber-500/50' : 'border-amber-700/30',
          background: hasValue ? 'bg-amber-900/10' : 'bg-amber-900/5',
          accent: 'border-l-amber-500'
        }
      case 'optional':
        return {
          border: hasValue ? 'border-gray-500/50' : 'border-gray-700/30',
          background: hasValue ? 'bg-gray-700/10' : 'bg-gray-700/5',
          accent: 'border-l-gray-500'
        }
    }
  }

  // Generate entity key for hover functionality
  const entityKey = `${sectionKey}_${field.key}`

  const styles = getImportanceStyles()
  const formattedValue = formatValue()
  const icon = getFieldIcon()

  return (
    <div
      className={`rounded-lg border ${styles.border} ${styles.background} p-3 cursor-pointer hover:bg-gray-800/30 transition-all duration-200 border-l-4 ${styles.accent}`}
      onMouseEnter={() => onHover?.(entityKey)}
      onMouseLeave={() => onHover?.(null)}
      title={field.bboxSupported ? 'Click to highlight in document' : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Field Label */}
          <div className="flex items-center space-x-2 mb-1">
            <div className={`${
              hasValue ? 'text-blue-400' : 'text-gray-500'
            }`}>
              {icon}
            </div>
            <div className="text-xs text-gray-400 font-medium">
              {field.label}
            </div>
            {field.importance === 'critical' && (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            )}
          </div>

          {/* Field Value */}
          <div className="mt-2">
            {hasValue ? (
              <div className="text-sm text-white font-medium break-words">
                {field.dataType === 'text' && Array.isArray(value) ? (
                  // Special handling for arrays (like line items)
                  <div className="space-y-1">
                    <div className="text-blue-400">{formattedValue}</div>
                    <details className="text-xs text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-300">View details</summary>
                      <pre className="mt-1 whitespace-pre-wrap text-xs bg-gray-800/50 p-2 rounded">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : typeof value === 'object' && value !== null ? (
                  // Special handling for nested objects
                  <details className="text-xs">
                    <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
                      View object data
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-300 bg-gray-800/50 p-2 rounded max-h-32 overflow-y-auto">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className={
                    field.dataType === 'currency' ? 'text-green-400' :
                    field.dataType === 'date' ? 'text-blue-400' :
                    field.dataType === 'number' ? 'text-yellow-400' :
                    'text-white'
                  }>
                    {formattedValue}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">
                Not extracted
              </div>
            )}
          </div>
        </div>

        {/* Field Status Indicators */}
        <div className="flex flex-col items-end space-y-1">
          {/* Bbox Support Indicator */}
          {field.bboxSupported && (
            <div className="w-2 h-2 bg-blue-500 rounded-full" title="Supports bounding box highlighting" />
          )}

          {/* Extraction Status */}
          <div className={`w-2 h-2 rounded-full ${
            hasValue ? 'bg-green-500' : 'bg-gray-600'
          }`} title={hasValue ? 'Data extracted' : 'No data found'} />
        </div>
      </div>

      {/* Confidence Score (if available) */}
      {field.key === 'confidence_score' && typeof value === 'number' && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">AI Confidence</span>
            <span className={`font-medium ${
              value >= 0.8 ? 'text-green-400' :
              value >= 0.6 ? 'text-amber-400' :
              'text-red-400'
            }`}>
              {Math.round(value * 100)}%
            </span>
          </div>
          <div className="mt-1 w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                value >= 0.8 ? 'bg-green-500' :
                value >= 0.6 ? 'bg-amber-500' :
                'bg-red-500'
              }`}
              style={{ width: `${value * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}