import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  // Auth pages
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  // Public API routes (webhooks, health checks)
  '/api/webhooks(.*)',
  '/api/v1/webhooks(.*)',
  '/api/health(.*)',
  // Static/public pages
  '/:locale/pricing(.*)',
  '/pricing(.*)',
])

// Check if request is an API route
const isApiRoute = (req: NextRequest) => {
  return req.nextUrl.pathname.startsWith('/api/')
}

// Clerk middleware with route protection
// Redirects unauthenticated users to sign-in page (pages only, not API)
export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Protect all other routes - redirect to sign-in if not authenticated
  const { userId } = await auth()

  if (!userId) {
    // API routes: return 401 JSON response (don't redirect to HTML)
    if (isApiRoute(req)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }

    // Page routes: redirect to sign-in page
    const pathname = req.nextUrl.pathname
    const localeMatch = pathname.match(/^\/([a-z]{2})\//)
    const locale = localeMatch ? localeMatch[1] : 'en'

    const signInUrl = new URL(`/${locale}/sign-in`, req.url)
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
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