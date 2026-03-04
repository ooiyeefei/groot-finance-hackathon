'use client'

import { useState, lazy, Suspense } from 'react'
import { useConsent, useConsentHistory } from '@/domains/compliance/hooks/use-consent'
import { Download, History, ShieldOff, Shield, ExternalLink, Loader2 } from 'lucide-react'
import DeleteAccountSection from '@/domains/account-management/components/delete-account-section'

const DownloadMyData = lazy(() => import('@/domains/account-management/components/download-my-data'))

const CURRENT_POLICY_VERSION = process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION || '2026-03-03'

export function PrivacyDataSection() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <Download className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Download My Data</h3>
            <p className="text-sm text-muted-foreground">
              Export all your personal and business data as a ZIP of CSV spreadsheets.
            </p>
          </div>
        </div>
        <Suspense fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        }>
          <DownloadMyData />
        </Suspense>
      </div>
      <ConsentHistoryCard />
      <RevokeConsentCard />

      {/* Delete Account - Danger Zone */}
      <div className="rounded-lg border border-destructive/30 bg-card p-6">
        <DeleteAccountSection />
      </div>
    </div>
  )
}

function ConsentHistoryCard() {
  const { records, isLoading } = useConsentHistory()

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <History className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Consent History</h3>
          <p className="text-sm text-muted-foreground">
            Record of all consent actions for your account.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consent records found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-foreground">Policy</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Version</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Accepted</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Source</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground capitalize">
                    {record.policyType.replace('_', ' ')}
                  </td>
                  <td className="px-3 py-2 text-foreground">{record.policyVersion}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(record.acceptedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{record.source}</td>
                  <td className="px-3 py-2">
                    {record.revokedAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                        Revoked {new Date(record.revokedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RevokeConsentCard() {
  const { hasConsent } = useConsent()
  const [showDialog, setShowDialog] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!hasConsent) return null

  async function handleRevoke() {
    setIsRevoking(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/consent/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyType: 'privacy_policy',
          policyVersion: CURRENT_POLICY_VERSION,
        }),
      })
      if (!res.ok) throw new Error('Revocation failed')
      // Convex real-time will trigger blocking overlay automatically
    } catch {
      setError('Failed to revoke consent. Please try again.')
      setIsRevoking(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <ShieldOff className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Revoke Consent</h3>
          <p className="text-sm text-muted-foreground">
            Withdraw your consent to our Privacy Policy. This will immediately block your access.
          </p>
        </div>
      </div>

      {!showDialog ? (
        <button
          onClick={() => setShowDialog(true)}
          className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          <ShieldOff className="h-4 w-4" />
          Revoke Consent
        </button>
      ) : (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h4 className="mb-2 font-semibold text-foreground">Are you sure?</h4>
          <p className="mb-3 text-sm text-muted-foreground">
            Revoking consent will <strong className="text-foreground">immediately block your access</strong> to Groot Finance until you re-consent.
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            <a href="#download-my-data" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Download className="h-3.5 w-3.5" />
              Download your data first
            </a>{' '}
            before revoking.
          </p>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setShowDialog(false)}
              className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              onClick={handleRevoke}
              disabled={isRevoking}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {isRevoking ? 'Revoking...' : 'Confirm Revoke'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
