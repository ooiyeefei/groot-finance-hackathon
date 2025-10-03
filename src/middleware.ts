/**
 * Simplified Clerk-only middleware for authentication testing
 * This bypasses next-intl to focus on getting Clerk authentication working
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/en',
  '/en/sign-in(.*)',
  '/en/sign-up(.*)',
  '/en/test-business-context(.*)',
  '/en/test-dashboard(.*)',
  '/api/health(.*)',
  '/api/trigger(.*)', // Trigger.dev CLI integration endpoint
  '/api/internal/(.*)', // Internal service APIs with their own authentication
  '/api/pdf-proxy(.*)', // PDF proxy handles its own authentication for government documents
  '/api/clerk/webhook(.*)', // Clerk webhook for user synchronization
  '/api/user/assign-admin(.*)', // Admin assignment with master key (no auth required)
  '/manifest.json', // PWA manifest file should be publicly accessible
  '/manifest(.*)', // Any manifest-related requests
])

// Special routes that need authentication but bypass role checks
const isSpecialAuthRoute = createRouteMatcher([
  // Currently no routes - admin assignment moved to public routes
])

// Define role-based route matchers following Clerk patterns (with locale support)
const isManagerRoute = createRouteMatcher([
  '/(en|th|id|zh)?/manager(.*)',
  '/(en|th|id|zh)?/api/expense-claims/approvals(.*)'
])

// Admin setup should be accessible to authenticated users (for master key assignment)
const isAdminSetupRoute = createRouteMatcher([
  '/(en|th|id|zh)?/admin/setup(.*)'
])

const isAdminRoute = createRouteMatcher([
  '/(en|th|id|zh)?/admin/((?!setup).*)', // Admin routes except setup
  '/(en|th|id|zh)?/finance(.*)',
  '/(en|th|id|zh)?/api/user/team(.*)'
])

// Routes that need different method-based protection
const isAdminOnlyForUpdates = createRouteMatcher([
  '/(en|th|id|zh)?/api/user/role(.*)'
])

export default clerkMiddleware(async (auth, req) => {
  // Handle public routes
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Protect all other routes
  const { userId } = await auth.protect()

  console.log(`[Middleware] Authenticated user: ${userId} accessing: ${req.url}`)

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}