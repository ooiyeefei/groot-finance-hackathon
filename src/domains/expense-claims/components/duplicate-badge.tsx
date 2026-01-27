/**
 * Duplicate Badge Component
 * Feature: 007-duplicate-expense-detection (User Story 2, T025)
 *
 * Visual indicator badge for expense claims that have potential duplicates.
 * Shows match tier (exact/strong/fuzzy) and cross-user status.
 */

'use client'

import { AlertTriangle, Users, Copy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type MatchTier = 'exact' | 'strong' | 'fuzzy'

export interface DuplicateBadgeProps {
  matchTier: MatchTier
  matchCount?: number
  isCrossUser?: boolean
  confidenceScore?: number
  onClick?: () => void
  size?: 'sm' | 'md'
  showTooltip?: boolean
}

const TIER_CONFIG = {
  exact: {
    label: 'Exact Duplicate',
    shortLabel: 'Duplicate',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20',
    icon: Copy,
    description: 'Same receipt/reference number detected',
  },
  strong: {
    label: 'Likely Duplicate',
    shortLabel: 'Likely Dup.',
    className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 hover:bg-orange-500/20',
    icon: AlertTriangle,
    description: 'Same vendor, date, and amount',
  },
  fuzzy: {
    label: 'Possible Duplicate',
    shortLabel: 'Possible Dup.',
    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20',
    icon: AlertTriangle,
    description: 'Similar transaction detected',
  },
}

export default function DuplicateBadge({
  matchTier,
  matchCount = 1,
  isCrossUser = false,
  confidenceScore,
  onClick,
  size = 'sm',
  showTooltip = true,
}: DuplicateBadgeProps) {
  const config = TIER_CONFIG[matchTier]
  const Icon = config.icon

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
  }

  const BadgeContent = (
    <Badge
      className={`${config.className} ${sizeClasses[size]} ${onClick ? 'cursor-pointer' : ''} flex items-center gap-1`}
      onClick={onClick}
    >
      <Icon className={iconSizes[size]} />
      <span>{size === 'sm' ? config.shortLabel : config.label}</span>
      {matchCount > 1 && (
        <span className="ml-0.5">({matchCount})</span>
      )}
      {isCrossUser && (
        <Users className={`${iconSizes[size]} ml-0.5`} />
      )}
    </Badge>
  )

  if (!showTooltip) {
    return BadgeContent
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {BadgeContent}
        </TooltipTrigger>
        <TooltipContent className="bg-card border-border max-w-xs">
          <div className="space-y-1">
            <p className="font-medium text-foreground">{config.label}</p>
            <p className="text-sm text-muted-foreground">{config.description}</p>
            {isCrossUser && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                Cross-user duplicate (different submitter)
              </p>
            )}
            {confidenceScore !== undefined && (
              <p className="text-sm text-muted-foreground">
                Confidence: {Math.round(confidenceScore * 100)}%
              </p>
            )}
            {onClick && (
              <p className="text-xs text-primary mt-2">Click to review</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Inline duplicate indicator for list views
 * Smaller, more compact version
 */
export function DuplicateIndicator({
  matchTier,
  onClick,
}: {
  matchTier: MatchTier
  onClick?: () => void
}) {
  const config = TIER_CONFIG[matchTier]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`p-1 rounded ${config.className} ${onClick ? 'cursor-pointer' : ''}`}
          >
            <Icon className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-card border-border">
          <p className="text-sm">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
