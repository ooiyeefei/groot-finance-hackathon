import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Clerk middleware with centralized Account Portal
// Note: Subdomain authentication (finance.hellogroot.com, staff.hellogroot.com) works automatically
// when root domain (hellogroot.com) is configured in Clerk Dashboard
export default clerkMiddleware({
  signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || 'https://accounts.hellogroot.com/sign-in',
})

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