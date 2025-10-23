import React from 'react'
import { AlertCircle, Lightbulb } from 'lucide-react'

/**
 * ErrorMessageCard Component
 *
 * A semantic, reusable error message component following badge color standards.
 * Matches the badge-error-status styling for consistent error messaging across the app.
 *
 * Light Mode: Very light red/pink background (bg-red-50) with dark red text (text-red-800)
 * Dark Mode: Translucent dark red background (bg-red-900/20) with light red text (text-red-300)
 *
 * @example
 * <ErrorMessageCard
 *   message="This document does not appear to be an invoice."
 *   suggestions={[
 *     "Ensure the document is a valid vendor invoice",
 *     "Check that the document image is clear and readable"
 *   ]}
 * />
 */

interface ErrorMessageCardProps {
  /** Main error message to display */
  message: string

  /** Optional array of helpful suggestions */
  suggestions?: string[]

  /** Optional custom icon (defaults to AlertCircle) */
  icon?: React.ReactNode

  /** Optional className for additional styling */
  className?: string
}

export function ErrorMessageCard({
  message,
  suggestions,
  icon,
  className = ''
}: ErrorMessageCardProps) {
  return (
    <div className={`mt-4 pt-4 border-t border-border ${className}`}>
      <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg">
        {/* Error Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {icon || <AlertCircle className="w-5 h-5 text-red-800 dark:text-red-300" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Error Message */}
          <p className="text-red-800 dark:text-red-300 text-sm leading-relaxed">
            {message}
          </p>

          {/* Suggestions Section */}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700/30">
              <p className="text-red-800 dark:text-red-300 text-sm font-medium mb-2 flex items-center">
                <Lightbulb className="w-4 h-4 mr-1.5" />
                Suggestions:
              </p>
              <ul className="text-red-800 dark:text-red-300 text-sm space-y-1.5 ml-4">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="list-disc">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ErrorMessageCard
