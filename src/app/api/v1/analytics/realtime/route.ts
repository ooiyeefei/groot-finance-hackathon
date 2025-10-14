/**
 * V1 Analytics Realtime API
 *
 * GET /api/v1/analytics/realtime - Get real-time dashboard metrics
 *
 * Purpose:
 * - Real-time dashboard metrics using optimized RPC function
 * - Fast performance with database-side computation
 * - Returns empty analytics for no data (graceful degradation)
 *
 * North Star Architecture:
 * - Thin wrapper delegating to analytics.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { getRealtimeMetrics } from '@/domains/analytics/lib/analytics.service'

// GET - Retrieve real-time dashboard metrics
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    let startDate: string
    let endDate: string

    // Use provided dates or default to current month
    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      startDate = firstDay.toISOString().split('T')[0]
      endDate = lastDay.toISOString().split('T')[0]
    }

    console.log(`[Analytics Realtime V1 API] Fetching realtime metrics for business: ${userData.business_id}`)
    console.log(`[Analytics Realtime V1 API] Date range: ${startDate} to ${endDate}`)

    // Call service layer
    const analytics = await getRealtimeMetrics(userId, startDate, endDate)

    return NextResponse.json({
      success: true,
      data: {
        analytics
      }
    })

  } catch (error) {
    console.error('[Analytics Realtime V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
