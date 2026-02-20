'use client'

/**
 * PricingTable Component
 *
 * Displays subscription plans with features, prices, and checkout actions.
 * Highlights current plan and handles upgrade flows.
 *
 * Supports two modes:
 * - Connected mode (default): Uses useSubscription hook, shows current plan
 * - Standalone mode: Direct checkout without hook, for onboarding flow
 */

import { useState, useCallback } from 'react'
import { Check, Loader2, Users, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type PlanKey } from '@/lib/stripe/plans'
import { CURRENCY_SYMBOLS } from '@/lib/stripe/catalog'
import { useSubscription } from '../hooks/use-subscription'
import { useCatalog, type CatalogPlan } from '../hooks/use-catalog'
import { cn } from '@/lib/utils'

/**
 * Launch list prices (marketing decoration only — not charged in Stripe).
 * Shown as strikethrough "original" price next to the actual launch price.
 * Remove this config when transitioning to regular pricing post-launch.
 */
const LAUNCH_LIST_PRICES: Record<string, Record<string, number>> = {
  starter: { MYR: 299, SGD: 179 },
  pro:     { MYR: 699, SGD: 399 },
}

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
  /** Default currency from server-side geo detection */
  defaultCurrency?: string
  className?: string
}

export function PricingTable({
  showCurrentPlan = true,
  hideEnterprise = false,
  standalone = false,
  onCheckout,
  showLimits = false,
  defaultCurrency,
  className,
}: PricingTableProps) {
  // Only use subscription hook in connected mode
  const subscription = standalone ? null : useSubscription()
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null)
  const [standaloneLoading, setStandaloneLoading] = useState(false)
  const [expandedPlans, setExpandedPlans] = useState<Set<PlanKey>>(new Set())
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(defaultCurrency)

  // Fetch live catalog with currency
  const catalog = useCatalog(selectedCurrency)

  const toggleExpanded = useCallback((planName: PlanKey) => {
    setExpandedPlans(prev => {
      const next = new Set(prev)
      if (next.has(planName)) {
        next.delete(planName)
      } else {
        next.add(planName)
      }
      return next
    })
  }, [])

  const currentPlanName = subscription?.data?.plan.name || 'trial'
  const isTrialing = subscription?.data?.trial?.isOnTrial === true
  const isCheckoutLoading = standalone ? standaloneLoading : subscription?.isCheckoutLoading

  // Build plans list from catalog data
  let allPlans: CatalogPlan[] = catalog.plans.filter(
    (p) => !hideEnterprise || p.name !== 'enterprise'
  )

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
      // Connected mode - use hook's checkout with currency
      await subscription.createCheckout(planName, catalog.currency)
      setLoadingPlan(null)
    }
  }

  const isCurrentPlan = (planName: PlanKey) => {
    if (standalone) return false
    // Trial users on a plan should NOT see it as "current" — they should be able to activate
    if (isTrialing) return false
    return currentPlanName === planName
  }

  const isDowngrade = (planName: PlanKey) => {
    if (standalone || isTrialing) return false
    const planOrder: PlanKey[] = ['trial', 'starter', 'pro', 'enterprise']
    return planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName as PlanKey)
  }

  // Helper to format limits
  const formatLimit = (limit: number, singular: string, plural: string) => {
    if (limit === -1) return 'Unlimited'
    return `${limit} ${limit === 1 ? singular : plural}`
  }

  // Format price display
  const formatPrice = (price: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency
    return `${symbol}${price.toLocaleString()}`
  }

  // Dynamic grid columns based on number of plans
  const gridCols = hideEnterprise ? 'md:grid-cols-2' : 'md:grid-cols-3'

  return (
    <div className="space-y-4">
      {/* Currency switcher */}
      {catalog.availableCurrencies.length > 1 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span>Currency:</span>
            <select
              value={catalog.currency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {catalog.availableCurrencies.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className={cn('grid gap-6', gridCols, className)}>
        {allPlans.map((plan) => {
          const name = plan.name
          const isCurrent = isCurrentPlan(name)
          const isTrialingOnPlan = isTrialing && currentPlanName === name
          const isPopular = name === 'pro'
          const isLoading = loadingPlan === name || (isCheckoutLoading && loadingPlan === name)
          const hasCustomPricing = plan.isCustomPricing

          return (
            <Card
              key={name}
              className={cn(
                'relative flex flex-col bg-card border-border transition-all duration-200',
                'hover:shadow-lg hover:-translate-y-1',
                isCurrent && 'ring-2 ring-primary',
                isTrialingOnPlan && 'ring-2 ring-yellow-500/50',
                isPopular && !isCurrent && !isTrialingOnPlan && 'border-primary/50'
              )}
            >
              {/* Popular/Recommended badge */}
              {isPopular && !isCurrent && !isTrialingOnPlan && (
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

              {/* Trialing badge */}
              {isTrialingOnPlan && showCurrentPlan && (
                <Badge
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-white border-0"
                >
                  Trial Active
                </Badge>
              )}

              <CardHeader className="text-center pb-2">
                <CardTitle className="text-foreground text-xl">{plan.displayName}</CardTitle>

                {/* Price display */}
                <div className="mt-2">
                  {hasCustomPricing ? (
                    <p className="text-2xl font-bold text-foreground">Custom pricing</p>
                  ) : plan.price === 0 ? (
                    <p className="text-2xl font-bold text-foreground">Free</p>
                  ) : (() => {
                    const listPrice = LAUNCH_LIST_PRICES[name]?.[plan.currency]
                    const savings = listPrice ? listPrice - plan.price : 0
                    return (
                      <div>
                        {listPrice && (
                          <p className="text-sm text-muted-foreground line-through">
                            {formatPrice(listPrice, plan.currency)}/mo
                          </p>
                        )}
                        <p className="text-2xl font-bold text-foreground">
                          {formatPrice(plan.price, plan.currency)}
                          <span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </p>
                        {savings > 0 && (
                          <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                            Save {formatPrice(savings, plan.currency)} — Launch Special
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>

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
                    <div className="flex items-center gap-2 text-base">
                      <Users className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground">
                        {formatLimit(plan.teamLimit, 'team member', 'team members')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-base">
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground">
                        {formatLimit(plan.ocrLimit, 'OCR scan', 'OCR scans')}/month
                      </span>
                    </div>
                  </div>
                )}

                {/* Features */}
                <div>
                  {showLimits && (
                    <h4 className="text-base font-medium text-muted-foreground mb-3">Features</h4>
                  )}
                  {(() => {
                    const isExpanded = expandedPlans.has(name)
                    const displayFeatures = isExpanded ? plan.features : plan.highlightFeatures
                    const hasMore = plan.features.length > plan.highlightFeatures.length

                    return (
                      <>
                        <ul className="space-y-3">
                          {displayFeatures.map((feature, index) => (
                            <li key={index} className="flex items-start gap-2.5">
                              <Check className="w-5 h-5 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                              <span className="text-foreground text-base">
                                {feature}
                                {/e-invoice|einvoice|lhdn|peppol/i.test(feature) && (
                                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                                    Coming Soon
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(name)}
                            className="mt-3 flex items-center gap-1.5 text-base text-primary hover:text-primary/80 transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-5 h-5" />
                                Show less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-5 h-5" />
                                See all features
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )
                  })()}
                </div>
              </CardContent>

              <CardFooter>
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : isTrialingOnPlan ? (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => handleSubscribe(name)}
                    disabled={isLoading || isCheckoutLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Activate Plan'
                    )}
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
                      `Select ${plan.displayName}`
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
