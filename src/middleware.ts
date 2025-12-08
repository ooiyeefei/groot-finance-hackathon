import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Clerk middleware for subdomain authentication
// Note: Subdomain authentication (finance.hellogroot.com, staff.hellogroot.com) works automatically
// when root domain (hellogroot.com) is configured in Clerk Dashboard
// Sign-in redirects are handled by our custom sign-in/sign-up pages
export default clerkMiddleware()

// Middleware configuration
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
  ],
}