'use client'

/**
 * Demo-safe auth hooks — drop-in replacements for Clerk's useAuth/useUser.
 * In DEMO_MODE: returns hardcoded demo user (no Clerk needed).
 * In normal mode: delegates to Clerk.
 */

import { useAuth as clerkUseAuth, useUser as clerkUseUser } from '@clerk/nextjs'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function useSafeAuth() {
  if (DEMO_MODE) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_39b0XuoRawLEh1V6G8rrXpfzE6P',
      sessionId: 'demo-session',
      getToken: async () => null,
    }
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return clerkUseAuth()
}

export function useSafeUser() {
  if (DEMO_MODE) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_39b0XuoRawLEh1V6G8rrXpfzE6P',
        fullName: 'Finance Admin Kate',
        primaryEmailAddress: { emailAddress: 'demo@financecopilot.ai' },
        imageUrl: null,
      },
    }
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return clerkUseUser()
}
