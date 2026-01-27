/**
 * Correct & Resubmit Button Component
 * Allows users to resubmit rejected expense claims with optional corrections
 * Only visible when claim status is 'rejected'
 */

'use client'

import { useState } from 'react'
import { RefreshCcw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CorrectResubmitButtonProps {
  claimId: string
  status: string
  rejectionReason?: string
  onResubmit?: (newClaimId: string) => void
  variant?: 'default' | 'sm' | 'icon'
  className?: string
}

interface ResubmitState {
  isOpen: boolean
  isSubmitting: boolean
  error: string | null
  success: boolean
  newClaimId: string | null
}

export default function CorrectResubmitButton({
  claimId,
  status,
  rejectionReason,
  onResubmit,
  variant = 'default',
  className = '',
}: CorrectResubmitButtonProps) {
  const [state, setState] = useState<ResubmitState>({
    isOpen: false,
    isSubmitting: false,
    error: null,
    success: false,
    newClaimId: null,
  })

  // Only show for rejected claims
  if (status !== 'rejected') {
    return null
  }

  const handleOpenDialog = () => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      error: null,
      success: false,
      newClaimId: null,
    }))
  }

  const handleCloseDialog = () => {
    if (state.isSubmitting) return // Prevent closing while submitting
    setState(prev => ({
      ...prev,
      isOpen: false,
      error: null,
    }))
  }

  const handleResubmit = async () => {
    setState(prev => ({ ...prev, isSubmitting: true, error: null }))

    try {
      const response = await fetch(`/api/v1/expense-claims/${claimId}/resubmit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Empty body - will copy all data from original claim
        body: JSON.stringify({}),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to resubmit expense claim')
      }

      setState(prev => ({
        ...prev,
        isSubmitting: false,
        success: true,
        newClaimId: result.data.newClaimId,
      }))

      // Notify parent component
      if (onResubmit && result.data.newClaimId) {
        onResubmit(result.data.newClaimId)
      }

    } catch (error) {
      console.error('[Resubmit] Error:', error)
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      }))
    }
  }

  const renderButton = () => {
    switch (variant) {
      case 'sm':
        return (
          <Button
            onClick={handleOpenDialog}
            variant="primary"
            size="sm"
            className={className}
          >
            <RefreshCcw className="w-4 h-4 mr-1.5" />
            Resubmit
          </Button>
        )
      case 'icon':
        return (
          <Button
            onClick={handleOpenDialog}
            variant="ghost"
            size="sm"
            className={className}
            title="Resubmit rejected claim"
          >
            <RefreshCcw className="w-4 h-4" />
          </Button>
        )
      default:
        return (
          <Button
            onClick={handleOpenDialog}
            variant="primary"
            className={className}
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Correct & Resubmit
          </Button>
        )
    }
  }

  return (
    <>
      {renderButton()}

      {/* Dialog Modal */}
      {state.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={handleCloseDialog}
          />

          {/* Dialog Content */}
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-lg border border-border">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <RefreshCcw className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">
                  Resubmit Rejected Claim
                </h3>
              </div>

              <p className="text-muted-foreground text-sm">
                Create a new draft expense claim based on this rejected claim.
                You can edit the new draft before submitting.
              </p>

              {/* Rejection Reason Display */}
              {rejectionReason && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        Rejection Reason
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                        {rejectionReason}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {state.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400">
                      {state.error}
                    </p>
                  </div>
                </div>
              )}

              {/* Success Display */}
              {state.success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        New Draft Created
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                        A new draft expense claim has been created. You can now edit it and resubmit for approval.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Information */}
              {!state.success && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-foreground font-medium">
                    What happens when you resubmit:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">1.</span>
                      A new draft claim will be created with all the original data
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">2.</span>
                      The receipt attachment will be copied to the new claim
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">3.</span>
                      You can edit the new draft to make corrections
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">4.</span>
                      Submit the corrected claim for approval
                    </li>
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                {state.success ? (
                  <Button
                    onClick={handleCloseDialog}
                    variant="default"
                    className="min-w-[120px]"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Done
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleCloseDialog}
                      variant="secondary"
                      disabled={state.isSubmitting}
                      className="min-w-[120px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleResubmit}
                      variant="default"
                      disabled={state.isSubmitting}
                      className="min-w-[120px]"
                    >
                      {state.isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="w-4 h-4 mr-2" />
                          Create Draft
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
