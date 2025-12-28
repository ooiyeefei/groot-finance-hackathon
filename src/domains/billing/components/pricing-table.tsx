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
import { PLANS, PlanName, getPaidPlans } from '@/lib/stripe/plans'
import { useSubscription } from '../hooks/use-subscription'
import { cn } from '@/lib/utils'

interface PricingTableProps {
  showCurrentPlan?: boolean
  className?: string
}

export function PricingTable({ showCurrentPlan = true, className }: PricingTableProps) {
  const { data, createCheckout, isCheckoutLoading } = useSubscription()
  const [loadingPlan, setLoadingPlan] = useState<PlanName | null>(null)

  const currentPlanName = data?.plan.name || 'free'
  const allPlans = [
    { name: 'free' as const, plan: PLANS.free },
    ...getPaidPlans(),
  ]

  const handleSubscribe = async (planName: PlanName) => {
    if (planName === 'free') return
    setLoadingPlan(planName)
    await createCheckout(planName)
    setLoadingPlan(null)
  }

  const isCurrentPlan = (planName: PlanName) => currentPlanName === planName
  const isDowngrade = (planName: PlanName) => {
    const planOrder: PlanName[] = ['free', 'pro', 'enterprise']
    return planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName)
  }

  return (
    <div className={cn('grid gap-6 md:grid-cols-3', className)}>
      {allPlans.map(({ name, plan }) => {
        const isCurrent = isCurrentPlan(name)
        const isPopular = name === 'pro'
        const isLoading = loadingPlan === name || (isCheckoutLoading && loadingPlan === name)

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
                {name === 'free' && 'Get started for free'}
                {name === 'pro' && 'For growing businesses'}
                {name === 'enterprise' && 'For large teams'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              {/* Price */}
              <div className="text-center mb-6">
                <span className="text-4xl font-bold text-foreground">
                  {plan.currency} {plan.price}
                </span>
                <span className="text-muted-foreground">/month</span>
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
              ) : name === 'free' ? (
                <Button variant="outline" className="w-full" disabled>
                  {isDowngrade(name) ? 'Downgrade via Portal' : 'Free'}
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
