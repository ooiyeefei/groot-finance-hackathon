/**
 * Middleware for internationalization and role-based route protection
 * Combines next-intl locale detection with Clerk RBAC
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n'

// Create intl middleware for locale detection
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'
})

// Public routes that don't require authentication (with locale support)
const isPublicRoute = createRouteMatcher([
  '/', // Root redirect page
  '/(en|th|id|zh)', // Main locale home pages
  '/(en|th|id|zh)?/sign-in(.*)',
  '/(en|th|id|zh)?/sign-up(.*)',
  '/ai-assistant', // AI Assistant should be accessible (will redirect to localized version)
  '/(en|th|id|zh)?/ai-assistant(.*)', // Localized AI Assistant pages
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

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Skip intl middleware for API routes to avoid locale prefixing
  let intlResponse: NextResponse | Response | undefined
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    // Apply intl middleware for non-API routes to handle locale detection and redirects
    intlResponse = intlMiddleware(req)

    // If intl middleware returns a redirect (for locale detection), return it immediately
    if (intlResponse && (intlResponse.status === 301 || intlResponse.status === 302)) {
      return intlResponse
    }
  }

  // Handle public routes that don't require authentication
  if (isPublicRoute(req)) {
    return intlResponse || NextResponse.next()
  }

  // For protected routes, require authentication
  const { userId, sessionClaims } = await auth.protect()
  
  // Get user role from session claims (Clerk metadata)
  const userPermissions = (sessionClaims?.metadata as any)?.permissions as { 
    employee?: boolean; 
    manager?: boolean; 
    admin?: boolean; 
  }

  // Allow admin setup and special auth routes for all authenticated users
  if (isAdminSetupRoute(req) || isSpecialAuthRoute(req)) {
    console.log(`[Middleware] Allowing special route access for authenticated user: ${userId} -> ${req.url}`)
    // Continue to next middleware/route - no additional checks needed
  }
  // Protect manager routes
  else if (isManagerRoute(req)) {
    if (!userPermissions?.manager && !userPermissions?.admin) {
      console.log(`[Middleware] Access denied: ${req.url} - User ${userId} lacks manager permissions`)
      return NextResponse.redirect(new URL('/?error=insufficient-permissions', req.url))
    }
  }
  // Protect admin routes
  else if (isAdminRoute(req)) {
    if (!userPermissions?.admin) {
      console.log(`[Middleware] Access denied: ${req.url} - User ${userId} lacks admin permissions`)
      return NextResponse.redirect(new URL('/?error=insufficient-permissions', req.url))
    }
  }

  // Protect admin-only operations on specific routes (only for PUT/DELETE methods)
  if (isAdminOnlyForUpdates(req)) {
    if ((req.method === 'PUT' || req.method === 'DELETE') && !userPermissions?.admin) {
      console.log(`[Middleware] Access denied: ${req.method} ${req.url} - User ${userId} lacks admin permissions`)
      return NextResponse.redirect(new URL('/?error=insufficient-permissions', req.url))
    }
  }

  // Add user context headers for API routes
  const response = NextResponse.next()
  response.headers.set('x-user-id', userId)
  response.headers.set('x-user-role', (sessionClaims?.metadata as any)?.role || 'employee')

  return response
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|manifest\\.json|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Run for locale-prefixed routes
    '/(en|th|id|zh)/(.*)',
  ],
}