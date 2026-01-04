'use client'

import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/nextjs'
import { ReactNode } from 'react'

/**
 * Convex Client Provider - Integrates Convex with Clerk authentication
 *
 * This provider:
 * 1. Creates a singleton Convex client connected to our deployment
 * 2. Integrates with Clerk for authenticated queries/mutations
 * 3. Enables real-time subscriptions with automatic auth token refresh
 *
 * Usage: Wrap your app inside ClerkProvider, then use this provider
 *
 * Architecture:
 * ClerkProvider
 *   └── ConvexClientProvider (this component)
 *         └── ConvexProviderWithClerk
 *               └── Your App (can now use useQuery, useMutation)
 */

// Create singleton Convex client - reused across renders
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
