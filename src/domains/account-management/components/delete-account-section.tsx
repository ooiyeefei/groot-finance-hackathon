'use client'

/**
 * Delete Account Section
 *
 * "Danger Zone" section displayed at the bottom of Settings > Profile.
 * Provides account deletion with:
 * - Pre-flight eligibility check
 * - Sole owner blocking with business list
 * - Confirmation dialog requiring "DELETE" text input
 * - Loading state during deletion
 * - Redirect to sign-in on success
 */

import { useState } from 'react'
import { AlertTriangle, Download, Loader2, X } from 'lucide-react'

interface BlockedBusiness {
  id: string
  name: string
  memberCount: number
}

interface DeletionCheckResult {
  canDelete: boolean
  blockedBusinesses: BlockedBusiness[]
  hasActiveSubscription: boolean
  pendingItemsCount: number
}

export default function DeleteAccountSection() {
  const [isChecking, setIsChecking] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showBlockedDialog, setShowBlockedDialog] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [checkResult, setCheckResult] = useState<DeletionCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteClick = async () => {
    setError(null)
    setIsChecking(true)

    try {
      const response = await fetch('/api/v1/users/account/deletion-check')
      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to check deletion eligibility')
        return
      }

      setCheckResult(result.data)

      if (!result.data.canDelete) {
        setShowBlockedDialog(true)
      } else {
        setShowConfirmDialog(true)
      }
    } catch {
      setError('Failed to check deletion eligibility. Please try again.')
    } finally {
      setIsChecking(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (confirmText !== 'DELETE') return

    setError(null)
    setIsDeleting(true)

    try {
      const response = await fetch('/api/v1/users/account/delete', {
        method: 'POST',
      })
      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Account deletion failed')
        setIsDeleting(false)
        return
      }

      // Redirect to sign-in page after successful deletion
      window.location.href = '/sign-in'
    } catch {
      setError('Account deletion failed. Please try again.')
      setIsDeleting(false)
    }
  }

  const closeDialogs = () => {
    setShowConfirmDialog(false)
    setShowBlockedDialog(false)
    setConfirmText('')
    setError(null)
  }

  return (
    <>
      {/* Danger Zone Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
        </div>

        <div className="p-4 border border-destructive/30 rounded-lg bg-destructive/5">
          <p className="text-sm text-foreground font-medium mb-2">Delete your account</p>
          <p className="text-xs text-muted-foreground mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
            Your personal data will be removed, financial records will show &quot;Deleted User&quot;,
            and you will lose access to all businesses.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <button
            onClick={handleDeleteClick}
            disabled={isChecking || isDeleting}
            className="px-4 py-2 text-sm font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking...
              </span>
            ) : (
              'Delete Account'
            )}
          </button>
        </div>
      </div>

      {/* Blocked Dialog — sole owner with team members */}
      {showBlockedDialog && checkResult && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeDialogs() }}
        >
          <div className="bg-card rounded-lg border border-border w-full max-w-md m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Cannot Delete Account</h3>
              <button onClick={closeDialogs} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              You are the sole owner of the following businesses with other members.
              Transfer ownership or remove all members before deleting your account.
            </p>

            <div className="space-y-2 mb-6">
              {checkResult.blockedBusinesses.map((biz) => (
                <div key={biz.id} className="p-3 bg-muted/50 border border-border rounded-md">
                  <p className="text-sm font-medium text-foreground">{biz.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {biz.memberCount} member{biz.memberCount !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={closeDialogs}
              className="w-full px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) closeDialogs() }}
        >
          <div className="bg-card rounded-lg border border-border w-full max-w-md m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-destructive">Delete Account</h3>
              {!isDeleting && (
                <button onClick={closeDialogs} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-foreground font-medium">This will permanently:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Delete your personal data (conversations, notifications)</li>
                <li>Anonymize financial records to &quot;Deleted User&quot;</li>
                <li>Remove you from all businesses</li>
                <li>Cancel pending expense claims and leave requests</li>
                {checkResult?.hasActiveSubscription && (
                  <li className="text-destructive font-medium">Cancel your active subscription</li>
                )}
              </ul>

              {checkResult?.pendingItemsCount ? (
                <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-2">
                  You have {checkResult.pendingItemsCount} pending item{checkResult.pendingItemsCount !== 1 ? 's' : ''} that
                  will be automatically cancelled.
                </p>
              ) : null}
            </div>

            {/* Data archive notice */}
            <div className="mb-4 p-3 bg-muted/50 border border-border rounded-md">
              <div className="flex items-start gap-2">
                <Download className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-foreground font-medium">Your data will be archived</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A copy of your data will be saved and your business owner(s) will receive
                    a download link that expires after 7 days. You can also download your data
                    now from the <strong>Download My Data</strong> section above.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Type <span className="font-bold text-destructive">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isDeleting}
                placeholder="Type DELETE"
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-destructive disabled:opacity-50"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeDialogs}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={confirmText !== 'DELETE' || isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  'Delete My Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
