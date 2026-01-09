/**
 * POST /api/v1/onboarding/initialize-business
 *
 * Initializes business entity with AI-generated categories during user onboarding.
 * Creates: business record, owner membership, user linkage
 *
 * Note: This does NOT create Stripe subscription.
 * For trial users, call /api/v1/onboarding/start-trial after this succeeds.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { initializeBusiness } from '@/domains/onboarding/lib/business-initialization.service'

interface InitializeBusinessRequest {
  name: string
  countryCode: string
  homeCurrency: string
  businessType: 'fnb' | 'retail' | 'services' | 'manufacturing' | 'other'
  customCOGSNames: string[]
  customExpenseNames: string[]
  selectedPlan: 'trial' | 'starter' | 'pro' | 'enterprise'
}

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user via Clerk
    console.log('[Onboarding API] Authenticating user...')
    const { userId } = await auth()

    if (!userId) {
      console.error('[Onboarding API] ❌ No authenticated user')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Onboarding API] ✅ User authenticated:', userId)

    // Step 1b: Get user details from Clerk (email required for Convex user creation)
    console.log('[Onboarding API] Fetching user details from Clerk...')
    const clerk = await clerkClient()
    const clerkUser = await clerk.users.getUser(userId)
    const userEmail = clerkUser.emailAddresses?.[0]?.emailAddress
    const userFullName = clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
      : clerkUser.firstName || clerkUser.lastName || undefined

    if (!userEmail) {
      console.error('[Onboarding API] ❌ No email found for user')
      return NextResponse.json(
        { success: false, error: 'User email not found' },
        { status: 400 }
      )
    }

    console.log('[Onboarding API] ✅ User email:', userEmail)

    // Step 2: Parse and validate request body
    console.log('[Onboarding API] Parsing request body...')
    const body: InitializeBusinessRequest = await request.json()

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      console.error('[Onboarding API] ❌ Missing business name')
      return NextResponse.json(
        { success: false, error: 'Business name is required' },
        { status: 400 }
      )
    }

    if (!body.countryCode || body.countryCode.trim().length === 0) {
      console.error('[Onboarding API] ❌ Missing country code')
      return NextResponse.json(
        { success: false, error: 'Country code is required' },
        { status: 400 }
      )
    }

    if (!body.homeCurrency || body.homeCurrency.trim().length === 0) {
      console.error('[Onboarding API] ❌ Missing home currency')
      return NextResponse.json(
        { success: false, error: 'Home currency is required' },
        { status: 400 }
      )
    }

    // Validate business type
    const validBusinessTypes = ['fnb', 'retail', 'services', 'manufacturing', 'other']
    if (!validBusinessTypes.includes(body.businessType)) {
      console.error('[Onboarding API] ❌ Invalid business type:', body.businessType)
      return NextResponse.json(
        { success: false, error: 'Invalid business type' },
        { status: 400 }
      )
    }

    // Validate plan
    const validPlans = ['trial', 'starter', 'pro', 'enterprise']
    if (!validPlans.includes(body.selectedPlan)) {
      console.error('[Onboarding API] ❌ Invalid plan:', body.selectedPlan)
      return NextResponse.json(
        { success: false, error: 'Invalid plan selection' },
        { status: 400 }
      )
    }

    console.log('[Onboarding API] ✅ Request validation passed')
    console.log('[Onboarding API] Business name:', body.name)
    console.log('[Onboarding API] Country:', body.countryCode)
    console.log('[Onboarding API] Currency:', body.homeCurrency)
    console.log('[Onboarding API] Business type:', body.businessType)
    console.log('[Onboarding API] Plan:', body.selectedPlan)

    // Step 3: Initialize business (direct call, no Trigger.dev)
    console.log('[Onboarding API] 🚀 Initializing business...')

    const result = await initializeBusiness({
      clerkUserId: userId,
      email: userEmail,
      fullName: userFullName,
      businessName: body.name,
      country: body.countryCode,
      currency: body.homeCurrency,
      businessType: body.businessType,
      plan: body.selectedPlan,
    })

    if (!result.success) {
      console.error('[Onboarding API] ❌ Business initialization failed:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    console.log('[Onboarding API] ✅ Business initialized successfully')
    console.log('[Onboarding API] Business ID:', result.businessId)

    // Step 4: Return success with business ID
    // Note: For trial users, frontend should call /api/v1/onboarding/start-trial next
    return NextResponse.json(
      {
        success: true,
        businessId: result.businessId,
        categoriesGenerated: result.categoriesGenerated,
        message: 'Business created successfully',
        nextStep: body.selectedPlan === 'trial'
          ? 'Call /api/v1/onboarding/start-trial to activate trial'
          : null
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('[Onboarding API] 💥 Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
