'use client'

/**
 * Business Initialization Page (Deprecated)
 *
 * This page was previously used for Trigger.dev task polling.
 * Business initialization is now synchronous, so this redirects to onboarding.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function InitializingPage() {
  const router = useRouter()
  const locale = useLocale()

  useEffect(() => {
    // Redirect to business onboarding page
    router.replace(`/${locale}/onboarding/business`)
  }, [router, locale])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Redirecting...</span>
      </div>
    </div>
  )
}
