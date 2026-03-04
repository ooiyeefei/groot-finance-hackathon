'use client'

/**
 * UpgradePrompt Component
 *
 * Modal dialog shown when user attempts an action that requires plan upgrade.
 * Used for soft-blocking when OCR limits are reached.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Zap, Check, X } from 'lucide-react'
import { FALLBACK_PLANS, PlanKey } from '@/lib/stripe/plans'
import { isNativePlatform } from '@/lib/capacitor/platform'

interface UpgradePromptProps {
  isOpen: boolean
  onClose: () => void
  currentPlan?: PlanKey
  usageUsed?: number
  usageLimit?: number
  feature?: string
}

export function UpgradePrompt({
  isOpen,
  onClose,
  currentPlan = 'starter',
  usageUsed = 0,
  usageLimit = 100,
  feature = 'document scanning',
}: UpgradePromptProps) {
  const router = useRouter()

  const handleUpgrade = useCallback(() => {
    onClose()
    router.push('/en/pricing')
  }, [router, onClose])

  // Get recommended plan (next tier up)
  const getRecommendedPlan = (): PlanKey => {
    if (currentPlan === 'starter') return 'pro'
    if (currentPlan === 'pro') return 'enterprise'
    return 'pro'
  }

  if (!isOpen) return null

  const recommendedPlan = getRecommendedPlan()
  const recommendedPlanDetails = FALLBACK_PLANS[recommendedPlan]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-md border border-border">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-5">
          {/* Icon & Title */}
          <div className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              Usage Limit Reached
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              You've used all {usageLimit} {feature} credits for this month on the{' '}
              <Badge variant="outline" className="mx-1">
                {FALLBACK_PLANS[currentPlan].name}
              </Badge>{' '}
              plan.
            </p>
          </div>

          {/* Usage Stats */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Current Usage</span>
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                {usageUsed}/{usageLimit} scans
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>

          {/* Recommended Plan */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground">
                    Upgrade to {recommendedPlanDetails.name}
                  </h4>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">
                    Recommended
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {recommendedPlanDetails.currency} {recommendedPlanDetails.price}/month
                </p>
                <ul className="mt-3 space-y-2">
                  <li className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>
                      {recommendedPlanDetails.ocrLimit === -1
                        ? 'Unlimited'
                        : recommendedPlanDetails.ocrLimit}{' '}
                      OCR scans/month
                    </span>
                  </li>
                  {recommendedPlanDetails.features.slice(0, 2).map((feat, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={onClose}
              className="min-w-[100px] sm:min-w-[120px]"
            >
              Maybe Later
            </Button>
            {isNativePlatform() ? (
              <p className="text-sm text-muted-foreground text-center px-2">
                To upgrade, visit <span className="font-medium text-foreground">finance.hellogroot.com</span> in your browser.
              </p>
            ) : (
              <Button
                variant="default"
                onClick={handleUpgrade}
                className="min-w-[100px] sm:min-w-[120px]"
              >
                <Zap className="w-4 h-4 mr-2" />
                View Upgrade Options
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook to manage upgrade prompt state
 */
export function useUpgradePrompt() {
  const [isOpen, setIsOpen] = useState(false)
  const [promptData, setPromptData] = useState<{
    currentPlan?: PlanKey
    usageUsed?: number
    usageLimit?: number
    feature?: string
  }>({})

  const showPrompt = useCallback(
    (data?: typeof promptData) => {
      if (data) setPromptData(data)
      setIsOpen(true)
    },
    []
  )

  const hidePrompt = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    isOpen,
    setIsOpen,
    promptData,
    showPrompt,
    hidePrompt,
  }
}
