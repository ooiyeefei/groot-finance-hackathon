'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { useConsent } from '@/domains/compliance/hooks/use-consent'
import { Shield, LogOut } from 'lucide-react'

const GRACE_PERIOD_START = process.env.NEXT_PUBLIC_CONSENT_GRACE_PERIOD_START || process.env.CONSENT_GRACE_PERIOD_START
const GRACE_DAYS = 30
const CURRENT_POLICY_VERSION = process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION || '2026-03-03'

const UNBLOCKED_PATHS = [
  '/business-settings',
  '/settings',
  '/sign-out',
  '/api/',
  '/sign-in',
  '/onboarding',
]

function isGracePeriodExpired(): boolean {
  if (!GRACE_PERIOD_START) return false
  const start = new Date(GRACE_PERIOD_START).getTime()
  if (isNaN(start)) return false
  const end = start + GRACE_DAYS * 24 * 60 * 60 * 1000
  return Date.now() > end
}

export function ConsentLockOverlay() {
  const { hasConsent, isLoading } = useConsent()
  const pathname = usePathname()
  const { signOut } = useClerk()
  const [isAccepting, setIsAccepting] = useState(false)

  // Don't block while loading
  if (isLoading) return null

  // Don't block if user has consented
  if (hasConsent) return null

  // Don't block if grace period hasn't expired yet (banner handles it)
  if (!isGracePeriodExpired()) return null

  // Don't block on whitelisted paths
  const isUnblockedPath = UNBLOCKED_PATHS.some((path) => pathname?.includes(path))
  if (isUnblockedPath) return null

  async function handleAccept() {
    setIsAccepting(true)
    try {
      await fetch('/api/v1/consent/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyType: 'privacy_policy',
          policyVersion: CURRENT_POLICY_VERSION,
          source: 'banner',
        }),
      })
    } catch {
      setIsAccepting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      <div className="relative z-40 w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Shield className="h-8 w-8 text-primary" />
        </div>

        <h2 className="mb-2 text-2xl font-bold text-foreground">
          Consent Required
        </h2>

        <p className="mb-6 text-muted-foreground">
          Please review and accept our{' '}
          <a
            href="https://hellogroot.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Privacy Policy
          </a>{' '}
          to continue using Groot Finance.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={isAccepting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Shield className="h-4 w-4" />
            {isAccepting ? 'Accepting...' : 'Accept Privacy Policy'}
          </button>

          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="flex w-full items-center justify-center gap-2 pt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
