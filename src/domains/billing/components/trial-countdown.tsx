'use client'

/**
 * TrialCountdown Component
 *
 * Displays days remaining in trial period with visual progress bar.
 * Used in sidebar, billing page, and dashboard.
 */

import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Clock, Zap, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type TrialInfo,
  TRIAL_DURATION_DAYS,
  calculateTrialDaysUsed,
  calculateTrialProgress,
} from '../hooks/use-subscription'

interface TrialCountdownProps {
  trial: TrialInfo
  /** Compact mode for sidebar (no text labels) */
  compact?: boolean
  /** Show upgrade button */
  showUpgradeButton?: boolean
  /** Custom class name */
  className?: string
}

export function TrialCountdown({
  trial,
  compact = false,
  showUpgradeButton = false,
  className,
}: TrialCountdownProps) {
  // Don't render if not on trial or no trial end date
  if (!trial.isOnTrial || trial.daysRemaining === null) {
    return null
  }

  const daysRemaining = trial.daysRemaining

  // Use centralized utilities for consistent calculation across all components
  const daysUsed = calculateTrialDaysUsed(trial)
  const progressPercentage = calculateTrialProgress(trial)

  // Determine urgency level
  const isExpired = trial.trialExpired || daysRemaining <= 0
  const isUrgent = daysRemaining <= 3 && !isExpired
  const isWarning = daysRemaining <= 7 && !isUrgent && !isExpired

  // Color based on urgency
  const getProgressColor = () => {
    if (isExpired) return '[&>div]:bg-red-500'
    if (isUrgent) return '[&>div]:bg-red-500'
    if (isWarning) return '[&>div]:bg-yellow-500'
    return '[&>div]:bg-primary'
  }

  const getTextColor = () => {
    if (isExpired) return 'text-red-600 dark:text-red-400'
    if (isUrgent) return 'text-red-600 dark:text-red-400'
    if (isWarning) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-foreground'
  }

  // Compact mode for sidebar - blue gradient themed box
  if (compact) {
    return (
      <div className={cn(
        'p-2 rounded-lg space-y-1.5',
        isExpired || isUrgent
          ? 'bg-gradient-to-r from-red-500/20 to-red-600/10'
          : isWarning
            ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10'
            : 'bg-gradient-to-r from-blue-500/20 to-indigo-500/10',
        className
      )}>
        <div className="flex items-center justify-between text-xs">
          <span className={cn(
            'flex items-center gap-1 font-medium',
            isExpired || isUrgent
              ? 'text-red-600 dark:text-red-400'
              : isWarning
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
          )}>
            <Clock className="w-3 h-3" />
            Trial
          </span>
          <span className={cn(
            'font-semibold',
            isExpired || isUrgent
              ? 'text-red-600 dark:text-red-400'
              : isWarning
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
          )}>
            {isExpired ? 'Expired' : `${daysRemaining}d`}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-pointer">
                <Progress
                  value={progressPercentage}
                  className={cn(
                    'h-1',
                    isExpired || isUrgent
                      ? '[&>div]:bg-red-500'
                      : isWarning
                        ? '[&>div]:bg-yellow-500'
                        : '[&>div]:bg-blue-500'
                  )}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">Day {daysUsed}/{TRIAL_DURATION_DAYS}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  // Full mode for billing page / dashboard
  return (
    <div className={cn(
      'p-3 rounded-lg space-y-2',
      isExpired || isUrgent
        ? 'bg-gradient-to-r from-red-500/20 to-red-600/10'
        : isWarning
          ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10'
          : 'bg-gradient-to-r from-blue-500/20 to-indigo-500/10',
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isExpired || isUrgent ? (
            <AlertTriangle className={cn('w-4 h-4', getTextColor())} />
          ) : (
            <Clock className={cn('w-4 h-4', isWarning ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400')} />
          )}
          <span className={cn(
            'text-sm font-medium',
            isExpired || isUrgent
              ? 'text-red-600 dark:text-red-400'
              : isWarning
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
          )}>Free Trial</span>
        </div>
        <span className={cn(
          'text-sm font-semibold',
          isExpired || isUrgent
            ? 'text-red-600 dark:text-red-400'
            : isWarning
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
        )}>
          {isExpired ? 'Trial Expired' : `${daysRemaining} days remaining`}
        </span>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-pointer">
              <Progress value={progressPercentage} className={cn(
                'h-1.5',
                isExpired || isUrgent
                  ? '[&>div]:bg-red-500'
                  : isWarning
                    ? '[&>div]:bg-yellow-500'
                    : '[&>div]:bg-blue-500'
              )} />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">Day {daysUsed}/{TRIAL_DURATION_DAYS}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className={cn(
        'flex items-center justify-between text-xs',
        isExpired || isUrgent
          ? 'text-red-600/70 dark:text-red-400/70'
          : isWarning
            ? 'text-yellow-600/70 dark:text-yellow-400/70'
            : 'text-blue-600/70 dark:text-blue-400/70'
      )}>
        <span>Day {Math.min(daysUsed, TRIAL_DURATION_DAYS)} of {TRIAL_DURATION_DAYS}</span>
        {trial.trialEndDate && (
          <span>Ends {new Date(trial.trialEndDate).toLocaleDateString()}</span>
        )}
      </div>

      {isExpired && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Your trial has ended. Upgrade now to continue using all features.
        </p>
      )}

      {isUrgent && !isExpired && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Your trial ends soon! Upgrade to keep your data and features.
        </p>
      )}

      {showUpgradeButton && (
        <Link href="/en/pricing" className="block">
          <Button size="sm" className="w-full" variant={isExpired || isUrgent ? 'default' : 'outline'}>
            <Zap className="w-4 h-4 mr-2" />
            {isExpired ? 'Upgrade Now' : 'View Plans'}
          </Button>
        </Link>
      )}
    </div>
  )
}
