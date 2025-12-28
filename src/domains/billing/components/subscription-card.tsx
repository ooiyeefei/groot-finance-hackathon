'use client'

/**
 * SubscriptionCard Component
 *
 * Compact subscription summary for the Settings page.
 * Shows current plan, usage, and link to billing management.
 */

import Link from 'next/link'
import { useSubscription } from '../hooks/use-subscription'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sparkles, ChevronRight, Zap, Infinity, AlertTriangle } from 'lucide-react'

export function SubscriptionCard() {
  const { data, isLoading, error } = useSubscription()

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-2 bg-muted rounded w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm">Unable to load subscription info</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { plan, usage } = data
  const { ocrUsed, ocrLimit, ocrPercentage, isUnlimited } = usage
  const isFreePlan = plan.name === 'free'
  const isAtLimit = !isUnlimited && ocrPercentage >= 100
  const isNearLimit = !isUnlimited && ocrPercentage >= 80

  // Plan badge styling
  const getPlanBadgeClass = () => {
    if (isFreePlan) return 'bg-muted text-muted-foreground'
    if (plan.name === 'pro') return 'bg-primary/10 text-primary border border-primary/30'
    return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">Subscription</h3>
                <Badge className={getPlanBadgeClass()}>
                  {plan.displayName}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {isFreePlan ? 'Upgrade to unlock more features' : `${plan.currency} ${plan.price}/month`}
              </p>
            </div>
          </div>

          <Link href="/en/settings/billing">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Manage
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Usage Summary */}
        <div className="mt-4 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">OCR Scans this month</span>
            <span className={`text-sm font-medium ${
              isAtLimit ? 'text-red-600 dark:text-red-400' :
              isNearLimit ? 'text-yellow-600 dark:text-yellow-400' :
              'text-foreground'
            }`}>
              {isUnlimited ? (
                <span className="flex items-center gap-1">
                  {ocrUsed} <Infinity className="w-4 h-4" />
                </span>
              ) : (
                `${ocrUsed} / ${ocrLimit}`
              )}
            </span>
          </div>

          {!isUnlimited && (
            <Progress value={Math.min(ocrPercentage, 100)} className="h-1.5" />
          )}

          {isAtLimit && (
            <div className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-3 h-3" />
              <span>Limit reached - upgrade to continue scanning</span>
            </div>
          )}
        </div>

        {/* Upgrade CTA for free users */}
        {isFreePlan && (
          <Link href="/en/pricing" className="block mt-4">
            <Button className="w-full" variant="default" size="sm">
              <Zap className="w-4 h-4 mr-2" />
              Upgrade to Pro
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
