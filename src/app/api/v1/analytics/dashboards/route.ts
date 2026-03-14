/**
 * V1 Analytics Dashboards API
 *
 * GET /api/v1/analytics/dashboards - Get financial analytics with optional trends
 * POST /api/v1/analytics/dashboards - Batch analytics for multiple periods
 *
 * Purpose:
 * - Financial analytics with trend comparison
 * - Period selection (month/quarter/year) with custom date ranges
 * - Multi-currency support with home currency conversion
 * - Batch analytics for charts and reports
 *
 * North Star Architecture:
 * - Thin wrapper delegating to analytics.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex } from '@/lib/convex'
import { getAnalyticsPeriod } from '@/domains/analytics/lib/engine'
import {
  calculateFinancialAnalytics,
  calculateAnalyticsTrends
} from '@/domains/analytics/lib/analytics.service'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

// GET - Retrieve financial analytics with optional trends
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserDataConvex(userId)

    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') as 'month' | 'quarter' | 'year' || 'month'
    const homeCurrency = searchParams.get('homeCurrency') as SupportedCurrency || 'MYR'
    const includeTrends = searchParams.get('includeTrends') === 'true'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    console.log(`[Analytics Dashboards V1 API] Fetching analytics for business: ${userData.business_id}`)
    console.log(`[Analytics Dashboards V1 API] Period: ${period}, Currency: ${homeCurrency}, Trends: ${includeTrends}`)

    let startDate: Date
    let endDate: Date

    // Custom date range or standard period
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        }, { status: 400 })
      }

      if (startDate > endDate) {
        return NextResponse.json({
          success: false,
          error: 'Start date must be before end date'
        }, { status: 400 })
      }
    } else {
      // Use standard period - no special overrides needed
      const periodDates = getAnalyticsPeriod(period)
      startDate = periodDates.start
      endDate = periodDates.end
    }

    const options = {
      homeCurrency,
      forceRefresh: false
    }

    if (includeTrends) {
      // Call service layer for trends
      const trendsData = await calculateAnalyticsTrends(userId, { start: startDate, end: endDate }, options)

      return withCacheHeaders(NextResponse.json({
        success: true,
        data: {
          analytics: trendsData.current,
          trends: trendsData.trends,
          previous_period: trendsData.previous
        }
      }), 'volatile')
    } else {
      // Call service layer for analytics only
      const analytics = await calculateFinancialAnalytics(userId, startDate, endDate, options)

      return withCacheHeaders(NextResponse.json({
        success: true,
        data: {
          analytics
        }
      }), 'volatile')
    }

  } catch (error) {
    console.error('[Analytics Dashboards V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

// POST - Batch analytics for multiple periods
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserDataConvex(userId)

    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    const body = await request.json()
    const { periods, homeCurrency = 'SGD' } = body

    if (!Array.isArray(periods) || periods.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Periods array is required'
      }, { status: 400 })
    }

    if (periods.length > 12) {
      return NextResponse.json({
        success: false,
        error: 'Maximum 12 periods allowed per batch request'
      }, { status: 400 })
    }

    console.log(`[Analytics Dashboards V1 API] Batch request for ${periods.length} periods`)

    // Process periods in parallel
    const results = await Promise.all(
      periods.map(async (periodDef: { startDate: string; endDate: string }) => {
        const startDate = new Date(periodDef.startDate)
        const endDate = new Date(periodDef.endDate)

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error(`Invalid date format in period: ${JSON.stringify(periodDef)}`)
        }

        const analytics = await calculateFinancialAnalytics(
          userId,
          startDate,
          endDate,
          { homeCurrency }
        )

        return {
          period: {
            start: periodDef.startDate,
            end: periodDef.endDate
          },
          analytics
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        results,
        total_periods: results.length
      }
    })

  } catch (error) {
    console.error('[Analytics Dashboards V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
