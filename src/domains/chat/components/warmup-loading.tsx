'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface WarmupLoadingProps {
  isVisible: boolean
  isColdStart: boolean
}

export default function WarmupLoading({ isVisible, isColdStart }: WarmupLoadingProps) {
  const t = useTranslations('chat')

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-8 max-w-md mx-4 text-center shadow-lg">
        {/* Animated sparkle icon */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 animate-ping bg-primary/20 rounded-full" />
          <div className="absolute inset-2 animate-pulse bg-primary/30 rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary animate-bounce" />
          </div>
        </div>

        {/* Fun message */}
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {t('warmupTitle') || 'Summoning your AI assistant...'}
        </h3>

        <p className="text-muted-foreground text-sm mb-4">
          {isColdStart
            ? (t('warmupColdStart') || 'First visit magic takes a moment. Just once!')
            : (t('warmupLoading') || 'Almost there...')
          }
        </p>

        {/* Animated dots */}
        <div className="flex justify-center gap-1.5">
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}
