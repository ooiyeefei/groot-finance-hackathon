'use client'

import { useBusinessContext } from '@/contexts/business-context'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

const HIDDEN_PATHS = ['/sign-in', '/sign-up', '/onboarding', '/business-settings']

export function MissingCurrencyBanner() {
  const { isMissingCurrency, isLoadingProfile } = useBusinessContext()
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)

  // Don't show on auth pages, onboarding, or the settings page itself
  const isHiddenPath = HIDDEN_PATHS.some((path) => pathname?.includes(path))

  if (!isMissingCurrency || isLoadingProfile || isHiddenPath || dismissed) return null

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Your business currency is not set.{' '}
            <Link
              href="/business-settings?tab=business-profile"
              className="font-medium underline hover:no-underline"
            >
              Set it in Business Settings
            </Link>{' '}
            to ensure accurate financial reporting.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 p-1"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
