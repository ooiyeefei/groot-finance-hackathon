'use client'

/**
 * SubscriptionLockOverlay
 *
 * Blur overlay over the main content area when subscription is paused
 * (trial expired without payment method). Prompts user to choose a plan.
 *
 * The sidebar remains accessible (z-[55] > overlay z-50) so users can:
 * - Switch to another business that may still be active
 * - Navigate to pricing/billing pages
 *
 * Triggered by: subscription.status === 'paused'
 */

import { useSubscription } from '../hooks/use-subscription'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Lock, Zap, Shield, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export function SubscriptionLockOverlay() {
  const { data, isLoading } = useSubscription()
  const { signOut } = useClerk()
  const pathname = usePathname()

  // Don't block while loading or if no data yet
  if (isLoading || !data) return null

  // Only block when subscription is paused (trial expired without payment)
  if (data.subscription.status !== 'paused') return null

  // Don't block pricing/billing/settings pages — user needs those to upgrade
  const isUnblockedPath = UNBLOCKED_PATHS.some(path => pathname?.includes(path))
  if (isUnblockedPath) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with heavy blur — sidebar sits above this (z-[55]) */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Lock card */}
      <Card className="relative z-50 w-full max-w-md bg-card border-border shadow-2xl">
        <CardContent className="p-8 text-center">
          {/* Lock icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            Free Trial Ended
          </h2>

          <p className="text-muted-foreground mb-6">
            Your 14-day Pro trial has ended. Choose a plan to continue using Groot Finance.
            Your data is safe and waiting for you.
          </p>

          {/* CTA buttons */}
          <div className="space-y-3">
            <Link href="/en/pricing" className="block">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" size="lg">
                <Zap className="w-5 h-5 mr-2" />
                Choose a Plan
              </Button>
            </Link>

            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span>Your data is preserved. Pick up right where you left off.</span>
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
