/**
 * Materialized Views Management API
 * Provides monitoring and manual refresh capabilities
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

// GET: Fetch refresh history and status
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const viewName = searchParams.get('view_name') || 'financial_analytics_mv'

    // Get refresh history
    const { data: refreshHistory, error: historyError } = await supabase
      .from('materialized_view_refresh_log')
      .select('*')
      .eq('view_name', viewName)
      .order('refresh_started_at', { ascending: false })
      .limit(limit)

    if (historyError) {
      console.error('[Materialized Views API] Failed to fetch history:', historyError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch refresh history' },
        { status: 500 }
      )
    }

    // Get current view status
    const { data: viewStats, error: statsError } = await supabase
      .from('financial_analytics_mv')
      .select('*', { count: 'exact', head: true })

    const totalRows = viewStats ? 0 : (statsError?.message?.includes('does not exist') ? 0 : null)

    // Get last refresh info
    const lastRefresh = refreshHistory?.[0] || null

    return NextResponse.json({
      success: true,
      data: {
        view_name: viewName,
        total_rows: totalRows,
        last_refresh: lastRefresh ? {
          timestamp: lastRefresh.refresh_completed_at || lastRefresh.refresh_started_at,
          success: lastRefresh.success,
          duration: lastRefresh.duration,
          rows_refreshed: lastRefresh.rows_refreshed,
          error_message: lastRefresh.error_message
        } : null,
        refresh_history: refreshHistory || [],
        pagination: {
          limit,
          total: refreshHistory?.length || 0,
          has_more: (refreshHistory?.length || 0) >= limit
        }
      }
    })

  } catch (error) {
    console.error('[Materialized Views API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch materialized view status'
      },
      { status: 500 }
    )
  }
}

// POST: Trigger manual refresh
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

    const { view_name = 'financial_analytics_mv' } = await request.json()

    console.log(`[Materialized Views API] Manual refresh triggered for ${view_name} by user ${userId}`)

    // Execute refresh with logging
    const { error: refreshError } = await supabase
      .rpc('refresh_financial_analytics_with_logging')

    if (refreshError) {
      console.error('[Materialized Views API] Manual refresh failed:', refreshError)
      return NextResponse.json(
        { success: false, error: 'Failed to refresh materialized view' },
        { status: 500 }
      )
    }

    // Get the latest log entry to return results
    const { data: latestLog } = await supabase
      .from('materialized_view_refresh_log')
      .select('*')
      .eq('view_name', view_name)
      .order('refresh_started_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      success: true,
      data: {
        view_name,
        refresh_triggered: true,
        refresh_result: latestLog ? {
          success: latestLog.success,
          duration: latestLog.duration,
          rows_refreshed: latestLog.rows_refreshed,
          error_message: latestLog.error_message,
          timestamp: latestLog.refresh_completed_at || latestLog.refresh_started_at
        } : null
      }
    })

  } catch (error) {
    console.error('[Materialized Views API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to trigger materialized view refresh'
      },
      { status: 500 }
    )
  }
}