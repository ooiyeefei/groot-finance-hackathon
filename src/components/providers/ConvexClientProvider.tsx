'use client'

import { ConvexReactClient, ConvexProvider } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/nextjs'
import { ReactNode } from 'react'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Create singleton Convex client - reused across renders
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // DEMO MODE: use plain ConvexProvider (no Clerk auth token needed)
  if (DEMO_MODE) {
    return (
      <ConvexProvider client={convex}>
        {children}
      </ConvexProvider>
    )
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
