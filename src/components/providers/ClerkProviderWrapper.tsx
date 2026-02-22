'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

/**
 * Client-side ClerkProvider wrapper - SINGLE SOURCE OF TRUTH for Clerk config
 *
 * This wrapper allows us to use regex patterns for allowedRedirectOrigins,
 * which can't be serialized from Server Components to Client Components.
 *
 * IMPORTANT: We use the PRODUCTION Clerk instance for both local dev and production.
 * This ensures consistent user IDs across environments (same Supabase user records).
 *
 * Auth Flow:
 * 1. User visits app (localhost:3000 or finance.hellogroot.com)
 * 2. Middleware redirects unauthenticated users to /sign-in
 * 3. Clerk Account Portal (accounts.hellogroot.com) handles authentication
 * 4. After auth, redirects back to the app origin (localhost or production)
 */
export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  // Define allowed redirect origins for Clerk authentication
  // These are the domains Clerk can redirect BACK to after authentication
  // Using regex patterns to match any path under each origin
  const allowedRedirectOrigins = [
    // Local development (uses Clerk dev instance)
    /^http:\/\/localhost:3000(\/.*)?$/,
    /^http:\/\/localhost:3001(\/.*)?$/,

    // Production domains (uses Clerk prod instance)
    /^https:\/\/finance\.hellogroot\.com(\/.*)?$/,
    /^https:\/\/hellogroot\.com(\/.*)?$/,

    // Clerk Account Portal domain
    /^https:\/\/accounts\.hellogroot\.com(\/.*)?$/,

    // Capacitor native app (WebView origin for iOS)
    /^capacitor:\/\/localhost(\/.*)?$/,
  ]

  // NOTE: Clerk appearance is configured in Clerk Dashboard (Customization > Account Portal)
  // Dashboard is set to "Auto" mode which respects user's system light/dark preference
  // Do NOT add local appearance overrides here - they override Dashboard settings

  return (
    <ClerkProvider
      allowedRedirectOrigins={allowedRedirectOrigins}
    >
      {children}
    </ClerkProvider>
  )
}
