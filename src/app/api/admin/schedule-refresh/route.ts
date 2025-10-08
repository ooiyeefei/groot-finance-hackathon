/**
 * DEPRECATED: Scheduled Refresh Management API
 * This API is deprecated as financial analytics now use RPC functions for performance
 * RPC functions provide real-time results without the need for scheduled refreshes
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'

// DEPRECATED: Schedule refresh
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[Schedule Refresh API] DEPRECATED: Scheduled refresh no longer needed for user ${userId}`)
    console.log('[Schedule Refresh API] Financial analytics now use RPC functions for real-time performance')

    return NextResponse.json({
      success: true,
      deprecated: true,
      message: 'Scheduled refresh is deprecated. Financial analytics now use RPC functions for optimal performance.',
      data: {
        task_id: 'deprecated',
        schedule_type: 'deprecated',
        delay_minutes: 0,
        views: [],
        scheduled_at: new Date().toISOString(),
        estimated_execution: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Schedule Refresh API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'API is deprecated'
      },
      { status: 410 }
    )
  }
}

// DEPRECATED: Check scheduled refresh status
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[Schedule Refresh API] DEPRECATED: Status check no longer needed for user ${userId}`)
    console.log('[Schedule Refresh API] Financial analytics now use RPC functions for real-time performance')

    return NextResponse.json({
      success: true,
      deprecated: true,
      message: 'Scheduled refresh status is deprecated. Financial analytics now use RPC functions for optimal performance.',
      data: {
        recent_refreshes: [],
        scheduling_info: {
          available_views: [],
          supported_schedules: [],
          max_delay_minutes: 0
        }
      }
    })

  } catch (error) {
    console.error('[Schedule Refresh API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'API is deprecated'
      },
      { status: 410 }
    )
  }
}