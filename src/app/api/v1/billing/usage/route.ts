/**
 * Usage Tracking API Route
 *
 * Handles OCR usage recording and checking for billing limits.
 *
 * @route GET /api/v1/billing/usage - Check current usage and limits
 * @route POST /api/v1/billing/usage - Record OCR usage after successful processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin-client'
import { PlanKey, canUseOcr, getOcrLimit, getUsagePercentage } from '@/lib/stripe/plans'

/**
 * GET /api/v1/billing/usage
 *
 * Returns current OCR usage and whether more scans are allowed.
 * Use this for pre-flight checks before initiating OCR.
 */
export async function GET(request: NextRequest) {
  console.log('[Billing Usage] Checking usage')

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's business context
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user?.business_id) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Get business plan
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, plan_name')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    const planName = (business.plan_name as PlanKey) || 'trial'
    const limit = getOcrLimit(planName)

    // Get current month usage
    const { data: usageData, error: usageError } = await supabaseAdmin.rpc(
      'get_monthly_ocr_usage',
      { p_business_id: business.id }
    )

    const currentUsage = usageError ? 0 : (usageData ?? 0)
    const canUse = canUseOcr(planName, currentUsage)
    const percentage = getUsagePercentage(planName, currentUsage)

    return NextResponse.json({
      success: true,
      data: {
        canUse,
        used: currentUsage,
        limit: limit === -1 ? null : limit,
        remaining: limit === -1 ? null : Math.max(0, limit - currentUsage),
        percentage,
        isUnlimited: limit === -1,
        plan: planName,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Usage] Error checking usage: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to check usage' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/billing/usage
 *
 * Records OCR usage after successful document processing.
 * Should be called AFTER OCR completes successfully.
 *
 * Request body:
 * - document_id?: string - Optional reference to processed document
 * - credits?: number - Number of credits to record (default: 1)
 */
export async function POST(request: NextRequest) {
  console.log('[Billing Usage] Recording usage')

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const documentId = body.document_id || null
    const credits = typeof body.credits === 'number' ? body.credits : 1

    // Get user's business context
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user?.business_id) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Get business plan for limit check
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, plan_name')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    const planName = (business.plan_name as PlanKey) || 'trial'

    // Get current usage to check if we're at limit
    const { data: currentUsageData } = await supabaseAdmin.rpc(
      'get_monthly_ocr_usage',
      { p_business_id: business.id }
    )
    const currentUsage = currentUsageData ?? 0

    // Check if usage is allowed (soft-block check)
    if (!canUseOcr(planName, currentUsage)) {
      const limit = getOcrLimit(planName)
      return NextResponse.json(
        {
          success: false,
          error: 'Usage limit reached',
          data: {
            used: currentUsage,
            limit,
            requiresUpgrade: true,
          },
        },
        { status: 403 }
      )
    }

    // Calculate period_start (first day of current month)
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]

    // Record usage
    const { data: usageRecord, error: insertError } = await supabaseAdmin
      .from('ocr_usage')
      .insert({
        business_id: user.business_id,
        document_id: documentId,
        credits_used: credits,
        period_start: periodStart,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Billing Usage] Failed to record usage:', insertError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to record usage' },
        { status: 500 }
      )
    }

    // Return updated usage stats
    const newUsage = currentUsage + credits
    const limit = getOcrLimit(planName)

    return NextResponse.json({
      success: true,
      data: {
        recorded: credits,
        used: newUsage,
        limit: limit === -1 ? null : limit,
        remaining: limit === -1 ? null : Math.max(0, limit - newUsage),
        percentage: getUsagePercentage(planName, newUsage),
        isUnlimited: limit === -1,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Usage] Error recording usage: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to record usage' },
      { status: 500 }
    )
  }
}
