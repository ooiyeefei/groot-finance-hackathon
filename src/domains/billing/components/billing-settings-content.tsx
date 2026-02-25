'use client'

/**
 * Billing Settings Content
 *
 * Extracted billing UI that can be used as a tab inside Business Settings
 * or as standalone content. Handles Stripe checkout success/cancel params.
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  useSubscription,
  TRIAL_DURATION_DAYS,
  calculateTrialDaysUsed,
  calculateTrialProgress,
} from '@/domains/billing/hooks/use-subscription'
import { CreditCard, Check, ExternalLink, Loader2, AlertCircle, RefreshCw, Sparkles, Star, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { ComingSoonBadge } from '@/components/ui/coming-soon-badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import InvoiceList from '@/domains/billing/components/invoice-list'

/**
 * Confetti particle component for celebration effect
 */
function ConfettiParticle({ delay, color, left }: { delay: number; color: string; left: number }) {
  return (
    <div
      className="absolute w-3 h-3 rounded-full animate-confetti-fall pointer-events-none"
      style={{
        backgroundColor: color,
        left: `${left}%`,
        animationDelay: `${delay}s`,
        top: '-10px',
      }}
    />
  )
}

/**
 * Celebration overlay with confetti animation
 */
function CelebrationOverlay({ show, onComplete }: { show: boolean; onComplete: () => void }) {
  const [particles, setParticles] = useState<Array<{ id: number; delay: number; color: string; left: number }>>([])

  useEffect(() => {
    if (show) {
      const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']
      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        delay: Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        left: Math.random() * 100,
      }))
      setParticles(newParticles)

      const timer = setTimeout(() => {
        onComplete()
      }, 4000)

      return () => clearTimeout(timer)
    }
  }, [show, onComplete])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} color={p.color} left={p.left} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="animate-celebration-pop bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-6 rounded-2xl shadow-2xl flex items-center gap-4">
          <div className="relative">
            <Sparkles className="w-10 h-10 animate-pulse" />
            <Star className="w-4 h-4 absolute -top-1 -right-1 text-yellow-300 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <h3 className="text-2xl font-bold">Welcome to Pro!</h3>
            <p className="text-green-100">Your upgrade is complete</p>
          </div>
          <Zap className="w-8 h-8 animate-bounce" />
        </div>
      </div>
    </div>
  )
}

export default function BillingSettingsContent() {
  const { data, isLoading, error, refetch } = useSubscription()
  const searchParams = useSearchParams()
  const [showCelebration, setShowCelebration] = useState(false)
  const [hasShownCelebration, setHasShownCelebration] = useState(false)
  const [showAllFeatures, setShowAllFeatures] = useState(false)

  // Check for success/cancel from Stripe Checkout
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  const dismissCelebration = useCallback(() => {
    setShowCelebration(false)
  }, [])

  // Aggressive refetch on success with multiple attempts to ensure webhook has processed
  useEffect(() => {
    if (success === 'true') {
      if (!hasShownCelebration) {
        setShowCelebration(true)
        setHasShownCelebration(true)
      }

      const refetchAttempts = [500, 1500, 3000, 5000]
      const timers = refetchAttempts.map((delay) =>
        setTimeout(() => {
          refetch()
        }, delay)
      )

      return () => timers.forEach(clearTimeout)
    }
  }, [success, refetch, hasShownCelebration])

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/v1/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await response.json()
      if (result.success && result.data?.url) {
        window.location.href = result.data.url
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
            Active
          </Badge>
        )
      case 'trialing':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            Trial
          </Badge>
        )
      case 'past_due':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
            Past Due
          </Badge>
        )
      case 'canceled':
        return (
          <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            Canceled
          </Badge>
        )
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border border-border">
            {status}
          </Badge>
        )
    }
  }

  return (
    <>
      {/* Celebration overlay for successful subscription */}
      <CelebrationOverlay show={showCelebration} onComplete={dismissCelebration} />

      <div className="space-y-6">
        {/* Success/Cancel Messages */}
        {success === 'true' && (
          <Card className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-green-600 dark:text-green-400 font-semibold text-lg">
                  Welcome to your new plan!
                </p>
                <p className="text-green-600/80 dark:text-green-400/80 text-sm">
                  Your subscription is now active. Enjoy your upgraded features!
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {canceled === 'true' && (
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                Checkout was canceled. Your subscription has not changed.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card className="bg-card border-border">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Subscription Details */}
        {data && !isLoading && (
          <>
            {/* Grid Layout - First Row: Current Plan + OCR Usage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Plan */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-foreground">Current Plan</CardTitle>
                        <CardDescription>Your subscription details</CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(data.subscription.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-foreground font-medium">
                      {data.plan.displayName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Price</span>
                    <span className="text-foreground font-medium">
                      {data.plan.currency} {data.plan.price}/month
                    </span>
                  </div>
                  {/* Trial Days Remaining */}
                  {data.trial?.isOnTrial && data.trial.daysRemaining !== null && (
                    <div className="py-3 border-b border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Trial Period</span>
                        <span className={cn(
                          "font-medium",
                          data.trial.daysRemaining <= 3 ? "text-red-600 dark:text-red-400" :
                          data.trial.daysRemaining <= 7 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-foreground"
                        )}>
                          {data.trial.trialExpired ? 'Expired' : `${data.trial.daysRemaining} days left`}
                        </span>
                      </div>
                      {!data.trial.trialExpired && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-pointer">
                                <Progress
                                  value={calculateTrialProgress(data.trial)}
                                  className={cn(
                                    'h-2',
                                    data.trial.daysRemaining <= 3 ? '[&>div]:bg-red-500' :
                                    data.trial.daysRemaining <= 7 ? '[&>div]:bg-yellow-500' :
                                    '[&>div]:bg-primary'
                                  )}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Day {calculateTrialDaysUsed(data.trial)}/{TRIAL_DURATION_DAYS}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                  {data.subscription.currentPeriodEnd && (
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <span className="text-muted-foreground">Next Billing Date</span>
                      <span className="text-foreground font-medium">
                        {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {data.subscription.cancelAtPeriodEnd && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-yellow-600 dark:text-yellow-400">
                        Subscription will cancel at end of period
                      </span>
                    </div>
                  )}

                  {data.subscription.stripeCustomerId && (
                    <Button
                      variant="outline"
                      className="w-full mt-4"
                      onClick={handleManageSubscription}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manage Subscription
                    </Button>
                  )}

                  <Button
                    variant={data.subscription.status === 'trialing' || !data.subscription.stripeCustomerId ? 'default' : 'ghost'}
                    className="w-full mt-2"
                    onClick={() => (window.location.href = '/en/pricing')}
                  >
                    {data.subscription.status === 'trialing' || !data.subscription.stripeCustomerId
                      ? 'Upgrade Your Plan'
                      : 'Compare Plans'}
                  </Button>
                </CardContent>
              </Card>

              {/* OCR Usage */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">OCR Usage</CardTitle>
                  <CardDescription>
                    Document processing credits this month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.usage.isUnlimited ? (
                    <div className="text-center py-4">
                      <span className="text-2xl font-bold text-foreground">
                        {data.usage.ocrUsed}
                      </span>
                      <span className="text-muted-foreground ml-2">documents processed</span>
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                        Unlimited OCR scans with your Enterprise plan
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between mb-2">
                        <span className="text-muted-foreground">
                          {data.usage.ocrUsed} / {data.usage.ocrLimit} scans used
                        </span>
                        <span
                          className={cn(
                            'font-medium',
                            data.usage.ocrPercentage >= 80
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-foreground'
                          )}
                        >
                          {data.usage.ocrPercentage}%
                        </span>
                      </div>
                      <Progress
                        value={data.usage.ocrPercentage}
                        className={cn(
                          'h-2',
                          data.usage.ocrPercentage >= 80 && '[&>div]:bg-yellow-500'
                        )}
                      />
                      {data.usage.ocrPercentage >= 80 && (
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-3">
                          You&apos;re approaching your OCR limit. Consider upgrading for more scans.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Grid Layout - Second Row: Plan Features + Invoice History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Plan Features */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Plan Features</CardTitle>
                  <CardDescription>
                    What&apos;s included in your {data.plan.displayName} plan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const highlights = data.plan.highlightFeatures ?? data.plan.features
                    const allFeatures = data.plan.features
                    const displayFeatures = showAllFeatures ? allFeatures : highlights
                    const hasMore = allFeatures.length > highlights.length

                    return (
                      <>
                        <ul className="space-y-3">
                          {displayFeatures.map((feature, index) => {
                            const isEInvoice = /e-invoice|einvoice|lhdn|peppol/i.test(feature)
                            const displayLabel = isEInvoice
                              ? feature.replace(/LHDN e-Invoice|e-Invoice \(Peppol\)|e-Invoice/i, 'e-Invoice')
                              : feature
                            return (
                              <li key={index} className="flex items-center gap-2.5">
                                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                                <span className="text-foreground text-base">
                                  {displayLabel}
                                  {isEInvoice && <ComingSoonBadge className="ml-1.5" />}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => setShowAllFeatures(!showAllFeatures)}
                            className="mt-3 flex items-center gap-1.5 text-base text-primary hover:text-primary/80 transition-colors"
                          >
                            {showAllFeatures ? (
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
                </CardContent>
              </Card>

              {/* Invoice History */}
              <div className="bg-card border border-border rounded-lg">
                <InvoiceList limit={5} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
