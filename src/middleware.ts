/**
 * Enhanced middleware for authentication and business context protection
 * Uses wildcard patterns for automatic route protection without manual page updates
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
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
  '/(en|th|id|zh)?/invitations/accept(.*)', // Invitation acceptance pages (public)
  '/invitations/accept(.*)', // Invitation acceptance (fallback without locale)
  '/api/invitations/accept(.*)', // Invitation acceptance API (public)
])

// Routes that need authentication but NOT business context (onboarding flow)
const isOnboardingRoute = createRouteMatcher([
  '/(en|th|id|zh)?/onboarding(.*)', // Business creation flow
])

// Routes that need business context protection (automatically catches ALL new routes)
const needsBusinessContext = createRouteMatcher([
  '/(en|th|id|zh)?/applications(.*)', // All application routes
  '/(en|th|id|zh)?/invoices(.*)', // All invoice/document routes
  '/(en|th|id|zh)?/expense-claims(.*)', // All expense claim routes
  '/(en|th|id|zh)?/accounting(.*)', // Accounting routes
  '/(en|th|id|zh)?/manager(.*)', // Manager routes
  '/(en|th|id|zh)?/admin(.*)', // Admin routes (except setup)
  '/(en|th|id|zh)?/settings(.*)', // Settings routes
  '/(en|th|id|zh)?/ai-assistant(.*)', // AI assistant routes
  '/(en|th|id|zh)?/chat(.*)', // Chat routes
  '/(en|th|id|zh)?/(.*)', // Dashboard root (with optional locale)
  '/', // Root dashboard
  '/api/applications(.*)', // Application APIs
  '/api/invoices(.*)', // Invoice APIs
  '/api/expense-claims(.*)', // Expense claim APIs
  '/api/transactions(.*)', // Transaction APIs
  '/api/business/((?!create).*)', // Business APIs except creation
  '/api/accounting-entries(.*)', // Accounting APIs
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
  // Handle public routes (includes legitimate public API routes)
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // SECURITY: Protect ALL routes (both pages and API routes) with authentication
  const { userId } = await auth.protect()

  const isApiRoute = req.nextUrl.pathname.startsWith('/api/')

  // Handle onboarding routes (authenticated but no business context needed)
  if (isOnboardingRoute(req)) {
    if (isApiRoute) {
      console.log(`[Middleware] Onboarding API route: ${req.nextUrl.pathname} - user: ${userId}`)
    } else {
      console.log(`[Middleware] Onboarding page route: ${req.nextUrl.pathname} - user: ${userId}`)
    }
    return NextResponse.next()
  }

  // Check if route needs business context protection
  if (needsBusinessContext(req)) {
    try {
      // CRITICAL FIX: Don't check for tokens in middleware - let business context provider handle redirects
      // The business context provider will check for actual business memberships and redirect if needed
      // This avoids JWT token timing issues after business creation

      if (isApiRoute) {
        console.log(`[Middleware] Business-protected API route: ${req.nextUrl.pathname} - user: ${userId}`)
      } else {
        console.log(`[Middleware] Business-protected page route: ${req.nextUrl.pathname} - user: ${userId}`)
      }

      // Let request proceed - business context provider will handle actual validation

    } catch (error) {
      console.error(`[Middleware] Error checking business context for user ${userId}:`, error)
      const locale = req.nextUrl.pathname.match(/^\/(en|th|id|zh)/)?.[1] || 'en'
      return NextResponse.redirect(new URL(`/${locale}/onboarding/business`, req.url))
    }
  } else {
    // Routes that don't need business context but are authenticated
    if (isApiRoute) {
      console.log(`[Middleware] Protected API route: ${req.nextUrl.pathname} - user: ${userId}`)
    } else {
      console.log(`[Middleware] Protected page route: ${req.nextUrl.pathname} - user: ${userId}`)
    }
  }

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