/**
 * DEPRECATED: Materialized Views Management API
 * This API is deprecated as financial analytics now use RPC functions for performance
 * RPC functions provide real-time results without the need for materialized views
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

// DEPRECATED: Fetch refresh history and status
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Materialized Views API] DEPRECATED: This API is no longer needed')
    console.log('[Materialized Views API] Financial analytics now use RPC functions for real-time performance')

    return NextResponse.json({
      success: true,
      deprecated: true,
      message: 'Materialized views are deprecated. Financial analytics now use RPC functions for optimal performance.',
      data: {
        view_name: 'deprecated',
        total_rows: 0,
        last_refresh: null,
        refresh_history: [],
        pagination: { limit: 0, total: 0, has_more: false }
      }
    })

  } catch (error) {
    console.error('[Materialized Views API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'API is deprecated'
      },
      { status: 410 }
    )
  }
}

// DEPRECATED: Trigger manual refresh
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[Materialized Views API] DEPRECATED: Manual refresh no longer needed for user ${userId}`)
    console.log('[Materialized Views API] Financial analytics now use RPC functions for real-time performance')

    return NextResponse.json({
      success: true,
      deprecated: true,
      message: 'Manual refresh is deprecated. Financial analytics now use RPC functions for optimal performance.',
      data: {
        view_name: 'deprecated',
        refresh_triggered: false,
        refresh_result: null
      }
    })

  } catch (error) {
    console.error('[Materialized Views API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'API is deprecated'
      },
      { status: 410 }
    )
  }
}