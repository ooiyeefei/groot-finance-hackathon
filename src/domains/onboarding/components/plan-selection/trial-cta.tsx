'use client'

import { Button } from '@/components/ui/button'
import { Check, Sparkles } from 'lucide-react'
import { isNativePlatform } from '@/lib/capacitor/platform'

interface TrialCTAProps {
  onStartTrial: () => void
  isLoading?: boolean
}

export function TrialCTA({ onStartTrial, isLoading = false }: TrialCTAProps) {
  const features = [
    '100 OCR scans included',
    '3 team members',
    'All Pro features',
    'No credit card required'
  ]

  // Hide trial CTA on native iOS
  if (isNativePlatform()) return null

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 sm:p-8">
      {/* Gradient overlay for visual depth */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 space-y-6">
        {/* Header with icon */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
              Start Your 14-Day Free Trial
            </h2>
          </div>
        </div>

        {/* Subtext */}
        <p className="text-sm sm:text-base text-muted-foreground">
          No credit card required • Full access to Pro features
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                <Check className="h-3 w-3 text-primary" />
              </div>
              <span className="text-sm text-foreground">{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onStartTrial}
            disabled={isLoading}
            className="w-full sm:w-auto min-w-[200px] text-base font-semibold"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Starting Trial...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Start Free Trial
              </>
            )}
          </Button>
        </div>

        {/* Additional info */}
        <p className="text-xs text-muted-foreground">
          Cancel anytime during the trial period with no charges
        </p>
      </div>
    </div>
  )
}
