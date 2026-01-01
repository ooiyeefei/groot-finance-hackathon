/**
 * TrialBanner Component
 * Shows trial status and days remaining in dashboard/app header for trial users.
 *
 * Features:
 * - Shows days remaining with visual urgency based on time left
 * - Progress bar showing trial progress (14 days total)
 * - Upgrade button with primary styling
 * - Optional dismiss button
 * - Responsive design for mobile and desktop
 */

'use client'

import { Clock, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface TrialBannerProps {
  daysRemaining: number  // Days left in trial (0-14)
  trialEndDate: string   // ISO date string
  onUpgrade: () => void  // Callback when upgrade button clicked
  onDismiss?: () => void // Optional dismiss callback
}

/**
 * Get urgency level based on days remaining
 * - 'high': 7+ days remaining (green/primary)
 * - 'medium': 3-6 days remaining (yellow/warning)
 * - 'low': 0-2 days remaining (red/destructive)
 */
function getUrgencyLevel(days: number): 'high' | 'medium' | 'low' {
  if (days >= 7) return 'high'
  if (days >= 3) return 'medium'
  return 'low'
}

/**
 * Get semantic color classes based on urgency level
 */
function getUrgencyColors(level: 'high' | 'medium' | 'low') {
  switch (level) {
    case 'high':
      return {
        badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
        progress: 'bg-green-500',
        icon: 'text-green-600 dark:text-green-400'
      }
    case 'medium':
      return {
        badge: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
        progress: 'bg-yellow-500',
        icon: 'text-yellow-600 dark:text-yellow-400'
      }
    case 'low':
      return {
        badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
        progress: 'bg-red-500',
        icon: 'text-red-600 dark:text-red-400'
      }
  }
}

/**
 * Format trial end date to readable format
 */
function formatEndDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function TrialBanner({
  daysRemaining,
  trialEndDate,
  onUpgrade,
  onDismiss
}: TrialBannerProps) {
  const urgencyLevel = getUrgencyLevel(daysRemaining)
  const colors = getUrgencyColors(urgencyLevel)

  // Calculate progress percentage (14 days total trial)
  const TOTAL_TRIAL_DAYS = 14
  const progressPercentage = ((TOTAL_TRIAL_DAYS - daysRemaining) / TOTAL_TRIAL_DAYS) * 100

  // Determine message based on days remaining
  const getMessage = () => {
    if (daysRemaining === 0) return 'Your trial ends today'
    if (daysRemaining === 1) return 'Your trial ends in 1 day'
    return `Your trial ends in ${daysRemaining} days`
  }

  return (
    <div className="bg-card border-b border-border">
      <div className="px-4 py-3 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Icon + Message Section */}
          <div className="flex items-center gap-2 flex-1">
            <Clock className={cn('w-5 h-5 flex-shrink-0', colors.icon)} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-foreground font-medium text-sm">
                  {getMessage()}
                </span>

                <Badge className={cn('text-xs', colors.badge)}>
                  Ends {formatEndDate(trialEndDate)}
                </Badge>
              </div>

              {/* Progress Bar - Hidden on very small screens */}
              <div className="mt-2 hidden sm:block">
                <div className="relative w-full max-w-xs">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="overflow-hidden rounded-full bg-muted h-2 cursor-pointer">
                          <div
                            className={cn('h-full transition-all duration-300', colors.progress)}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">Day {TOTAL_TRIAL_DAYS - daysRemaining}/{TOTAL_TRIAL_DAYS}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-xs text-muted-foreground mt-1 block">
                    {Math.round(progressPercentage)}% of trial used
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={onUpgrade}
              variant="primary"
              size="sm"
              className="flex-1 sm:flex-none"
            >
              <Zap className="w-4 h-4 mr-1" />
              Upgrade Now
            </Button>

            {onDismiss && (
              <Button
                onClick={onDismiss}
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                aria-label="Dismiss trial banner"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Progress Bar - Shown only on small screens */}
        <div className="mt-3 sm:hidden">
          <div className="relative w-full">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="overflow-hidden rounded-full bg-muted h-2 cursor-pointer">
                    <div
                      className={cn('h-full transition-all duration-300', colors.progress)}
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">Day {TOTAL_TRIAL_DAYS - daysRemaining}/{TOTAL_TRIAL_DAYS}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-xs text-muted-foreground mt-1 block">
              {Math.round(progressPercentage)}% of trial used
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
