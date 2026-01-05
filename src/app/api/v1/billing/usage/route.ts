/**
 * Usage Tracking API Route
 *
 * Handles OCR usage recording and checking for billing limits.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route GET /api/v1/billing/usage - Check current usage and limits
 * @route POST /api/v1/billing/usage - Record OCR usage after successful processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
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
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Usage] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    const business = await client.query(api.functions.businesses.getCurrentBusiness)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    const planName = (business.planName as PlanKey) || 'trial'
    const limit = getOcrLimit(planName)

    // Get current month usage from Convex
    let currentUsage = 0
    try {
      const usageData = await client.query(api.functions.ocrUsage.getCurrentUsage, {
        businessId: business._id as Id<"businesses">
      })
      currentUsage = usageData?.creditsUsed ?? 0
    } catch (usageError) {
      console.error('[Billing Usage] Failed to get OCR usage:', usageError)
    }

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

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Usage] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    const business = await client.query(api.functions.businesses.getCurrentBusiness)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    const planName = (business.planName as PlanKey) || 'trial'

    // Get current usage from Convex
    let currentUsage = 0
    try {
      const usageData = await client.query(api.functions.ocrUsage.getCurrentUsage, {
        businessId: business._id as Id<"businesses">
      })
      currentUsage = usageData?.creditsUsed ?? 0
    } catch (usageError) {
      console.error('[Billing Usage] Failed to get current usage:', usageError)
    }

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

    // Record usage via Convex mutation
    const result = await client.mutation(api.functions.ocrUsage.recordUsageFromApi, {
      businessId: business._id as Id<"businesses">,
      credits,
      documentId,
    })

    // Return updated usage stats
    const limit = getOcrLimit(planName)
    const newUsage = result.totalUsed

    return NextResponse.json({
      success: true,
      data: {
        recorded: credits,
        used: newUsage,
        limit: limit === -1 ? null : limit,
        remaining: limit === -1 ? null : result.remaining,
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
