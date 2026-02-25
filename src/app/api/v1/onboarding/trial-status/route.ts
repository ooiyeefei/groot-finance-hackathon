/**
 * Trial Status API Route
 *
 * Returns trial status for the authenticated user's business.
 * Uses subscription_status from database (synced from Stripe) as source of truth.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route GET /api/v1/onboarding/trial-status
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

const TRIAL_WARNING_THRESHOLD_DAYS = 3

export async function GET(request: NextRequest) {
  console.log('[Trial Status API v1] Fetching trial status')

  try {
    // Authenticate user
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
      console.error('[Trial Status API v1] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    const business = await client.query(api.functions.businesses.getCurrentBusiness)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // Determine trial status using subscription_status (Stripe source of truth)
    // Trial is a STATUS, not a plan
    const isTrialingStatus = business.subscriptionStatus === 'trialing'
    const isPausedStatus = business.subscriptionStatus === 'paused'
    const isOnTrial = isTrialingStatus

    // Default response for non-trial users
    if (!isOnTrial && !isPausedStatus) {
      return NextResponse.json({
        success: true,
        data: {
          isOnTrial: false,
          trialStartDate: null,
          trialEndDate: null,
          daysRemaining: 0,
          isExpired: false,
          shouldShowWarning: false,
          isPaused: false,
          planName: business.planName,
        },
      })
    }

    // Calculate trial dates and remaining days
    // Convex stores trialEndDate as number (timestamp) or undefined
    let trialEndDateValue = business.trialEndDate
    let daysRemaining = 0
    let isExpired = isPausedStatus

    if (trialEndDateValue) {
      try {
        const endDate = new Date(trialEndDateValue)
        const now = new Date()
        const diffMs = endDate.getTime() - now.getTime()
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

        if (daysRemaining < 0) {
          isExpired = true
          daysRemaining = 0
        }
      } catch {
        // Invalid date - treat as expired
        isExpired = true
      }
    }

    const shouldShowWarning = !isExpired && daysRemaining <= TRIAL_WARNING_THRESHOLD_DAYS

    // Convert timestamp to ISO string for API response
    const trialEndDateISO = trialEndDateValue
      ? new Date(trialEndDateValue).toISOString()
      : null
    const trialStartDateISO = business.trialStartDate
      ? new Date(business.trialStartDate).toISOString()
      : null

    const response = {
      success: true,
      data: {
        isOnTrial: isOnTrial && !isExpired,
        trialStartDate: trialStartDateISO,
        trialEndDate: trialEndDateISO,
        daysRemaining,
        isExpired,
        shouldShowWarning,
        isPaused: isPausedStatus,
        planName: business.planName,
      },
    }

    console.log('[Trial Status API v1] Success:', {
      isOnTrial: response.data.isOnTrial,
      daysRemaining,
      isPaused: isPausedStatus,
    })

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Trial Status API v1] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trial status' },
      { status: 500 }
    )
  }
}
