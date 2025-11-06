/**
 * North Star Expense Claims API v1 - Main Collection Routes
 * GET /api/v1/expense-claims - List expense claims (rate limited for queries)
 * POST /api/v1/expense-claims - Create new expense claim (rate limited for mutations/uploads)
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createExpenseClaim, listExpenseClaims } from '@/domains/expense-claims/lib/data-access'
import { CreateExpenseClaimRequest, ExpenseClaimListParams } from '@/domains/expense-claims/types'
import { getBusinessExpenseCategories } from '@/domains/expense-claims/lib/expense-category-mapper'
import { getUserData, createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'
import { validateQuery, validateBody, validateFormData, listExpenseClaimsQuerySchema, createExpenseClaimSchema, createExpenseClaimFileSchema } from '@/lib/validations'
import { withCache, apiCache, CACHE_TTL } from '@/lib/cache/api-cache'

/**
 * GET /api/v1/expense-claims
 * List expense claims with role-based filtering and pagination
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting for query operations (100 requests per minute)
  const queryRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.QUERY)

  if (queryRateLimit) {
    return queryRateLimit // Return rate limit error response
  }
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // ✅ Validate query parameters with Zod
    const validated = validateQuery(request, listExpenseClaimsQuerySchema)
    if (!validated.success) {
      return validated.error
    }

    const params: ExpenseClaimListParams = validated.data as any

    // ✅ PERFORMANCE: Cache expense claims with 2-minute TTL
    const result = await withCache(
      userId,
      'expense-claims',
      () => listExpenseClaims(userId, params),
      {
        params,
        ttlMs: CACHE_TTL.EXPENSE_CLAIMS,
        skipCache: false
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data
    })

  } catch (error) {
    console.error('[North Star API v1] GET expense-claims error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch expense claims' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/expense-claims
 * Unified creation endpoint - handles both manual entry and file upload
 */
export async function POST(request: NextRequest) {
  // Determine if this is a file upload to apply appropriate rate limiting
  const contentType = request.headers.get('content-type')
  const isFileUpload = contentType?.includes('multipart/form-data')

  // Apply different rate limits based on operation type
  if (isFileUpload) {
    // More reasonable rate limiting for file uploads using EXPENSIVE config (10 uploads per minute)
    const uploadRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.EXPENSIVE)

    if (uploadRateLimit) {
      return uploadRateLimit // Return rate limit error response
    }
  } else {
    // Standard mutation rate limiting for manual entry (30 per minute)
    const mutationRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)

    if (mutationRateLimit) {
      return mutationRateLimit // Return rate limit error response
    }
  }

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let createRequest: CreateExpenseClaimRequest

    if (isFileUpload) {
      // ✅ Validate file upload with Zod
      const validated = await validateFormData(request, createExpenseClaimFileSchema)
      if (!validated.success) {
        return validated.error
      }

      // Map validated data to CreateExpenseClaimRequest
      const validatedData = validated.data
      createRequest = {
        description: validatedData.description,
        business_purpose: validatedData.business_purpose,
        expense_category: validatedData.expense_category ?? null, // Convert undefined to null
        original_amount: validatedData.original_amount,
        original_currency: validatedData.original_currency,
        transaction_date: validatedData.transaction_date,
        vendor_name: validatedData.vendor_name ?? '',
        vendor_id: validatedData.vendor_id,
        reference_number: validatedData.reference_number,
        notes: validatedData.notes,
        storage_path: validatedData.storage_path,
        line_items: [],
        file: validatedData.file,
        processing_mode: validatedData.processing_mode
      }
    } else {
      // ✅ Validate JSON body with Zod
      const validated = await validateBody(request, createExpenseClaimSchema)
      if (!validated.success) {
        return validated.error
      }

      // Use validated data directly without type casting
      createRequest = validated.data as any
    }

    // ✅ BUSINESS CURRENCY VALIDATION (OPTIMIZED - SINGLE QUERY)
    // Validate that the submitted currency is allowed by the business
    try {
      const supabase = await createBusinessContextSupabaseClient()

      // Single query with JOIN to fetch user and business data together
      // Using !users_business_id_fkey to specify the relationship via users.business_id -> businesses.id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          business_id,
          businesses!users_business_id_fkey (
            home_currency,
            allowed_currencies
          )
        `)
        .eq('clerk_user_id', userId)
        .single()

      if (userError || !userData || !userData.businesses) {
        console.error('[Currency Validation] Failed to fetch user and business data:', userError)
        return NextResponse.json(
          { success: false, error: 'Failed to validate currency against business settings' },
          { status: 500 }
        )
      }

      // When using the specific foreign key relationship, businesses is always a single object (many-to-one)
      // Handle both array and single object cases for TypeScript
      const businessData = Array.isArray(userData.businesses)
        ? userData.businesses[0]
        : userData.businesses as { home_currency: string; allowed_currencies?: string[] } | null

      if (!businessData) {
        console.error('[Currency Validation] No business data found for user')
        return NextResponse.json(
          { success: false, error: 'Business not found or not accessible' },
          { status: 404 }
        )
      }

      const allowedCurrencies = businessData.allowed_currencies || ['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR']

      if (!allowedCurrencies.includes(createRequest.original_currency)) {
        return NextResponse.json(
          {
            success: false,
            error: `Currency ${createRequest.original_currency} is not allowed by your business. Allowed currencies: ${allowedCurrencies.join(', ')}`,
            allowed_currencies: allowedCurrencies
          },
          { status: 400 }
        )
      }

      console.log(`[Currency Validation] ✅ Currency ${createRequest.original_currency} is allowed by business`)

      // Add business currency context to the request for downstream processing
      createRequest.business_home_currency = businessData.home_currency
      createRequest.business_allowed_currencies = allowedCurrencies

    } catch (error) {
      console.error('[Currency Validation] Error during currency validation:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to validate currency settings' },
        { status: 500 }
      )
    }

    const result = await createExpenseClaim(userId, createRequest)

    if (!result.success) {
      if (result.error === 'duplicate_detected') {
        return NextResponse.json({
          success: false,
          error: 'duplicate_detected',
          duplicateData: result.data,
          message: 'This expense has already been submitted. Please check your existing claims.'
        }, { status: 409 })
      }

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Invalidate expense claims cache after successful creation
    apiCache.invalidate(userId, 'expense-claims')

    const responseData: any = {
      expense_claim: result.data,
      expense_claim_id: result.data?.id,
      processing_complete: !createRequest.file || createRequest.processing_mode === 'manual',
      message: createRequest.file
        ? `Receipt ${createRequest.processing_mode === 'ai' ? 'uploaded and AI processing initiated' : 'uploaded successfully'}`
        : 'Expense record created successfully'
    }

    if (result.task_id) {
      responseData.task_id = result.task_id
    }

    return NextResponse.json({
      success: true,
      data: responseData
    })

  } catch (error) {
    console.error('[North Star API v1] POST expense-claims error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create expense claim' },
      { status: 500 }
    )
  }
}