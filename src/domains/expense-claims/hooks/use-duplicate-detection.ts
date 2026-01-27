/**
 * Duplicate Detection Hook
 * Feature: 007-duplicate-expense-detection
 *
 * Checks for potential duplicate expense claims before submission.
 * Uses the check-duplicates API endpoint to find matching claims
 * within the business, including cross-user duplicates.
 */

import { useState, useCallback } from 'react'
import type {
  DuplicateDetectionResult,
  CheckDuplicatesRequest,
} from '../types/duplicate-detection'

interface UseDuplicateDetectionResult {
  /** Function to check for duplicate expense claims */
  checkDuplicates: (request: CheckDuplicatesRequest) => Promise<DuplicateDetectionResult | null>
  /** Whether a duplicate check is in progress */
  isChecking: boolean
  /** Error message if the last check failed */
  error: string | null
  /** Result from the last duplicate check */
  lastResult: DuplicateDetectionResult | null
  /** Clear the last result and error state */
  clearResult: () => void
}

/**
 * Hook for detecting duplicate expense claims before submission.
 *
 * @example
 * ```tsx
 * const { checkDuplicates, isChecking, lastResult } = useDuplicateDetection()
 *
 * const handleCheckDuplicates = async () => {
 *   const result = await checkDuplicates({
 *     vendorName: 'Starbucks',
 *     transactionDate: '2025-01-27',
 *     totalAmount: 25.50,
 *     currency: 'SGD',
 *   })
 *
 *   if (result?.hasDuplicates) {
 *     // Show duplicate warning modal
 *   }
 * }
 * ```
 */
export function useDuplicateDetection(): UseDuplicateDetectionResult {
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DuplicateDetectionResult | null>(null)

  const checkDuplicates = useCallback(
    async (request: CheckDuplicatesRequest): Promise<DuplicateDetectionResult | null> => {
      setIsChecking(true)
      setError(null)

      try {
        const response = await fetch('/api/v1/expense-claims/check-duplicates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || errorData.message || 'Failed to check for duplicates')
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Failed to check for duplicates')
        }

        const result = data.data as DuplicateDetectionResult
        setLastResult(result)
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error occurred'
        console.error('[useDuplicateDetection] Check failed:', message)
        setError(message)
        return null
      } finally {
        setIsChecking(false)
      }
    },
    []
  )

  const clearResult = useCallback(() => {
    setLastResult(null)
    setError(null)
  }, [])

  return {
    checkDuplicates,
    isChecking,
    error,
    lastResult,
    clearResult,
  }
}
