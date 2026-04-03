'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

/**
 * Client-side ClerkProvider wrapper
 * In DEMO_MODE: renders children directly without Clerk (no auth required)
 * In normal mode: wraps children in ClerkProvider with auth
 */
export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  // DEMO MODE: skip ClerkProvider entirely
  if (DEMO_MODE) {
    return <>{children}</>
  }

  const allowedRedirectOrigins = [
    /^http:\/\/localhost:3000(\/.*)?$/,
    /^http:\/\/localhost:3001(\/.*)?$/,
    /^https:\/\/finance\.hellogroot\.com(\/.*)?$/,
    /^https:\/\/hellogroot\.com(\/.*)?$/,
    /^https:\/\/accounts\.hellogroot\.com(\/.*)?$/,
    /^capacitor:\/\/localhost(\/.*)?$/,
  ]

  return (
    <ClerkProvider
      allowedRedirectOrigins={allowedRedirectOrigins}
    >
      {children}
    </ClerkProvider>
  )
}
