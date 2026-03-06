'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isNativePlatform } from '@/lib/capacitor/platform'

/**
 * Client component that redirects native iOS users away from pages
 * that must not be shown per Apple IAP guidelines (e.g. pricing pages).
 */
export function NativePlatformRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (isNativePlatform()) {
      router.replace('/')
    }
  }, [router])

  return null
}
