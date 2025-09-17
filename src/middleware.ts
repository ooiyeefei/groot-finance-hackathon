/**
 * Middleware for role-based route protection
 * Following Clerk RBAC best practices
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/trigger(.*)', // Trigger.dev CLI integration endpoint
  '/api/internal/(.*)', // Internal service APIs with their own authentication
  '/api/pdf-proxy(.*)', // PDF proxy handles its own authentication for government documents
  '/manifest.json', // PWA manifest file should be publicly accessible
])

// Special routes that need authentication but bypass role checks
const isSpecialAuthRoute = createRouteMatcher([
  '/api/user/assign-admin(.*)', // Admin assignment API (validates master key internally)
])

// Define role-based route matchers following Clerk patterns
const isManagerRoute = createRouteMatcher([
  '/manager(.*)',
  '/api/expense-claims/approvals(.*)'
])

// Admin setup should be accessible to authenticated users (for master key assignment)
const isAdminSetupRoute = createRouteMatcher([
  '/admin/setup(.*)'
])

const isAdminRoute = createRouteMatcher([
  '/admin/((?!setup).*)', // Admin routes except setup
  '/finance(.*)',
  '/api/user/team(.*)'
])

// Routes that need different method-based protection
const isAdminOnlyForUpdates = createRouteMatcher([
  '/api/user/role(.*)'
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}