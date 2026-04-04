/**
 * Clerk Shim — DEMO MODE ONLY
 *
 * When DEMO_MODE=true, this replaces ALL '@clerk/nextjs' imports via webpack alias.
 * Provides mock implementations of every Clerk export used in the codebase.
 */

'use client'

import { ReactNode, createElement } from 'react'

const DEMO_USER_ID = 'user_39b0XuoRawLEh1V6G8rrXpfzE6P'

// Mock auth state
const mockAuth = {
  isLoaded: true,
  isSignedIn: true,
  userId: DEMO_USER_ID,
  sessionId: 'demo-session',
  sessionClaims: {
    metadata: {
      role: 'finance_admin',
      permissions: { employee: true, manager: true, finance_admin: true },
    },
  },
  getToken: async () => null,
  signOut: async () => {},
  has: () => true,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  actor: null,
}

const mockUser = {
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

// Client-side hooks
export function useAuth() { return mockAuth }
export function useUser() { return { isLoaded: true, isSignedIn: true, user: mockUser } }
export function useClerk() { return { signOut: async () => {}, openSignIn: () => {}, session: null } }
export function useSession() { return { isLoaded: true, isSignedIn: true, session: null } }
export function useOrganization() { return { isLoaded: true, organization: null } }
export function useSignIn() { return { isLoaded: true, signIn: null, setActive: async () => {} } }
export function useSignUp() { return { isLoaded: true, signUp: null, setActive: async () => {} } }

// Components
export function ClerkProvider({ children }: { children: ReactNode }) { return createElement('div', null, children) }
export function SignIn() { return createElement('div', null, 'Demo Mode — No Sign In Required') }
export function SignUp() { return createElement('div', null, 'Demo Mode — No Sign Up Required') }
export function UserButton() { return createElement('div', { className: 'w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-bold' }, 'K') }
export function SignedIn({ children }: { children: ReactNode }) { return createElement('div', null, children) }
export function SignedOut({ children }: { children: ReactNode }) { return null }
export function RedirectToSignIn() { return null }
export function Protect({ children }: { children: ReactNode }) { return createElement('div', null, children) }
