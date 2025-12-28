'use client'

/**
 * UpgradeBanner Component
 *
 * Prominent banner shown on dashboard for free plan users.
 * Encourages upgrade with feature highlights and CTA.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSubscription } from '../hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { X, Zap, FileText, TrendingUp, Shield } from 'lucide-react'

export function UpgradeBanner() {
  const { data, isLoading } = useSubscription()
  const [isDismissed, setIsDismissed] = useState(false)

  // Check if banner was dismissed this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('upgrade-banner-dismissed')
    if (dismissed === 'true') {
      setIsDismissed(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    sessionStorage.setItem('upgrade-banner-dismissed', 'true')
  }

  // Don't show while loading
  if (isLoading) return null

  // Don't show if dismissed or not on free plan
  if (isDismissed || !data || data.plan.name !== 'free') return null

  const features = [
    { icon: FileText, text: '100 OCR scans/month' },
    { icon: TrendingUp, text: 'Advanced reports' },
    { icon: Shield, text: 'Priority support' },
  ]

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-purple-500/10 border border-primary/20">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Unlock Pro Features</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              You're on the Free plan with limited features. Upgrade to Pro for full access.
            </p>

            {/* Feature highlights */}
            <div className="flex flex-wrap gap-3">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 text-xs text-foreground bg-background/50 rounded-full px-2.5 py-1 border border-border"
                >
                  <feature.icon className="w-3 h-3 text-primary" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0">
            <Link href="/en/pricing">
              <Button className="w-full sm:w-auto">
                <Zap className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
