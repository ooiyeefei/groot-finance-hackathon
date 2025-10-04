'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserLocale } from '@/i18n'

/**
 * Redirect page for Clerk sign-in without locale
 * This handles cases where Clerk redirects to /sign-in instead of /{locale}/sign-in
 * Dynamically detects the best locale for the user
 */
export default function SignInRedirect() {
  const router = useRouter()

  useEffect(() => {
    // Get the best locale for this user (browser preference or default)
    const locale = getBrowserLocale()

    // Redirect to the appropriate localized sign-in page
    router.replace(`/${locale}/sign-in`)
  }, [router])

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-lg">Redirecting...</div>
    </div>
  )
}