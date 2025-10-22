'use client'

import { useState, useEffect } from 'react'
import { X, Info, AlertTriangle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTranslations } from 'next-intl'

export type DisclaimerVariant = 'banner' | 'card' | 'footer' | 'modal'
export type DisclaimerType = 'chat' | 'ocr-document' | 'ocr-receipt' | 'general'

interface FinancialDisclaimerProps {
  variant: DisclaimerVariant
  type: DisclaimerType
  className?: string
  isDismissible?: boolean
  persistDismissal?: boolean
  onDismiss?: () => void
}

const getDisclaimerContent = (type: DisclaimerType, t: any) => {
  const contentMap = {
    chat: {
      text: t('chat'),
      icon: Shield,
      color: 'blue'
    },
    'ocr-document': {
      text: t('ocrDocument'),
      icon: AlertTriangle,
      color: 'amber'
    },
    'ocr-receipt': {
      text: t('ocrReceipt'),
      icon: AlertTriangle,
      color: 'amber'
    },
    general: {
      text: t('general'),
      icon: Info,
      color: 'gray'
    }
  }

  return contentMap[type]
}

const colorClasses = {
  blue: {
    banner: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300',
    card: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700',
    icon: 'text-blue-600 dark:text-blue-400',
    button: 'text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100'
  },
  amber: {
    banner: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300',
    card: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700',
    icon: 'text-amber-600 dark:text-amber-400',
    button: 'text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100'
  },
  gray: {
    banner: 'bg-muted/50 border-border text-muted-foreground',
    card: 'bg-card border-border',
    icon: 'text-muted-foreground',
    button: 'text-muted-foreground hover:text-foreground'
  }
}

export function FinancialDisclaimer({
  variant,
  type,
  className = '',
  isDismissible = false,
  persistDismissal = true,
  onDismiss
}: FinancialDisclaimerProps) {
  const t = useTranslations('disclaimers')
  const [isDismissed, setIsDismissed] = useState(false)
  const content = getDisclaimerContent(type, t)
  const colors = colorClasses[content.color as keyof typeof colorClasses]
  const storageKey = `disclaimer-dismissed-${type}`

  useEffect(() => {
    if (persistDismissal && isDismissible) {
      const dismissed = localStorage.getItem(storageKey)
      if (dismissed === 'true') {
        setIsDismissed(true)
      }
    }
  }, [persistDismissal, isDismissible, storageKey])

  const handleDismiss = () => {
    setIsDismissed(true)
    if (persistDismissal) {
      localStorage.setItem(storageKey, 'true')
    }
    onDismiss?.()
  }

  if (isDismissed) return null

  const IconComponent = content.icon

  // Banner variant - for chat interfaces
  if (variant === 'banner') {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${colors.banner} ${className}`}>
        <IconComponent className={`w-5 h-5 flex-shrink-0 ${colors.icon}`} />
        <p className="text-sm flex-1">{content.text}</p>
        {isDismissible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className={`h-auto p-1 ${colors.button}`}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    )
  }

  // Card variant - for OCR results
  if (variant === 'card') {
    return (
      <Card className={`${colors.card} ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon}`} />
            <div className="flex-1">
              <p className="text-sm text-foreground">{content.text}</p>
            </div>
            {isDismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className={`h-auto p-1 ${colors.button}`}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Footer variant - for general app areas
  if (variant === 'footer') {
    return (
      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${colors.banner} ${className}`}>
        <IconComponent className={`w-3 h-3 flex-shrink-0 ${colors.icon}`} />
        <span className="text-xs opacity-80">{content.text}</span>
      </div>
    )
  }

  // Modal variant - for first-time notices
  if (variant === 'modal') {
    return (
      <Alert className={`${colors.card} ${className}`}>
        <IconComponent className={`h-4 w-4 ${colors.icon}`} />
        <AlertDescription className="text-foreground">
          {content.text}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

// Specific disclaimer components for easy import
export function ChatDisclaimer(props: Omit<FinancialDisclaimerProps, 'type' | 'variant'>) {
  return (
    <FinancialDisclaimer
      type="chat"
      variant="banner"
      isDismissible={true}
      persistDismissal={true}
      {...props}
    />
  )
}

export function DocumentOCRDisclaimer(props: Omit<FinancialDisclaimerProps, 'type' | 'variant'>) {
  return (
    <FinancialDisclaimer
      type="ocr-document"
      variant="card"
      isDismissible={false}
      {...props}
    />
  )
}

export function ReceiptOCRDisclaimer(props: Omit<FinancialDisclaimerProps, 'type' | 'variant'>) {
  return (
    <FinancialDisclaimer
      type="ocr-receipt"
      variant="card"
      isDismissible={false}
      {...props}
    />
  )
}

export function GeneralDisclaimer(props: Omit<FinancialDisclaimerProps, 'type' | 'variant'>) {
  return (
    <FinancialDisclaimer
      type="general"
      variant="footer"
      {...props}
    />
  )
}