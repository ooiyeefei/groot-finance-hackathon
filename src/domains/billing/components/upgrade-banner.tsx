'use client'

/**
 * UpgradeBanner Component
 *
 * Prominent banner shown on dashboard for free plan users.
 * Encourages upgrade with feature highlights and CTA.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  useSubscription,
  calculateTotalTrialDays,
  calculateTrialDaysUsed,
  calculateTrialProgress,
} from '../hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { X, Zap, FileText, TrendingUp, Shield, Clock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

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

  // Don't show if dismissed or not on trial plan
  if (isDismissed || !data || data.plan.name !== 'trial') return null

  const features = [
    { icon: FileText, text: '100+ OCR scans/month' },
    { icon: TrendingUp, text: 'Advanced reports' },
    { icon: Shield, text: 'Priority support' },
  ]

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-purple-500/10 border border-primary/20">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-10"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="p-4 sm:p-5">
        {/* Header row with title, trial countdown, and View Plans button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Unlock Pro Features</h3>
            </div>

            {/* Trial countdown with progress bar - inline */}
            {data.trial?.isOnTrial && data.trial.daysRemaining !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className={cn(
                  "w-3.5 h-3.5",
                  data.trial.daysRemaining <= 3 ? "text-red-500" :
                  data.trial.daysRemaining <= 7 ? "text-yellow-500" :
                  "text-muted-foreground"
                )} />
                <span className={cn(
                  "font-medium",
                  data.trial.daysRemaining <= 3 ? "text-red-600 dark:text-red-400" :
                  data.trial.daysRemaining <= 7 ? "text-yellow-600 dark:text-yellow-400" :
                  "text-muted-foreground"
                )}>
                  {data.trial.trialExpired ? 'Trial expired' : `${data.trial.daysRemaining} days left`}
                </span>
                {/* Inline progress bar - shows days past (filled = used) */}
                {!data.trial.trialExpired && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex-1 min-w-[200px] max-w-[600px] h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer">
                          <div
                            className="h-full rounded-full transition-all bg-primary"
                            style={{ width: `${calculateTrialProgress(data.trial)}%` }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">Day {calculateTrialDaysUsed(data.trial)}/{calculateTotalTrialDays(data.trial)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>

          {/* CTA Button - mr-6 to avoid overlap with dismiss X button */}
          <Link href="/en/pricing" className="flex-shrink-0 mr-6">
            <Button size="sm" className="w-full sm:w-auto">
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              View Plans
            </Button>
          </Link>
        </div>

        {/* Description and features */}
        <p className="text-sm text-muted-foreground mb-3">
          Your trial includes full features. Subscribe to a plan before it expires.
        </p>

        {/* Feature highlights */}
        <div className="flex flex-wrap gap-2">
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
    </div>
  )
}
