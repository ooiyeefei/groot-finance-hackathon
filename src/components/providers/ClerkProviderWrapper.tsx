'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

/**
 * Client-side ClerkProvider wrapper
 * Always wraps in ClerkProvider (keeps hooks working).
 * In DEMO_MODE, auth checks are bypassed via useSafeAuth/useSafeUser hooks.
 */
export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  const allowedRedirectOrigins = [
    /^http:\/\/localhost:3000(\/.*)?$/,
    /^http:\/\/localhost:3001(\/.*)?$/,
    /^https:\/\/finance\.hellogroot\.com(\/.*)?$/,
    /^https:\/\/hellogroot\.com(\/.*)?$/,
    /^https:\/\/accounts\.hellogroot\.com(\/.*)?$/,
    /^capacitor:\/\/localhost(\/.*)?$/,
    /^https:\/\/.*\.vercel\.app(\/.*)?$/,
  ]

  return (
    <ClerkProvider
      allowedRedirectOrigins={allowedRedirectOrigins}
    >
      {children}
    </ClerkProvider>
  )
}
