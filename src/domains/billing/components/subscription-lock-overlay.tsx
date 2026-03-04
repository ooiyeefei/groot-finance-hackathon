'use client'

/**
 * SubscriptionLockOverlay
 *
 * Blur overlay over the main content area when subscription access is revoked.
 *
 * The sidebar remains accessible (z-[45] > overlay z-40) so users can:
 * - Switch to another business that may still be active
 * - Navigate to pricing/billing pages
 *
 * Triggered by: subscription.status in ['paused', 'canceled', 'unpaid']
 */

import { useSubscription } from '../hooks/use-subscription'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Lock, Zap, Shield, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isNativePlatform } from '@/lib/capacitor/platform'

// Pages that should NOT be blocked (user needs to reach these to upgrade)
const UNBLOCKED_PATHS = [
  '/pricing',
  '/settings/billing',
  '/settings',
  '/api/',
  '/sign-in',
  '/sign-out',
  '/onboarding',
]

// Statuses that trigger the lock overlay
const LOCKED_STATUSES = new Set(['paused', 'canceled', 'unpaid'])

// Status-specific messaging
function getLockContent(status: string) {
  switch (status) {
    case 'canceled':
      return {
        title: 'Subscription Ended',
        message: 'Your subscription has been canceled. Choose a plan to restore access to Groot Finance. Your data is safe and waiting for you.',
      }
    case 'unpaid':
      return {
        title: 'Payment Required',
        message: 'Your subscription payment is overdue. Please update your payment method or choose a plan to continue.',
      }
    case 'paused':
    default:
      return {
        title: 'Free Trial Ended',
        message: 'Your 14-day Pro trial has ended. Choose a plan to continue using Groot Finance. Your data is safe and waiting for you.',
      }
  }
}

export function SubscriptionLockOverlay() {
  const { data, isLoading } = useSubscription()
  const { signOut } = useClerk()
  const pathname = usePathname()

  // Don't block while loading or if no data yet
  if (isLoading || !data) return null

  // Block when subscription is in a locked state
  if (!LOCKED_STATUSES.has(data.subscription.status)) return null

  // Don't block pricing/billing/settings pages — user needs those to upgrade
  const isUnblockedPath = UNBLOCKED_PATHS.some(path => pathname?.includes(path))
  if (isUnblockedPath) return null

  const { title, message } = getLockContent(data.subscription.status)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop with heavy blur — sidebar (z-[45]) and Radix portals (z-50) sit above this */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Lock card */}
      <Card className="relative z-40 w-full max-w-md bg-card border-border shadow-2xl">
        <CardContent className="p-8 text-center">
          {/* Lock icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            {title}
          </h2>

          <p className="text-muted-foreground mb-6">
            {message}
          </p>

          {/* CTA buttons */}
          <div className="space-y-3">
            {!isNativePlatform() && (
              <Link href="/en/pricing" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" size="lg">
                  <Zap className="w-5 h-5 mr-2" />
                  Choose a Plan
                </Button>
              </Link>
            )}

            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span>{isNativePlatform() ? 'Your data is preserved. Please visit finance.hellogroot.com to manage your subscription.' : 'Your data is preserved. Pick up right where you left off.'}</span>
            </div>

            <button
              onClick={() => signOut({ redirectUrl: '/' })}
              className="flex items-center gap-2 justify-center w-full text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
