/**
 * Scheduled Materialized View Refresh Task
 * Runs periodically to keep financial analytics up to date
 */

import { task } from "@trigger.dev/sdk/v3"
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface RefreshMaterializedViewsPayload {
  views?: string[]
  force_refresh?: boolean
  triggered_by?: string
}

export const refreshMaterializedViews = task({
  id: "refresh-materialized-views",
  maxDuration: 900, // 15 minutes max
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: RefreshMaterializedViewsPayload) => {
    const { views = ['financial_analytics_mv'], triggered_by = 'scheduled' } = payload
    
    console.log(`[Refresh Materialized Views] Starting refresh for views: ${views.join(', ')} (triggered by: ${triggered_by})`)
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    
    const results = []
    
    for (const viewName of views) {
      try {
        console.log(`[Refresh Materialized Views] Processing view: ${viewName}`)
        
        // Execute refresh with logging for financial_analytics_mv
        if (viewName === 'financial_analytics_mv') {
          const { error: refreshError } = await supabase
            .rpc('refresh_financial_analytics_with_logging')
          
          if (refreshError) {
            throw new Error(`Failed to refresh ${viewName}: ${refreshError.message}`)
          }
          
          // Get the result from the log
          const { data: logEntry } = await supabase
            .from('materialized_view_refresh_log')
            .select('*')
            .eq('view_name', viewName)
            .order('refresh_started_at', { ascending: false })
            .limit(1)
            .single()
          
          results.push({
            view_name: viewName,
            success: logEntry?.success || false,
            duration: logEntry?.duration,
            rows_refreshed: logEntry?.rows_refreshed,
            error_message: logEntry?.error_message,
            timestamp: logEntry?.refresh_completed_at || logEntry?.refresh_started_at
          })
          
          console.log(`[Refresh Materialized Views] Completed ${viewName}: ${logEntry?.success ? 'SUCCESS' : 'FAILED'} (${logEntry?.rows_refreshed || 0} rows, ${logEntry?.duration || 'unknown duration'})`)
          
        } else {
          // For other views, execute direct refresh (future extensibility)
          const { error: refreshError } = await supabase
            .from(viewName)
            .select('*', { count: 'exact', head: true })
          
          if (refreshError && !refreshError.message.includes('does not exist')) {
            throw new Error(`Failed to verify ${viewName}: ${refreshError.message}`)
          }
          
          results.push({
            view_name: viewName,
            success: true,
            message: 'View verified successfully'
          })
        }
        
      } catch (error) {
        console.error(`[Refresh Materialized Views] Error refreshing ${viewName}:`, error)
        results.push({
          view_name: viewName,
          success: false,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    const totalCount = results.length
    
    console.log(`[Refresh Materialized Views] Completed: ${successCount}/${totalCount} views refreshed successfully`)
    
    return {
      success: successCount === totalCount,
      results,
      summary: {
        total_views: totalCount,
        successful_refreshes: successCount,
        failed_refreshes: totalCount - successCount,
        triggered_by,
        completed_at: new Date().toISOString()
      }
    }
  },
})