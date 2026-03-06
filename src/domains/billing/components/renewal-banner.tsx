'use client'

/**
 * RenewalBanner Component
 *
 * Displays subscription renewal reminders at different urgency levels:
 * - 30 days: Low urgency (subtle)
 * - 14 days: Medium urgency (noticeable)
 * - 7 days or less: High urgency (prominent)
 *
 * Also handles:
 * - Payment failed status (past_due)
 * - Subscription expired/canceled status
 *
 * Dismissible with localStorage persistence (per urgency level).
 */

import { useState, useEffect } from 'react'
import { X, AlertTriangle, Clock, CreditCard, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubscription, RenewalInfo } from '../hooks/use-subscription'
import { cn } from '@/lib/utils'
import { isNativePlatform } from '@/lib/capacitor/platform'

interface RenewalBannerProps {
  className?: string
}

// Dismissal storage key prefix
const DISMISSAL_KEY_PREFIX = 'renewal-banner-dismissed-'

export function RenewalBanner({ className }: RenewalBannerProps) {
  const { data, isLoading } = useSubscription()
  const [isDismissed, setIsDismissed] = useState(false)

  // Check dismissal status on mount
  useEffect(() => {
    if (!data?.renewal) return

    const key = `${DISMISSAL_KEY_PREFIX}${data.renewal.urgencyLevel}`
    const dismissed = localStorage.getItem(key)

    if (dismissed) {
      // Check if dismissal is still valid (dismiss for 24 hours for high, 7 days for others)
      const dismissedAt = parseInt(dismissed, 10)
      const now = Date.now()
      const expiryMs = data.renewal.urgencyLevel === 'high'
        ? 24 * 60 * 60 * 1000  // 24 hours for high urgency
        : 7 * 24 * 60 * 60 * 1000  // 7 days for others

      if (now - dismissedAt < expiryMs) {
        setIsDismissed(true)
      } else {
        localStorage.removeItem(key)
      }
    }
  }, [data?.renewal])

  const handleDismiss = () => {
    if (!data?.renewal) return

    const key = `${DISMISSAL_KEY_PREFIX}${data.renewal.urgencyLevel}`
    localStorage.setItem(key, Date.now().toString())
    setIsDismissed(true)
  }

  // Don't render while loading or if data is incomplete
  if (isLoading || !data) return null

  const { subscription, renewal, plan } = data

  // Guard against missing renewal data (can happen if API response doesn't include it)
  if (!renewal) return null

  // Check for payment issues first (highest priority)
  if (subscription.status === 'past_due') {
    return (
      <PaymentFailedBanner
        className={className}
        onDismiss={handleDismiss}
        isDismissed={isDismissed}
      />
    )
  }

  // Trial in progress — sidebar handles trial UI, no renewal banner needed
  if (subscription.status === 'trialing') return null

  // Check for canceled/expired subscription
  if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    return (
      <SubscriptionExpiredBanner
        className={className}
        planName={plan.displayName}
      />
    )
  }

  // Check if subscription is set to cancel at period end
  if (subscription.cancelAtPeriodEnd && renewal.periodEnd) {
    return (
      <CancelationPendingBanner
        className={className}
        periodEnd={renewal.periodEnd}
        onDismiss={handleDismiss}
        isDismissed={isDismissed}
      />
    )
  }

  // Check renewal reminders (only for paid plans)
  if (!renewal?.needsAttention || renewal?.urgencyLevel === 'none') return null
  if (isDismissed) return null

  return (
    <RenewalReminderBanner
      renewal={renewal}
      planName={plan.displayName}
      className={className}
      onDismiss={handleDismiss}
    />
  )
}

// ============================================================================
// Sub-components for different banner types
// ============================================================================

interface BannerProps {
  className?: string
  onDismiss?: () => void
  isDismissed?: boolean
}

function PaymentFailedBanner({ className, onDismiss, isDismissed }: BannerProps) {
  if (isDismissed) return null

  return (
    <div className={cn(
      'bg-destructive/10 border border-destructive/30 rounded-lg p-4',
      'flex items-start gap-3',
      className
    )}>
      <CreditCard className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground">Payment Failed</h3>
        <p className="text-sm text-muted-foreground mt-1">
          We couldn&apos;t process your last payment. Please update your payment method to avoid service interruption.
        </p>
        {!isNativePlatform() ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" asChild>
              <a href="/settings/billing">Update Payment Method</a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            Visit <span className="font-medium text-foreground">hellogroot.com</span> in your browser to update payment.
          </p>
        )}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} className="flex-shrink-0">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

function SubscriptionExpiredBanner({ className, planName }: BannerProps & { planName: string }) {
  return (
    <div className={cn(
      'bg-destructive/10 border border-destructive/30 rounded-lg p-4',
      'flex items-start gap-3',
      className
    )}>
      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground">Subscription Expired</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your {planName} subscription has expired. Renew now to restore full access to your account.
        </p>
        {!isNativePlatform() ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" asChild>
              <a href="/settings/billing">Renew Subscription</a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            Visit <span className="font-medium text-foreground">hellogroot.com</span> in your browser to renew.
          </p>
        )}
      </div>
    </div>
  )
}

function CancelationPendingBanner({ className, periodEnd, onDismiss, isDismissed }: BannerProps & { periodEnd: string }) {
  if (isDismissed) return null

  const endDate = new Date(periodEnd)
  const formattedDate = endDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className={cn(
      'bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4',
      'flex items-start gap-3',
      className
    )}>
      <Calendar className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground">Subscription Ending</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your subscription is set to cancel on {formattedDate}. You&apos;ll retain access until then.
        </p>
        {!isNativePlatform() ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/settings/billing">Manage Subscription</a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            Visit <span className="font-medium text-foreground">hellogroot.com</span> in your browser to manage subscription.
          </p>
        )}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} className="flex-shrink-0">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

interface RenewalReminderBannerProps extends BannerProps {
  renewal: RenewalInfo
  planName: string
}

function RenewalReminderBanner({ renewal, planName, className, onDismiss }: RenewalReminderBannerProps) {
  const { daysUntilRenewal, urgencyLevel, periodEnd } = renewal

  // Style based on urgency
  const styles = {
    low: {
      container: 'bg-blue-500/10 border-blue-500/30',
      icon: 'text-blue-600 dark:text-blue-400',
      iconComponent: Clock,
    },
    medium: {
      container: 'bg-yellow-500/10 border-yellow-500/30',
      icon: 'text-yellow-600 dark:text-yellow-400',
      iconComponent: Calendar,
    },
    high: {
      container: 'bg-destructive/10 border-destructive/30',
      icon: 'text-destructive',
      iconComponent: AlertTriangle,
    },
    none: {
      container: '',
      icon: '',
      iconComponent: Clock,
    },
  }

  const style = styles[urgencyLevel]
  const Icon = style.iconComponent

  const endDate = periodEnd ? new Date(periodEnd) : null
  const formattedDate = endDate?.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Message based on days remaining
  let message = ''
  if (daysUntilRenewal !== null) {
    if (daysUntilRenewal <= 0) {
      message = 'Your subscription renews today.'
    } else if (daysUntilRenewal === 1) {
      message = 'Your subscription renews tomorrow.'
    } else if (daysUntilRenewal <= 7) {
      message = `Your ${planName} subscription renews in ${daysUntilRenewal} days (${formattedDate}).`
    } else if (daysUntilRenewal <= 14) {
      message = `Your ${planName} subscription renews in ${daysUntilRenewal} days.`
    } else {
      message = `Your ${planName} subscription renews on ${formattedDate}.`
    }
  }

  return (
    <div className={cn(
      'border rounded-lg p-4 flex items-start gap-3',
      style.container,
      className
    )}>
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.icon)} />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground">
          {urgencyLevel === 'high' ? 'Renewal Due Soon' : 'Upcoming Renewal'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
        {urgencyLevel === 'high' && (
          <p className="text-sm text-muted-foreground mt-1">
            Please ensure your payment method is up to date to avoid interruption.
          </p>
        )}
        {!isNativePlatform() ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/settings/billing">Manage Subscription</a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            Visit <span className="font-medium text-foreground">hellogroot.com</span> in your browser to manage subscription.
          </p>
        )}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} className="flex-shrink-0">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}
