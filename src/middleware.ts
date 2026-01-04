import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

/**
 * Check trial expiration status for a Clerk user
 * Uses service role client for fast DB queries (bypasses RLS)
 *
 * @param clerkUserId - Clerk user ID from auth()
 * @returns Object with isExpired boolean and businessId
 */
async function checkTrialExpiration(clerkUserId: string): Promise<{
  isExpired: boolean
  businessId: string | null
}> {
  try {
    // Create service role client for fast queries (no RLS overhead)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get user's business_id from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (userError || !user || !user.business_id) {
      // No business found - let them through to onboarding
      return { isExpired: false, businessId: null }
    }

    // Query business for trial status
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('plan_name, subscription_status, trial_end_date')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      // Business not found - likely deleted. Treat as "no business" case
      // This will trigger redirect to onboarding where auto-recovery can happen
      console.warn('[Middleware] Business not found for user - likely deleted:', {
        businessId: user.business_id,
        error: businessError?.message || 'No business record found'
      })
      return { isExpired: false, businessId: null }  // Return null to trigger onboarding redirect
    }

    // Only check trial expiration for trial/free plan users
    // 'trial' is the current plan name, 'free' is legacy (kept for backward compatibility)
    const isTrialPlan = business.plan_name === 'trial' || business.plan_name === 'free'
    if (!isTrialPlan) {
      return { isExpired: false, businessId: user.business_id }
    }

    // Check if trial has expired using subscription_status (Stripe source of truth)
    // 'paused' = trial ended without payment method (needs upgrade via Checkout)
    const isPaused = business.subscription_status === 'paused'

    // Also check trial_end_date as fallback (synced from Stripe)
    let dateExpired = false
    if (business.trial_end_date) {
      try {
        const endDate = new Date(business.trial_end_date)
        dateExpired = endDate < new Date()
      } catch {
        // Invalid date format - ignore
      }
    }

    const expired = isPaused || dateExpired

    return {
      isExpired: expired,
      businessId: user.business_id,
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

  // Check if already on onboarding or billing pages
  const isOnboardingOrBilling =
    pathname.includes('/onboarding/') ||
    pathname.includes('/billing/') ||
    pathname.includes('/settings/billing')

  // T048: If user has no business (hasn't completed onboarding), redirect to onboarding
  if (!trialStatus.businessId && !isOnboardingOrBilling) {
    const onboardingUrl = new URL(`/${locale}/onboarding/business`, req.url)
    console.log(`[Middleware] User ${userId} has no business - redirecting to onboarding`)
    return NextResponse.redirect(onboardingUrl)
  }

  // If trial is expired, redirect to plan selection page
  if (trialStatus.isExpired && !isOnboardingOrBilling) {
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
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
  ],
}