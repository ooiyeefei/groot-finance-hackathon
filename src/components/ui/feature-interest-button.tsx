'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Heart, Check } from 'lucide-react'
import { useFeatureInterest } from '@/hooks/use-feature-interest'

interface FeatureInterestButtonProps {
  featureName: string
  className?: string
}

export function FeatureInterestButton({ featureName, className }: FeatureInterestButtonProps) {
  const { registerInterest, hasRegistered, isLoading } = useFeatureInterest(featureName)

  if (hasRegistered) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={className}
      >
        <Check className="h-3.5 w-3.5 mr-1.5" />
        Thanks! We&apos;ll notify you
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={registerInterest}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Heart className="h-3.5 w-3.5 mr-1.5" />
      )}
      I want this!
    </Button>
  )
}
