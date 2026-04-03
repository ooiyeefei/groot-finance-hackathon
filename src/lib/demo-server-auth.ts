/**
 * Demo-safe server-side auth — drop-in for Clerk's auth().
 * In DEMO_MODE: returns hardcoded demo user without calling Clerk.
 * In normal mode: delegates to Clerk auth().
 */

import { auth as clerkAuth, currentUser as clerkCurrentUser, clerkClient as realClerkClient } from '@clerk/nextjs/server'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

const DEMO_AUTH_RESULT = {
  userId: 'user_39b0XuoRawLEh1V6G8rrXpfzE6P',
  sessionId: 'demo-session',
  sessionClaims: {
    metadata: {
      role: 'finance_admin',
      permissions: { employee: true, manager: true, finance_admin: true },
    },
  },
  getToken: async () => null,
  has: () => true,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  actor: null,
  redirectToSignIn: () => { throw new Error('Demo mode') },
  protect: () => DEMO_AUTH_RESULT,
} as any

export async function auth() {
  if (DEMO_MODE) return DEMO_AUTH_RESULT
  return clerkAuth()
}

export async function currentUser() {
  if (DEMO_MODE) {
    return {
      id: 'user_39b0XuoRawLEh1V6G8rrXpfzE6P',
      firstName: 'Kate',
      lastName: 'Admin',
      fullName: 'Finance Admin Kate',
      username: 'demo-admin',
      primaryEmailAddress: { emailAddress: 'yeefei+test2@hellogroot.com' },
      emailAddresses: [{ emailAddress: 'yeefei+test2@hellogroot.com' }],
      imageUrl: null,
    } as any
  }
  return clerkCurrentUser()
}

export { realClerkClient as clerkClient }
