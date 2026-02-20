/**
 * Billing Catalog API Route
 *
 * Returns the live product catalog with prices resolved for a given currency.
 * Currency detection priority:
 * 1. ?currency= query param
 * 2. Authenticated user's business homeCurrency
 * 3. x-vercel-ip-country header → COUNTRY_TO_CURRENCY map
 * 4. Default: MYR
 *
 * @route GET /api/v1/billing/catalog
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  getCatalog,
  resolvePlanPrice,
  getAvailableCurrencies,
  COUNTRY_TO_CURRENCY,
  type PlanKey,
} from '@/lib/stripe/catalog'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryCurrency = searchParams.get('currency')?.toUpperCase()

    // Resolve currency
    let currency = queryCurrency || null

    // Try authenticated user's business homeCurrency
    if (!currency) {
      try {
        const { userId } = await auth()
        if (userId) {
          const { client } = await getAuthenticatedConvex()
          if (client) {
            // @ts-ignore - Convex API types cause deep type error
            const business = await client.query(api.functions.businesses.getCurrentBusiness)
            if (business?.homeCurrency) {
              currency = business.homeCurrency.toUpperCase()
            }
          }
        }
      } catch {
        // Auth not available (unauthenticated visitor) — continue to geo-IP
      }
    }

    // Try geo-IP from Vercel header
    if (!currency) {
      const country = request.headers.get('x-vercel-ip-country')
      if (country && COUNTRY_TO_CURRENCY[country]) {
        currency = COUNTRY_TO_CURRENCY[country]
      }
    }

    // Default fallback
    if (!currency) {
      currency = 'MYR'
    }

    // Fetch catalog
    const catalog = await getCatalog()
    const availableCurrencies = getAvailableCurrencies(catalog.plans)

    // If requested currency isn't available, fall back to MYR
    if (!availableCurrencies.includes(currency)) {
      currency = 'MYR'
    }

    // Build resolved plans array (excluding trial)
    const paidPlanKeys: PlanKey[] = ['starter', 'pro', 'enterprise']
    const plans = paidPlanKeys.map((key) => {
      const plan = catalog.plans[key]
      const resolved = resolvePlanPrice(plan, currency!)
      return {
        name: plan.planKey,
        displayName: plan.name,
        price: resolved.price,
        currency: resolved.currency,
        priceId: plan.priceId,
        features: plan.features,
        highlightFeatures: plan.highlightFeatures,
        ocrLimit: plan.ocrLimit,
        teamLimit: plan.teamLimit,
        isCustomPricing: plan.isCustomPricing,
        interval: plan.interval,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        plans,
        currency,
        availableCurrencies,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Catalog] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch catalog' },
      { status: 500 }
    )
  }
}
