'use client'

/**
 * UsageDashboard Component
 *
 * Displays OCR usage statistics with progress bar and upgrade prompt.
 * Uses the useSubscription hook to fetch current usage data.
 */

import { useSubscription } from '../hooks/use-subscription'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle, FileText, Infinity, Zap } from 'lucide-react'
import Link from 'next/link'

interface UsageDashboardProps {
  showUpgradeButton?: boolean
  compact?: boolean
}

export function UsageDashboard({ showUpgradeButton = true, compact = false }: UsageDashboardProps) {
  const { data, isLoading, error } = useSubscription()

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-sm">Unable to load usage data</p>
        </CardContent>
      </Card>
    )
  }

  const { usage, plan } = data
  const { ocrUsed, ocrLimit, ocrPercentage, isUnlimited, ocrRemaining } = usage

  // Determine status color based on usage percentage
  const getStatusColor = () => {
    if (isUnlimited) return 'text-green-600 dark:text-green-400'
    if (ocrPercentage >= 100) return 'text-red-600 dark:text-red-400'
    if (ocrPercentage >= 80) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }

  // Progress color classes (used for inline styling workaround)
  const getProgressColorHex = () => {
    if (isUnlimited) return '#22c55e' // green-500
    if (ocrPercentage >= 100) return '#ef4444' // red-500
    if (ocrPercentage >= 80) return '#eab308' // yellow-500
    return '#3b82f6' // blue-500 (primary)
  }

  const getStatusBadge = () => {
    if (isUnlimited) {
      return (
        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
          <Infinity className="w-3 h-3 mr-1" />
          Unlimited
        </Badge>
      )
    }
    if (ocrPercentage >= 100) {
      return (
        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Limit Reached
        </Badge>
      )
    }
    if (ocrPercentage >= 80) {
      return (
        <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Approaching Limit
        </Badge>
      )
    }
    return (
      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
        <CheckCircle className="w-3 h-3 mr-1" />
        Good
      </Badge>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">OCR Scans</span>
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {isUnlimited ? (
                <>
                  {ocrUsed} <Infinity className="inline w-3 h-3" />
                </>
              ) : (
                `${ocrUsed}/${ocrLimit}`
              )}
            </span>
          </div>
          {!isUnlimited && (
            <Progress value={ocrPercentage} className="h-1.5" />
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5" />
              OCR Usage
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Document scanning credits for {plan.displayName} plan
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usage Stats */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Scans used this month</span>
          <span className={`text-lg font-semibold ${getStatusColor()}`}>
            {isUnlimited ? (
              <>
                {ocrUsed} <span className="text-sm font-normal">/ Unlimited</span>
              </>
            ) : (
              <>
                {ocrUsed} <span className="text-sm font-normal">/ {ocrLimit}</span>
              </>
            )}
          </span>
        </div>

        {/* Progress Bar */}
        {!isUnlimited && (
          <div className="space-y-2">
            <Progress
              value={Math.min(ocrPercentage, 100)}
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{ocrPercentage}% used</span>
              <span>{ocrRemaining} remaining</span>
            </div>
          </div>
        )}

        {/* Upgrade Prompt */}
        {showUpgradeButton && !isUnlimited && ocrPercentage >= 80 && (
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {ocrPercentage >= 100 ? 'Limit reached!' : 'Running low on scans'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ocrPercentage >= 100
                    ? 'Upgrade your plan to continue processing documents.'
                    : 'Consider upgrading to get more OCR scans.'}
                </p>
                <Link href="/en/pricing" className="inline-block mt-2">
                  <Button size="sm" variant="default">
                    <Zap className="w-4 h-4 mr-1" />
                    Upgrade Plan
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
