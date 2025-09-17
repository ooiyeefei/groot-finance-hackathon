/**
 * Scheduled Refresh Management API
 * Sets up periodic materialized view refreshes via Trigger.dev
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Check if user has admin/finance permissions
    const { data: employeeProfile } = await supabase
      .from('employee_profiles')
      .select('role_permissions')
      .eq('user_id', userId)
      .single()

    if (!employeeProfile?.role_permissions?.admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { 
      schedule_type = 'immediate', 
      delay_minutes = 0,
      views = ['financial_analytics_mv'],
      force_refresh = false 
    } = await request.json()

    console.log(`[Schedule Refresh API] Scheduling ${schedule_type} refresh for views: ${views.join(', ')} by user ${userId}`)

    let taskResult

    if (schedule_type === 'immediate') {
      // Trigger immediate refresh
      taskResult = await tasks.trigger('refresh-materialized-views', {
        views,
        force_refresh,
        triggered_by: `manual_${userId}`
      })
    } else if (schedule_type === 'delayed' && delay_minutes > 0) {
      // Schedule delayed refresh (useful for maintenance windows)
      const delayString = `${delay_minutes}m` // Convert to string format: "30m", "60m", etc.
      taskResult = await tasks.trigger('refresh-materialized-views', {
        views,
        force_refresh,
        triggered_by: `scheduled_delayed_${userId}`
      }, {
        delay: delayString
      })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid schedule_type or delay_minutes' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        task_id: taskResult.id,
        schedule_type,
        delay_minutes,
        views,
        scheduled_at: new Date().toISOString(),
        estimated_execution: schedule_type === 'delayed' 
          ? new Date(Date.now() + (delay_minutes * 60 * 1000)).toISOString()
          : new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Schedule Refresh API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to schedule materialized view refresh'
      },
      { status: 500 }
    )
  }
}

// GET: Check scheduled refresh status
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Check if user has admin/finance permissions
    const { data: employeeProfile } = await supabase
      .from('employee_profiles')
      .select('role_permissions')
      .eq('user_id', userId)
      .single()

    if (!employeeProfile?.role_permissions?.admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Get recent refresh history
    const { data: refreshHistory } = await supabase
      .from('materialized_view_refresh_log')
      .select('*')
      .order('refresh_started_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      success: true,
      data: {
        recent_refreshes: refreshHistory || [],
        scheduling_info: {
          available_views: ['financial_analytics_mv'],
          supported_schedules: ['immediate', 'delayed'],
          max_delay_minutes: 1440 // 24 hours
        }
      }
    })

  } catch (error) {
    console.error('[Schedule Refresh API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch schedule status'
      },
      { status: 500 }
    )
  }
}