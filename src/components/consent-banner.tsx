'use client'

import { useState } from 'react'
import { useConsent } from '@/domains/compliance/hooks/use-consent'
import { Shield } from 'lucide-react'

const CURRENT_POLICY_VERSION = process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION || '2026-03-03'

export function ConsentBanner() {
  const { hasConsent, isLoading } = useConsent()
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading || hasConsent) return null

  async function handleAccept() {
    setIsAccepting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/consent/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyType: 'privacy_policy',
          policyVersion: CURRENT_POLICY_VERSION,
          source: 'banner',
        }),
      })
      if (!res.ok) {
        throw new Error('Failed to record consent')
      }
      // Convex real-time subscription will automatically update useConsent()
    } catch {
      setError('Something went wrong. Please try again.')
      setIsAccepting(false)
    }
  }

  return (
    <div className="sticky top-0 z-30 w-full border-b border-primary/20 bg-primary/5 px-4 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            We&apos;ve updated our{' '}
            <a
              href="https://hellogroot.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Privacy Policy
            </a>
            . Please review and accept to continue using Groot Finance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <button
            onClick={handleAccept}
            disabled={isAccepting}
            className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isAccepting ? 'Accepting...' : 'Review & Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
