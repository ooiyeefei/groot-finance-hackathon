/**
 * V1 Cash Flow Monitoring API
 *
 * GET /api/v1/analytics/monitoring/cash-flow - Run cash flow monitoring analysis
 *
 * Purpose:
 * - Real-time cash flow monitoring with alerts and projections
 * - 4 Alert Types: Overdue receivables, payment deadlines, currency exposure, cash shortage
 * - 3 Projection Periods: 7-day, 30-day, 90-day forecasts
 * - Risk scoring integration
 *
 * North Star Architecture:
 * - Thin wrapper delegating to analytics.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import {
  runCashFlowMonitoring,
  DEFAULT_MONITORING_CONFIG,
  MonitoringConfig
} from '@/domains/analytics/lib/analytics.service'

// GET - Run cash flow monitoring analysis
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

    // Allow configuration overrides via query params
    const config: MonitoringConfig = {
      ...DEFAULT_MONITORING_CONFIG,
      ...(searchParams.get('cash_reserve_threshold') && {
        cash_reserve_threshold: parseInt(searchParams.get('cash_reserve_threshold')!)
      }),
      ...(searchParams.get('receivable_aging_threshold') && {
        receivable_aging_threshold: parseInt(searchParams.get('receivable_aging_threshold')!)
      }),
      ...(searchParams.get('payment_deadline_window') && {
        payment_deadline_window: parseInt(searchParams.get('payment_deadline_window')!)
      }),
      ...(searchParams.get('currency_exposure_threshold') && {
        currency_exposure_threshold: parseInt(searchParams.get('currency_exposure_threshold')!)
      }),
      ...(searchParams.get('enable_alerts') !== null && {
        enable_alerts: searchParams.get('enable_alerts') === 'true'
      })
    }

    console.log(`[Cash Flow Monitoring V1 API] Running monitoring for business: ${userData.business_id}`)
    console.log(`[Cash Flow Monitoring V1 API] Config:`, config)

    // Call service layer
    const monitoringResult = await runCashFlowMonitoring(userId, config)

    return NextResponse.json({
      success: true,
      data: monitoringResult
    })

  } catch (error) {
    console.error('[Cash Flow Monitoring V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
