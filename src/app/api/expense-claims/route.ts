/**
 * Expense Claims API Endpoints
 * Implements Otto's 7-stage workflow with Kevin's state machine pattern
 * and Mel's mobile-first user experience
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
import { currencyService } from '@/lib/currency-service'
import {
  CreateExpenseClaimRequest,
  ExpenseClaimListParams,
  ExpenseStatus,
  ExpenseCategory,
  EXPENSE_WORKFLOW_TRANSITIONS,
  EXPENSE_VALIDATION_RULES
} from '@/types/expense-claims'
import { SupportedCurrency } from '@/types/transaction'
import {
  mapExpenseCategoryToAccounting,
  getBusinessExpenseCategory,
  isValidExpenseCategory
} from '@/lib/expense-category-mapper'


// Create new expense claim
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CreateExpenseClaimRequest = await request.json()
    const {
      description,
      business_purpose,
      expense_category,
      original_amount,
      original_currency,
      transaction_date,
      vendor_name,
      vendor_id, // NEW: Support for vendor_id from vendors table
      reference_number,
      notes,
      storage_path, // NEW: Support for manual receipt uploads
      line_items = []
    } = body

    // Validate required fields
    if (!description || !business_purpose || !expense_category || 
        !original_amount || !original_currency || !transaction_date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate currency
    if (!currencyService.isSupportedCurrency(original_currency)) {
      return NextResponse.json(
        { success: false, error: `Unsupported currency: ${original_currency}` },
        { status: 400 }
      )
    }

    console.log(`[Expense Claims API] Creating expense claim for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      console.error('[Expense Claims API] Failed to create or retrieve employee profile')
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile. Please contact administrator.' },
        { status: 500 }
      )
    }

    // Validate expense category against business-specific categories
    const isValidCategory = await isValidExpenseCategory(employeeProfile.business_id, expense_category)
    if (!isValidCategory) {
      return NextResponse.json(
        { success: false, error: `Invalid expense category: ${expense_category}. Please use a valid category for your business.` },
        { status: 400 }
      )
    }

    // Get category details for proper accounting mapping
    const categoryInfo = await getBusinessExpenseCategory(employeeProfile.business_id, expense_category)
    const accountingCategory = categoryInfo?.accounting_category || mapExpenseCategoryToAccounting(expense_category)

    const userHomeCurrency = userData.home_currency

    // Convert to home currency
    let homeAmount = original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

    console.log(`[Expense Claims API] Currency conversion: ${original_amount} ${original_currency} → ${userHomeCurrency}`)

    if (original_currency !== userHomeCurrency) {
      try {
        const conversion = await currencyService.convertAmount(
          original_amount,
          original_currency,
          userHomeCurrency as SupportedCurrency
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
        exchangeRateDate = conversion.rate_date

        console.log(`[Expense Claims API] Conversion successful: ${original_amount} ${original_currency} = ${homeAmount} ${userHomeCurrency} (rate: ${exchangeRate})`)
      } catch (error) {
        console.error('[Expense Claims API] Currency conversion failed:', error)
        // Continue with original amount as fallback
        console.log(`[Expense Claims API] Using fallback: no conversion applied`)
      }
    } else {
      console.log(`[Expense Claims API] No conversion needed: same currency`)
    }

    // Server-side duplicate detection (check against existing expense claims)
    if (reference_number) {
      console.log(`[Expense Claims API] Performing server-side duplicate check for: ${reference_number}`)

      // Check for exact duplicates in expense claims (proper workflow)
      const { data: existingClaims, error: duplicateError } = await supabase
        .from('expense_claims')
        .select(`
          id,
          status,
          vendor_name,
          total_amount,
          currency,
          transaction_date,
          reference_number,
          created_at
        `)
        .eq('user_id', employeeProfile.user_id)
        .eq('reference_number', reference_number)
        .eq('transaction_date', transaction_date)
        .eq('total_amount', original_amount)

      if (duplicateError) {
        console.error('[Expense Claims API] Duplicate check error:', duplicateError)
        // Continue processing - don't block on duplicate check failure
      } else if (existingClaims && existingClaims.length > 0) {
        const existing = existingClaims[0]

        console.log(`[Expense Claims API] Duplicate detected: ${existing.id} (status: ${existing.status})`)
        return NextResponse.json({
          success: false,
          error: 'duplicate_detected',
          duplicateData: {
            claimId: existing.id,
            reference_number: existing.reference_number,
            transaction_date: existing.transaction_date,
            amount: existing.total_amount,
            vendor_name: existing.vendor_name,
            status: existing.status,
            created_at: existing.created_at
          },
          message: `This expense has already been submitted (Reference: ${reference_number}, Date: ${transaction_date}, Amount: ${original_amount}). Please check your existing claims.`
        }, { status: 409 })
      }
    }

    // Convert to first day of the month for database date field
    const transactionDate = new Date(transaction_date)
    const claimMonth = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1).toISOString().split('T')[0] // YYYY-MM-01 format


    // Create expense claim record (follows proper workflow - no direct accounting_entries creation)
    const expenseClaimData = {
      user_id: employeeProfile.user_id,
      business_id: employeeProfile.business_id,
      status: 'draft', // Start in draft status
      business_purpose,
      business_purpose_details: notes || null, // Store notes as additional business purpose details (text format)
      expense_category,
      claim_month: claimMonth,
      current_approver_id: null, // Will be set when submitted
      storage_path: storage_path || null, // Include storage path for manual receipt uploads

      // Store financial data in processing_metadata (like DSPy processing)
      processing_metadata: {
        processing_method: 'manual_entry',
        processing_status: 'completed',
        processing_timestamp: new Date().toISOString(),

        // Store financial data for later accounting_entries creation
        financial_data: {
          description,
          vendor_name,
          vendor_id: vendor_id || null,
          total_amount: original_amount,
          original_currency,
          home_currency: userHomeCurrency,
          home_currency_amount: homeAmount,
          exchange_rate: exchangeRate,
          exchange_rate_date: exchangeRateDate,
          transaction_date,
          reference_number: reference_number || null,
          notes: notes || null,
          subtotal_amount: null,
          tax_amount: null
        },

        // Store line items for later creation
        line_items: line_items.map((item, index) => ({
          item_description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.quantity * item.unit_price,
          currency: original_currency,
          tax_amount: item.tax_rate ? (item.quantity * item.unit_price * item.tax_rate) : 0,
          tax_rate: item.tax_rate || 0,
          item_category: item.item_category || null,
          line_order: index + 1
        })),

        // Store category mapping
        category_mapping: {
          business_category: expense_category,
          accounting_category: accountingCategory,
          category_name: categoryInfo?.business_category_name
        },

        // Store employee and business context
        employee_profile_id: employeeProfile.id,
        created_via: 'expense_claims_api'
      },

      // Store basic fields for UI convenience (duplicated from processing_metadata)
      vendor_name: vendor_name,
      total_amount: original_amount,
      currency: original_currency,
      transaction_date: transaction_date,
      reference_number: reference_number || null,

      // Store currency conversion for direct UI access
      home_currency: userHomeCurrency,
      home_currency_amount: homeAmount,
      exchange_rate: exchangeRate
    }

    // SECURITY FIX: Use authenticated client with proper business context validation
    const { data: expenseClaim, error: claimError } = await supabase
      .from('expense_claims')
      .insert(expenseClaimData)
      .select()
      .single()

    if (claimError) {
      console.error('[Expense Claims API] Failed to create expense claim:', claimError)
      return NextResponse.json(
        { success: false, error: 'Failed to create expense claim record' },
        { status: 500 }
      )
    }

    // SECURITY FIX: Log audit event using authenticated client with business context
    await supabase
      .from('audit_events')
      .insert({
        business_id: employeeProfile.business_id,
        actor_user_id: userData.id, // SECURITY FIX: Use Supabase UUID instead of Clerk ID
        event_type: 'expense_claim.created',
        target_entity_type: 'expense_claim',
        target_entity_id: expenseClaim.id,
        details: {
          expense_category,
          original_amount,
          original_currency,
          vendor_name,
          business_purpose_summary: business_purpose.substring(0, 100),
          processing_method: 'manual_entry',
          accounting_entry_created: false, // Will be created on approval
          line_items_count: line_items.length
        }
      })

    console.log(`[Expense Claims API] Created expense claim ${expenseClaim.id} for user ${userId}`)

    return NextResponse.json({
      success: true,
      data: {
        expense_claim: {
          ...expenseClaim,
          employee: employeeProfile
        }
      }
    })

  } catch (error) {
    console.error('[Expense Claims API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create expense claim'
      },
      { status: 500 }
    )
  }
}

// List expense claims with role-based filtering (Kevin's permissions model)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const params: ExpenseClaimListParams = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
      status: searchParams.get('status') as ExpenseStatus,
      expense_category: searchParams.get('expense_category') as ExpenseCategory,
      user_id: searchParams.get('user_id') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      claim_month: searchParams.get('claim_month') || undefined,
      search: searchParams.get('search') || undefined,
      sort_by: (searchParams.get('sort_by') as any) || 'submission_date',
      sort_order: (searchParams.get('sort_order') as any) || 'desc'
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile to determine role and permissions
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    let query = supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:accounting_entries(*),
        employee:users!inner(id,full_name,email)
      `)

    // Apply role-based filtering (Kevin's RLS approach)
    if (employeeProfile.role_permissions.admin) {
      // Admin can see all claims
      console.log('[Expense Claims API] Admin user - showing all claims')
    } else if (employeeProfile.role_permissions.manager) {
      // Managers can see their team's claims + their own claims
      // CRITICAL: Use user UUID, not membership ID
      query = query.or(`user_id.eq.${employeeProfile.user_id},current_approver_id.eq.${employeeProfile.user_id}`)
    } else {
      // Employees can only see their own claims
      // CRITICAL: Use user UUID, not membership ID
      query = query.eq('user_id', employeeProfile.user_id)
    }

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status)
    }

    if (params.expense_category) {
      query = query.eq('expense_category', params.expense_category)
    }

    if (params.user_id && employeeProfile.role_permissions.manager) {
      query = query.eq('user_id', params.user_id)
    }

    if (params.date_from) {
      query = query.gte('submission_date', params.date_from)
    }

    if (params.date_to) {
      query = query.lte('submission_date', params.date_to)
    }

    if (params.claim_month) {
      query = query.eq('claim_month', params.claim_month)
    }

    if (params.search) {
      const sanitizedSearch = params.search.replace(/[%_]/g, '\\$&').replace(/[^\w\s-]/g, '')
      if (sanitizedSearch.trim()) {
        query = query.or(`business_purpose.ilike.%${sanitizedSearch}%,transaction.description.ilike.%${sanitizedSearch}%`)
      }
    }

    // Apply sorting
    const validSortColumns = ['submission_date', 'created_at', 'status']
    let sortColumn = 'created_at'
    
    if (params.sort_by === 'submission_date') {
      sortColumn = 'submission_date'
    } else if (params.sort_by === 'status') {
      sortColumn = 'status'
    }
    
    const sortOrder = params.sort_order === 'asc' ? 'asc' : 'desc'
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

    // Apply pagination
    const offset = (params.page! - 1) * params.limit!
    query = query.range(offset, offset + params.limit! - 1)

    const { data: claims, error, count } = await query

    if (error) {
      console.error('[Expense Claims API] Failed to fetch claims:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch expense claims' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('expense_claims')
      .select('*', { count: 'exact', head: true })

    // Apply same role-based filtering for count
    if (!employeeProfile.role_permissions.admin) {
      if (employeeProfile.role_permissions.manager) {
        // CRITICAL: Use user UUID, not membership ID
        countQuery = countQuery.or(`user_id.eq.${employeeProfile.user_id},current_approver_id.eq.${employeeProfile.user_id}`)
      } else {
        // CRITICAL: Use user UUID, not membership ID
        countQuery = countQuery.eq('user_id', employeeProfile.user_id)
      }
    }

    const { count: totalCount } = await countQuery

    const hasMore = offset + params.limit! < (totalCount || 0)

    return NextResponse.json({
      success: true,
      data: {
        claims: claims || [],
        pagination: {
          page: params.page!,
          limit: params.limit!,
          total: totalCount || 0,
          has_more: hasMore,
          total_pages: Math.ceil((totalCount || 0) / params.limit!)
        }
      }
    })

  } catch (error) {
    console.error('[Expense Claims API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch expense claims'
      },
      { status: 500 }
    )
  }
}