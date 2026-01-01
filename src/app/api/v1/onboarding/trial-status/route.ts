/**
 * Trial Status API Route
 *
 * Returns trial status for the authenticated user's business.
 * Uses subscription_status from database (synced from Stripe) as source of truth.
 *
 * @route GET /api/v1/onboarding/trial-status
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin-client'

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

    // Get Supabase admin client (lazy initialization)
    const supabaseAdmin = getSupabaseAdmin()

    // Get user's business context
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Trial Status API v1] User not found:', userError?.message)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (!user.business_id) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // Get business trial data (subscription_status is synced from Stripe)
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('trial_start_date, trial_end_date, plan_name, subscription_status')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Trial Status API v1] Business not found:', businessError?.message)
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Determine trial status using subscription_status (Stripe source of truth)
    const isTrialPlan = business.plan_name === 'trial' || business.plan_name === 'free'
    const isTrialingStatus = business.subscription_status === 'trialing'
    const isPausedStatus = business.subscription_status === 'paused'
    const isOnTrial = isTrialPlan || isTrialingStatus

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
          planName: business.plan_name,
        },
      })
    }

    // Calculate trial dates and remaining days
    let trialEndDate = business.trial_end_date
    let daysRemaining = 0
    let isExpired = isPausedStatus

    if (trialEndDate) {
      try {
        const endDate = new Date(trialEndDate)
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

    const response = {
      success: true,
      data: {
        isOnTrial: isOnTrial && !isExpired,
        trialStartDate: business.trial_start_date,
        trialEndDate,
        daysRemaining,
        isExpired,
        shouldShowWarning,
        isPaused: isPausedStatus,
        planName: business.plan_name,
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
