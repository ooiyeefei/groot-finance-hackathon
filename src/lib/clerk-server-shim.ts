/**
 * Clerk Server Shim — DEMO MODE ONLY
 *
 * Replaces '@clerk/nextjs/server' via webpack alias in demo mode.
 */

const DEMO_USER_ID = 'user_39b0XuoRawLEh1V6G8rrXpfzE6P'

const DEMO_AUTH = {
  userId: DEMO_USER_ID,
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
  protect: () => DEMO_AUTH,
}

const DEMO_USER = {
  id: DEMO_USER_ID,
  firstName: 'Kate',
  lastName: 'Admin',
  fullName: 'Finance Admin Kate',
  username: 'demo-admin',
  primaryEmailAddress: { emailAddress: 'yeefei+test2@hellogroot.com' },
  emailAddresses: [{ emailAddress: 'yeefei+test2@hellogroot.com' }],
  imageUrl: null,
  publicMetadata: {},
  unsafeMetadata: {},
}

export async function auth() { return DEMO_AUTH }
export async function currentUser() { return DEMO_USER }
export function clerkMiddleware(handler?: any) {
  // Return a middleware that just passes through
  return async (req: any) => {
    if (handler) {
      const authFn = async () => DEMO_AUTH
      return handler(authFn, req)
    }
    const { NextResponse } = await import('next/server')
    return NextResponse.next()
  }
}
export function createRouteMatcher(routes: string[]) {
  return () => false
}
export function clerkClient() {
  return { users: { getUser: async () => DEMO_USER, updateUser: async () => DEMO_USER } }
}
