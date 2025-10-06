/**
 * Real-time Analytics API
 * Uses optimized get_dashboard_analytics_realtime RPC for fast updates
 * SECURITY: Centralized middleware with authentication, rate limiting, and audit logging
 */

import { NextRequest } from 'next/server'
import { SupportedCurrency } from '@/types/transaction'
import { realtimeRateLimiter } from '@/lib/rate-limiter'
import { auditLogger } from '@/lib/audit-logger'
import { withApiHandler, type ApiContext, createApiSuccessResponse } from '@/lib/api-middleware'

async function handleRealtimeAnalytics(context: ApiContext) {
  console.log('[Real-time Analytics API] Starting real-time analytics calculation...')

  const { userId, businessId, supabase, request, rateLimitResult, userProfile } = context

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'month'
  const homeCurrency = (searchParams.get('homeCurrency') || 'SGD') as SupportedCurrency

  // Calculate date range based on period
  const now = new Date()
  let startDate: Date
  let endDate = new Date()

  switch (period) {
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter':
      const quarterStart = Math.floor(now.getMonth() / 3) * 3
      startDate = new Date(now.getFullYear(), quarterStart, 1)
      break
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  console.log('[Real-time Analytics API] Period:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0])

  // PERFORMANCE: Use optimized RPC function for real-time analytics
  console.log('[Real-time Analytics API] Calling get_dashboard_analytics_realtime RPC...')

  // AUDIT: Log RPC call start
  const rpcStartTime = Date.now()
  const rpcParameters = {
    p_start_date: startDate.toISOString().split('T')[0],
    p_end_date: endDate.toISOString().split('T')[0],
    user_id_param: userProfile.user_id  // ✅ Pass Supabase UUID to RPC
  }

  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('get_dashboard_analytics_realtime', rpcParameters)

  // AUDIT: Log RPC call completion
  const executionTime = Date.now() - rpcStartTime
  auditLogger.logRPCCall(
    userProfile.user_id,  // ✅ Use Supabase UUID instead of Clerk ID
    businessId,
    'get_dashboard_analytics_realtime',
    rpcParameters,
    !rpcError,
    request,
    executionTime,
    rpcResult ? 1 : 0,
    rpcError?.message
  )

  if (rpcError) {
    console.error('[Real-time Analytics API] RPC function error:', rpcError)
    throw new Error(`Real-time analytics calculation failed: ${rpcError.message}`)
  }

  if (!rpcResult) {
    console.log('[Real-time Analytics API] No data returned from RPC function')
    // Return zero analytics for empty result
    const emptyResult = {
      total_income: 0,
      total_expenses: 0,
      net_profit: 0,
      transaction_count: 0,
      average_transaction_size: 0,
      expense_growth_rate: 0,
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      calculated_at: Date.now(),
      data_source: 'rpc_realtime',
      currency_breakdown: {},
      category_breakdown: {},
      aged_receivables: {
        current: 0, late_31_60: 0, late_61_90: 0, late_90_plus: 0, total_outstanding: 0
      },
      aged_payables: {
        current: 0, late_31_60: 0, late_61_90: 0, late_90_plus: 0, total_outstanding: 0
      }
    }

    return createApiSuccessResponse({
      analytics: emptyResult,
      performance: {
        calculation_method: 'rpc_realtime',
        execution_time: '~1ms (empty data)'
      }
    }, rateLimitResult.headers)
  }

  console.log('[Real-time Analytics API] RPC function completed successfully')
  console.log('[Real-time Analytics API] Analytics result:', {
    total_income: rpcResult.total_income,
    total_expenses: rpcResult.total_expenses,
    net_profit: rpcResult.net_profit,
    transaction_count: rpcResult.transaction_count,
    data_source: rpcResult.data_source
  })

  // Return real-time analytics result
  return createApiSuccessResponse({
    analytics: {
      total_income: rpcResult.total_income || 0,
      total_expenses: rpcResult.total_expenses || 0,
      net_profit: rpcResult.net_profit || 0,
      transaction_count: rpcResult.transaction_count || 0,
      average_transaction_size: rpcResult.average_transaction_size || 0,
      expense_growth_rate: rpcResult.expense_growth_rate || 0,

      // Period information
      period: rpcResult.period || {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },

      // Metadata
      calculated_at: rpcResult.calculated_at || Date.now(),
      data_source: rpcResult.data_source || 'rpc_realtime',
      business_id: rpcResult.business_id,
      user_id: rpcResult.user_id,

      // Breakdowns (parsed if JSON strings)
      currency_breakdown: typeof rpcResult.currency_breakdown === 'string'
        ? JSON.parse(rpcResult.currency_breakdown)
        : rpcResult.currency_breakdown || {},
      category_breakdown: typeof rpcResult.category_breakdown === 'string'
        ? JSON.parse(rpcResult.category_breakdown)
        : rpcResult.category_breakdown || {},

      // Aged analytics
      aged_receivables: rpcResult.aged_receivables || {
        current: 0, late_31_60: 0, late_61_90: 0, late_90_plus: 0, total_outstanding: 0
      },
      aged_payables: rpcResult.aged_payables || {
        current: 0, late_31_60: 0, late_61_90: 0, late_90_plus: 0, total_outstanding: 0
      }
    },
    performance: {
      calculation_method: 'rpc_realtime',
      execution_time: '~1ms (optimized database function)'
    }
  }, rateLimitResult.headers)
}

// Export the main GET handler using centralized middleware
export async function GET(request: NextRequest) {
  return withApiHandler(
    request,
    {
      requireAuth: true,
      rateLimiter: realtimeRateLimiter,
      auditAction: 'realtime_analytics_access'
    },
    handleRealtimeAnalytics
  )
}