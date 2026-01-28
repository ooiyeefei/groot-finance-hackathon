import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

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
  '/api/v1/billing/webhooks(.*)',
  '/api/v1/system/webhooks(.*)',
  '/api/health(.*)',
  // Static/public pages
  '/:locale/pricing(.*)',
  '/pricing(.*)',
  // Onboarding routes (allowed for expired trial users)
  '/:locale/onboarding(.*)',
  '/onboarding(.*)',
  // Billing routes (allowed for expired trial users)
  '/:locale/billing(.*)',
  '/billing(.*)',
  '/:locale/settings/billing(.*)',
  '/settings/billing(.*)',
])

// Check if request is an API route
const isApiRoute = (req: NextRequest) => {
  return req.nextUrl.pathname.startsWith('/api/')
}

// Initialize Convex HTTP client for middleware queries
function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
  }
  return new ConvexHttpClient(url)
}

/**
 * Check trial expiration status for a Clerk user
 * Uses Convex HTTP client for fast DB queries (no auth required)
 *
 * @param clerkUserId - Clerk user ID from auth()
 * @returns Object with isExpired boolean and businessId
 */
async function checkTrialExpiration(clerkUserId: string): Promise<{
  isExpired: boolean
  businessId: string | null
}> {
  try {
    const convex = getConvexClient()

    // Query Convex for trial status using the middleware-specific query
    // Use bracket notation to avoid TypeScript deep instantiation issue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businesses = (api.functions as any).businesses
    const result = await convex.query(businesses.getTrialStatusByClerkId, { clerkUserId }) as {
      isExpired: boolean
      businessId: string | null
    }

    return {
      isExpired: result.isExpired,
      businessId: result.businessId,
    }
  } catch (error) {
    console.error('[Middleware] Error checking trial expiration:', error)
    // On error, fail open (allow access)
    return { isExpired: false, businessId: null }
  }
}

// Clerk middleware with route protection and trial expiration checking
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

  // ✅ User is authenticated - now check trial expiration
  // Skip trial check for API routes (handled by API route logic)
  if (isApiRoute(req)) {
    return NextResponse.next()
  }

  // Check trial expiration status
  const trialStatus = await checkTrialExpiration(userId)

  const pathname = req.nextUrl.pathname
  const localeMatch = pathname.match(/^\/([a-z]{2})\//)
  const locale = localeMatch ? localeMatch[1] : 'en'

  // Check if already on onboarding, billing, or invitation pages
  // NOTE: Invitation pages must be exempt because invited users don't have a business yet
  // They need to reach the invitation acceptance page to join a business
  const isOnboardingOrBillingOrInvitation =
    pathname.includes('/onboarding/') ||
    pathname.includes('/billing/') ||
    pathname.includes('/settings/billing') ||
    pathname.includes('/invitations/')

  // T048: If user has no business (hasn't completed onboarding), redirect to onboarding
  if (!trialStatus.businessId && !isOnboardingOrBillingOrInvitation) {
    const onboardingUrl = new URL(`/${locale}/onboarding/business`, req.url)
    console.log(`[Middleware] User ${userId} has no business - redirecting to onboarding`)
    return NextResponse.redirect(onboardingUrl)
  }

  // If trial is expired, redirect to plan selection page
  if (trialStatus.isExpired && !isOnboardingOrBillingOrInvitation) {
    const planSelectionUrl = new URL(`/${locale}/onboarding/plan-selection`, req.url)
    planSelectionUrl.searchParams.set('trial_expired', 'true')
    console.log(`[Middleware] Trial expired for user ${userId} - redirecting to plan selection`)
    return NextResponse.redirect(planSelectionUrl)
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
     * - public folder assets (images, icons, sw.js, manifest.json)
     *
     * NOTE: sw.js and manifest.json MUST be excluded or PWA registration fails
     * with "Service worker script is behind a redirect" error
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    '/(api|trpc)(.*)',
  ],
}