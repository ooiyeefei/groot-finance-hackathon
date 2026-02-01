'use client'

/**
 * PricingTable Component
 *
 * Displays subscription plans with features and checkout actions.
 * Highlights current plan and handles upgrade flows.
 *
 * Supports two modes:
 * - Connected mode (default): Uses useSubscription hook, shows current plan
 * - Standalone mode: Direct checkout without hook, for onboarding flow
 */

import { useState } from 'react'
import { Check, Loader2, Users, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FALLBACK_PLANS, PlanKey, type PlanConfig } from '@/lib/stripe/plans'
import { useSubscription } from '../hooks/use-subscription'
import { cn } from '@/lib/utils'

interface PricingTableProps {
  /** Show current plan badge (requires connected mode) */
  showCurrentPlan?: boolean
  /** Hide Enterprise plan (for onboarding) */
  hideEnterprise?: boolean
  /** Standalone mode - direct checkout without useSubscription hook */
  standalone?: boolean
  /** Custom checkout handler (for standalone mode) */
  onCheckout?: (planName: PlanKey) => Promise<void>
  /** Show plan limits prominently (team members, OCR scans) */
  showLimits?: boolean
  className?: string
}

export function PricingTable({
  showCurrentPlan = true,
  hideEnterprise = false,
  standalone = false,
  onCheckout,
  showLimits = false,
  className,
}: PricingTableProps) {
  // Only use subscription hook in connected mode
  const subscription = standalone ? null : useSubscription()
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null)
  const [standaloneLoading, setStandaloneLoading] = useState(false)

  const currentPlanName = subscription?.data?.plan.name || 'trial'
  const isCheckoutLoading = standalone ? standaloneLoading : subscription?.isCheckoutLoading

  // Build paid plans list from fallback (sync access for client component)
  let allPlans: Array<{ name: PlanKey; plan: PlanConfig }> = [
    { name: 'starter', plan: FALLBACK_PLANS.starter },
    { name: 'pro', plan: FALLBACK_PLANS.pro },
  ]

  // Only add enterprise if not hidden
  if (!hideEnterprise) {
    allPlans.push({ name: 'enterprise', plan: FALLBACK_PLANS.enterprise })
  }

  const handleSubscribe = async (planName: PlanKey) => {
    // Enterprise is custom pricing - open contact form or email
    if (planName === 'enterprise') {
      const subject = encodeURIComponent('Enterprise Plan Inquiry')
      const body = encodeURIComponent('Hi FinanSEAL team,\n\nI would like to inquire about the Enterprise plan pricing for my organization.\n\nCompany name:\nNumber of users:\nSpecific requirements:\n\nLooking forward to hearing from you.\n\nBest regards')
      window.location.href = `mailto:support@hellogroot.com?subject=${subject}&body=${body}`
      return
    }

    setLoadingPlan(planName)

    if (standalone && onCheckout) {
      // Standalone mode - use custom checkout handler
      setStandaloneLoading(true)
      try {
        await onCheckout(planName)
      } finally {
        setStandaloneLoading(false)
        setLoadingPlan(null)
      }
    } else if (subscription) {
      // Connected mode - use hook's checkout
      await subscription.createCheckout(planName)
      setLoadingPlan(null)
    }
  }

  const isCurrentPlan = (planName: PlanKey) => !standalone && currentPlanName === planName
  const isDowngrade = (planName: PlanKey) => {
    if (standalone) return false
    const planOrder: PlanKey[] = ['trial', 'starter', 'pro', 'enterprise']
    return planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName as PlanKey)
  }

  // Helper to check if plan has custom pricing
  const isCustomPricing = (planName: PlanKey) => {
    return FALLBACK_PLANS[planName].isCustomPricing === true
  }

  // Helper to format limits
  const formatLimit = (limit: number, singular: string, plural: string) => {
    if (limit === -1) return 'Unlimited'
    return `${limit} ${limit === 1 ? singular : plural}`
  }

  // Dynamic grid columns based on number of plans
  const gridCols = hideEnterprise ? 'md:grid-cols-2' : 'md:grid-cols-3'

  return (
    <div className={cn('grid gap-6', gridCols, className)}>
      {allPlans.map(({ name, plan }) => {
        const isCurrent = isCurrentPlan(name)
        const isPopular = name === 'pro' // Pro is most popular / recommended
        const isLoading = loadingPlan === name || (isCheckoutLoading && loadingPlan === name)
        const hasCustomPricing = isCustomPricing(name)

        return (
          <Card
            key={name}
            className={cn(
              'relative flex flex-col bg-card border-border transition-all duration-200',
              'hover:shadow-lg hover:-translate-y-1',
              isCurrent && 'ring-2 ring-primary',
              isPopular && !isCurrent && 'border-primary/50'
            )}
          >
            {/* Popular/Recommended badge */}
            {isPopular && !isCurrent && (
              <Badge
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground"
              >
                {standalone ? 'Recommended' : 'Most Popular'}
              </Badge>
            )}

            {/* Current plan badge */}
            {isCurrent && showCurrentPlan && (
              <Badge
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white border-0"
              >
                Current Plan
              </Badge>
            )}

            <CardHeader className="text-center pb-2">
              <CardTitle className="text-foreground text-xl">{plan.name}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {name === 'starter' && 'Perfect for small businesses'}
                {name === 'pro' && 'Best for growing companies'}
                {name === 'enterprise' && 'For large organizations'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              {/* Limits section - shown prominently in onboarding */}
              {showLimits && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground">
                      {formatLimit(plan.teamLimit, 'team member', 'team members')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground">
                      {formatLimit(plan.ocrLimit, 'OCR scan', 'OCR scans')}/month
                    </span>
                  </div>
                </div>
              )}

              {/* Features */}
              <div>
                {showLimits && (
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Features</h4>
                )}
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-1 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span className="text-foreground text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>

            <CardFooter>
              {isCurrent ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : hasCustomPricing ? (
                <Button
                  className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 border border-blue-500/30"
                  onClick={() => handleSubscribe(name)}
                >
                  Contact Us
                </Button>
              ) : (
                <Button
                  variant={isPopular ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => handleSubscribe(name)}
                  disabled={isLoading || isCheckoutLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isDowngrade(name) ? (
                    'Downgrade via Portal'
                  ) : (
                    `Select ${plan.name}`
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
