'use client'

/**
 * PricingTable Component
 *
 * Displays subscription plans with features and checkout actions.
 * Highlights current plan and handles upgrade flows.
 */

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FALLBACK_PLANS, PlanKey, type PlanConfig } from '@/lib/stripe/plans'
import { useSubscription } from '../hooks/use-subscription'
import { cn } from '@/lib/utils'

interface PricingTableProps {
  showCurrentPlan?: boolean
  className?: string
}

export function PricingTable({ showCurrentPlan = true, className }: PricingTableProps) {
  const { data, createCheckout, isCheckoutLoading } = useSubscription()
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null)

  const currentPlanName = data?.plan.name || 'trial'
  // Build paid plans list from fallback (sync access for client component)
  const allPlans: Array<{ name: PlanKey; plan: PlanConfig }> = [
    { name: 'starter', plan: FALLBACK_PLANS.starter },
    { name: 'pro', plan: FALLBACK_PLANS.pro },
    { name: 'enterprise', plan: FALLBACK_PLANS.enterprise },
  ]

  const handleSubscribe = async (planName: PlanKey) => {
    // Enterprise is custom pricing - open contact form or email
    if (planName === 'enterprise') {
      const subject = encodeURIComponent('Enterprise Plan Inquiry')
      const body = encodeURIComponent('Hi FinanSEAL team,\n\nI would like to inquire about the Enterprise plan pricing for my organization.\n\nCompany name:\nNumber of users:\nSpecific requirements:\n\nLooking forward to hearing from you.\n\nBest regards')
      window.location.href = `mailto:hello@hellogroot.com?subject=${subject}&body=${body}`
      return
    }
    setLoadingPlan(planName)
    await createCheckout(planName)
    setLoadingPlan(null)
  }

  const isCurrentPlan = (planName: PlanKey) => currentPlanName === planName
  const isDowngrade = (planName: PlanKey) => {
    const planOrder: PlanKey[] = ['trial', 'starter', 'pro', 'enterprise']
    return planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName as PlanKey)
  }

  // Helper to check if plan has custom pricing
  const isCustomPricing = (planName: PlanKey) => {
    return FALLBACK_PLANS[planName].isCustomPricing === true
  }

  return (
    <div className={cn('grid gap-6 md:grid-cols-3', className)}>
      {allPlans.map(({ name, plan }) => {
        const isCurrent = isCurrentPlan(name)
        const isPopular = name === 'pro' // Pro (MYR 199) is most popular
        const isLoading = loadingPlan === name || (isCheckoutLoading && loadingPlan === name)
        const hasCustomPricing = isCustomPricing(name)

        return (
          <Card
            key={name}
            className={cn(
              'relative flex flex-col bg-card border-border',
              isCurrent && 'ring-2 ring-primary',
              isPopular && !isCurrent && 'border-primary/50'
            )}
          >
            {/* Popular badge */}
            {isPopular && !isCurrent && (
              <Badge
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground"
              >
                Most Popular
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
                {name === 'pro' && 'For growing businesses'}
                {name === 'enterprise' && 'For large organizations'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              {/* Price */}
              <div className="text-center mb-6">
                {hasCustomPricing ? (
                  <span className="text-4xl font-bold text-foreground">Custom pricing</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-foreground">
                      {plan.currency} {plan.price}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-1 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-foreground text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
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
                  className={cn(
                    'w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 border border-blue-500/30',
                    isPopular && 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                  )}
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
                    `Subscribe to ${plan.name}`
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
