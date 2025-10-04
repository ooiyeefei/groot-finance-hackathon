'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserLocale } from '@/i18n'

/**
 * Redirect page for Clerk sign-up without locale
 * This handles cases where Clerk redirects to /sign-up instead of /{locale}/sign-up
 * Dynamically detects the best locale for the user
 */
export default function SignUpRedirect() {
  const router = useRouter()

  useEffect(() => {
    // Get the best locale for this user (browser preference or default)
    const locale = getBrowserLocale()

    // Redirect to the appropriate localized sign-up page
    router.replace(`/${locale}/sign-up`)
  }, [router])

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-lg">Redirecting...</div>
    </div>
  )
}