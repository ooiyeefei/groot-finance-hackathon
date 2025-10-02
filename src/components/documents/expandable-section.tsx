'use client'

import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface CompletionStatus {
  completed: number
  total: number
  percentage: number
}

interface ExpandableSectionProps {
  title: string
  importance: 'critical' | 'important' | 'optional'
  isExpanded: boolean
  onToggle: () => void
  completion: CompletionStatus
  children: React.ReactNode
}

export default function ExpandableSection({
  title,
  importance,
  isExpanded,
  onToggle,
  completion,
  children
}: ExpandableSectionProps) {
  // Get importance styling
  const getImportanceStyles = () => {
    switch (importance) {
      case 'critical':
        return {
          border: 'border-red-500/30 hover:border-red-500/50',
          background: 'bg-red-900/10 hover:bg-red-900/20',
          accent: 'border-l-red-500',
          icon: 'text-red-400'
        }
      case 'important':
        return {
          border: 'border-amber-500/30 hover:border-amber-500/50',
          background: 'bg-amber-900/10 hover:bg-amber-900/20',
          accent: 'border-l-amber-500',
          icon: 'text-amber-400'
        }
      case 'optional':
        return {
          border: 'border-gray-500/30 hover:border-gray-500/50',
          background: 'bg-gray-700/10 hover:bg-gray-700/20',
          accent: 'border-l-gray-500',
          icon: 'text-gray-400'
        }
    }
  }

  // Get completion status icon and color
  const getCompletionStatus = () => {
    if (completion.percentage === 100) {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-400',
        text: 'Complete'
      }
    } else if (completion.percentage > 0) {
      return {
        icon: <Clock className="w-4 h-4" />,
        color: 'text-amber-400',
        text: 'Partial'
      }
    } else {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-400',
        text: 'Empty'
      }
    }
  }

  const styles = getImportanceStyles()
  const status = getCompletionStatus()

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.background} transition-all duration-200`}>
      {/* Section Header */}
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between text-left border-l-4 ${styles.accent} hover:bg-gray-800/50 transition-colors rounded-lg`}
      >
        <div className="flex items-center space-x-3">
          {/* Expand/Collapse Icon */}
          <div className="text-gray-400">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </div>

          {/* Section Title */}
          <h3 className="text-sm font-medium text-white">{title}</h3>

          {/* Importance Indicator */}
          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
            importance === 'critical'
              ? 'bg-red-900/20 text-red-400 border-red-700'
              : importance === 'important'
              ? 'bg-amber-900/20 text-amber-400 border-amber-700'
              : 'bg-gray-700/20 text-gray-400 border-gray-600'
          }`}>
            {importance}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Completion Progress */}
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1 ${status.color}`}>
              {status.icon}
              <span className="text-xs font-medium">{status.text}</span>
            </div>

            <div className="text-xs text-gray-400">
              {completion.completed}/{completion.total}
            </div>

            {/* Progress Bar */}
            <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  completion.percentage === 100
                    ? 'bg-green-500'
                    : completion.percentage > 0
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${completion.percentage}%` }}
              />
            </div>

            <span className="text-xs text-gray-400 min-w-[2.5rem] text-right">
              {completion.percentage}%
            </span>
          </div>
        </div>
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-l-4 border-l-transparent ml-4">
          <div className="pl-2">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}