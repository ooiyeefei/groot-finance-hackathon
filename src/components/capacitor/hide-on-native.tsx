'use client'

import { useEffect, useState } from 'react'
import { isNativePlatform } from '@/lib/capacitor/platform'

/**
 * Hides children when running inside Capacitor native shell (iOS/Android).
 * Useful for hiding sign-up links and other content Apple disallows.
 */
export function HideOnNative({ children }: { children: React.ReactNode }) {
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isNativePlatform())
  }, [])

  if (isNative) return null
  return <>{children}</>
}
