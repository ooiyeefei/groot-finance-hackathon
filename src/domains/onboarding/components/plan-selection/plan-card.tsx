'use client'

/**
 * PlanCard Component
 *
 * Reusable card for displaying subscription plan details in the onboarding flow.
 * Features:
 * - Recommended badge (centered at top)
 * - Feature list with check icons
 * - Team and OCR limit display
 * - CTA button with loading state
 * - Hover effects with elevation
 *
 * Design System:
 * - Uses semantic tokens for light/dark mode support
 * - Imports UI components from @/components/ui
 * - Material Design 3 inspired styling
 */

import { Check, Loader2, Users, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface PlanCardProps {
  planName: 'starter' | 'pro' | 'enterprise'
  displayName: string
  features: readonly string[]
  teamLimit: number // -1 for unlimited
  ocrLimit: number // -1 for unlimited
  isRecommended?: boolean
  onSelect: () => void
  isLoading?: boolean
}

export function PlanCard({
  planName,
  displayName,
  features,
  teamLimit,
  ocrLimit,
  isRecommended = false,
  onSelect,
  isLoading = false,
}: PlanCardProps) {
  const formatLimit = (limit: number, singular: string, plural: string) => {
    if (limit === -1) return 'Unlimited'
    return `${limit} ${limit === 1 ? singular : plural}`
  }

  return (
    <Card
      className={cn(
        'relative flex flex-col bg-card border-border transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-1',
        isRecommended && 'border-primary/50'
      )}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <Badge
          className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground"
        >
          Recommended
        </Badge>
      )}

      <CardHeader className="text-center pb-4">
        <CardTitle className="text-foreground text-2xl">{displayName}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {planName === 'starter' && 'Perfect for small businesses'}
          {planName === 'pro' && 'Best for growing companies'}
          {planName === 'enterprise' && 'For large organizations'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-6">
        {/* Limits section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">
              {formatLimit(teamLimit, 'team member', 'team members')}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">
              {formatLimit(ocrLimit, 'OCR scan', 'OCR scans')}/month
            </span>
          </div>
        </div>

        {/* Features list */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Features</h4>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-foreground text-sm">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          variant={isRecommended ? 'default' : 'outline'}
          className="w-full"
          onClick={onSelect}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Selecting...
            </>
          ) : (
            `Select ${displayName}`
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
