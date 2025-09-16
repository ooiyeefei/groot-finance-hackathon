/**
 * Expense Claims API Endpoints
 * Implements Otto's 7-stage workflow with Kevin's state machine pattern
 * and Mel's mobile-first user experience
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
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

// Otto's risk scoring algorithm
function calculateRiskScore(amount: number, category: ExpenseCategory, employee: any): number {
  let score = 0
  
  // Amount-based risk (0-40 points)
  if (amount > 5000) score += 40
  else if (amount > 2000) score += 30
  else if (amount > 1000) score += 20
  else if (amount > 500) score += 10
  
  // Category-based risk (0-30 points)
  const categoryRisk = {
    'entertainment': 30,
    'travel_accommodation': 25,
    'other': 20,
    'petrol': 10,
    'toll': 5
  }
  score += categoryRisk[category] || 0
  
  // Employee limit check (0-30 points)
  if (employee.expense_limit && amount > employee.expense_limit) {
    score += 30
  } else if (employee.expense_limit && amount > employee.expense_limit * 0.8) {
    score += 15
  }
  
  return Math.min(score, 100) // Cap at 100
}

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

    // Validate expense category (must match database constraint)
    const validCategories: ExpenseCategory[] = [
      'travel_accommodation', 
      'petrol', 
      'toll', 
      'entertainment', 
      'other'
    ]
    if (!validCategories.includes(expense_category)) {
      return NextResponse.json(
        { success: false, error: `Invalid expense category: ${expense_category}` },
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

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile
    const employeeProfile = await ensureEmployeeProfile(userId)

    if (!employeeProfile) {
      console.error('[Expense Claims API] Failed to create or retrieve employee profile')
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile. Please contact administrator.' },
        { status: 500 }
      )
    }


    // Get user's home currency from users table
    const { data: userInfo, error: userError } = await supabase
      .from('users')
      .select('home_currency')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !userInfo) {
      console.error('[Expense Claims API] Failed to get user currency info:', userError)
      return NextResponse.json(
        { success: false, error: 'Failed to get user information' },
        { status: 500 }
      )
    }

    const userHomeCurrency = userInfo.home_currency

    // Convert to home currency
    let homeAmount = original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

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
      } catch (error) {
        console.error('[Expense Claims API] Currency conversion failed:', error)
        // Continue with original amount as fallback
      }
    }

    // Server-side duplicate detection (final validation before creation)
    if (reference_number) {
      console.log(`[Expense Claims API] Performing server-side duplicate check for: ${reference_number}`)
      
      // Check for exact duplicates that would violate business rules
      const { data: existingTransactions, error: duplicateError } = await supabase
        .from('transactions')
        .select(`
          id,
          reference_number,
          transaction_date,
          original_amount,
          vendor_name,
          description,
          expense_claims!inner (
            id,
            status
          )
        `)
        .eq('user_id', userId)
        .eq('reference_number', reference_number)
        .eq('transaction_date', transaction_date)
        .eq('original_amount', original_amount)

      if (duplicateError) {
        console.error('[Expense Claims API] Duplicate check error:', duplicateError)
        // Continue processing - don't block on duplicate check failure
      } else if (existingTransactions && existingTransactions.length > 0) {
        const existing = existingTransactions[0]
        const existingClaim = existing.expense_claims[0]
        
        console.log(`[Expense Claims API] Duplicate detected: ${existing.id} (status: ${existingClaim.status})`)
        return NextResponse.json({
          success: false,
          error: 'duplicate_detected',
          duplicateData: {
            claimId: existingClaim.id,
            transactionId: existing.id,
            reference_number: existing.reference_number,
            transaction_date: existing.transaction_date,
            amount: existing.original_amount,
            vendor_name: existing.vendor_name,
            description: existing.description,
            status: existingClaim.status
          },
          message: `This expense has already been submitted (Reference: ${reference_number}, Date: ${transaction_date}, Amount: ${original_amount}). Please check your existing claims.`
        }, { status: 409 })
      }
    }

    // Create transaction record (Otto's approach: expense claims are transactions)
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type: 'expense',
        category: 'administrative_expenses', // Map to IFRS category
        subcategory: expense_category,
        description,
        reference_number,
        document_type: null, // No document_id dependency
        original_currency,
        original_amount,
        home_currency: userHomeCurrency,
        home_currency_amount: homeAmount, // Use correct column name
        exchange_rate: exchangeRate,
        exchange_rate_date: exchangeRateDate,
        transaction_date,
        vendor_name,
        vendor_id, // NEW: Link to vendors table
        notes,
        created_by_method: 'manual', // Unified approach - use business_purpose_details for file tracking
        processing_metadata: {
          expense_category,
          business_purpose,
          employee_profile_id: employeeProfile.id, // Store in metadata instead
          created_via: 'expense_claims_api'
        }
      })
      .select()
      .single()

    if (transactionError) {
      console.error('[Expense Claims API] Failed to create transaction:', transactionError)
      return NextResponse.json(
        { success: false, error: 'Failed to create transaction record' },
        { status: 500 }
      )
    }

    // Create line items if provided
    if (line_items.length > 0) {
      for (let i = 0; i < line_items.length; i++) {
        const lineItem = line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price
        
        const { error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            transaction_id: transaction.id,
            item_description: lineItem.description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: original_currency,
            tax_rate: lineItem.tax_rate,
            tax_amount: lineItem.tax_rate ? lineTotal * lineItem.tax_rate : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })

        if (lineItemError) {
          console.error('[Expense Claims API] Failed to create line item:', lineItemError)
        }
      }
    }

    // Create expense claim workflow record (Otto's 7-stage workflow)
    // Convert to first day of the month for database date field
    const transactionDate = new Date(transaction_date)
    const claimMonth = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1).toISOString().split('T')[0] // YYYY-MM-01 format

    // Otto's enhanced compliance fields
    const riskScore = calculateRiskScore(original_amount, expense_category, employeeProfile)
    
    const expenseClaimData = {
      transaction_id: transaction.id,
      employee_id: employeeProfile.id,
      business_id: employeeProfile.business_id,
      status: 'draft', // Start in draft status
      business_purpose,
      business_purpose_details: {
        category_reason: business_purpose,
        original_submission: body,
        risk_factors: {
          amount_threshold: original_amount > 1000,
          category_risk: ['travel_accommodation', 'entertainment'].includes(expense_category)
        }
      },
      expense_category,
      claim_month: claimMonth,
      risk_score: riskScore,
      current_approver_id: null // Will be set when submitted
    }

    // Use service role client to bypass RLS for expense claim creation (much simpler!)
    const serviceSupabase = createServiceSupabaseClient()
    const { data: expenseClaim, error: claimError } = await serviceSupabase
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

    // Log audit event for compliance tracking
    await serviceSupabase
      .from('audit_events')
      .insert({
        business_id: employeeProfile.business_id,
        actor_user_id: userId,
        event_type: 'expense_claim.created',
        target_entity_type: 'expense_claim',
        target_entity_id: expenseClaim.id,
        details: {
          expense_category,
          original_amount,
          original_currency,
          risk_score: riskScore,
          vendor_name,
          business_purpose_summary: business_purpose.substring(0, 100),
          created_from: 'manual_entry' // Unified approach
        }
      })

    console.log(`[Expense Claims API] Created expense claim ${expenseClaim.id} with risk score ${riskScore}`)

    return NextResponse.json({
      success: true,
      data: {
        expense_claim: {
          ...expenseClaim,
          transaction,
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
      employee_id: searchParams.get('employee_id') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      claim_month: searchParams.get('claim_month') || undefined,
      search: searchParams.get('search') || undefined,
      sort_by: (searchParams.get('sort_by') as any) || 'submission_date',
      sort_order: (searchParams.get('sort_order') as any) || 'desc'
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile to determine role and permissions
    const employeeProfile = await ensureEmployeeProfile(userId)

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
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)

    // Apply role-based filtering (Kevin's RLS approach)
    if (employeeProfile.role_permissions.admin) {
      // Admin can see all claims
      console.log('[Expense Claims API] Admin user - showing all claims')
    } else if (employeeProfile.role_permissions.manager) {
      // Managers can see their team's claims + their own claims
      query = query.or(`employee_id.eq.${employeeProfile.id},current_approver_id.eq.${employeeProfile.id}`)
    } else {
      // Employees can only see their own claims
      query = query.eq('employee_id', employeeProfile.id)
    }

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status)
    }

    if (params.expense_category) {
      query = query.eq('expense_category', params.expense_category)
    }

    if (params.employee_id && employeeProfile.role_permissions.manager) {
      query = query.eq('employee_id', params.employee_id)
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
        countQuery = countQuery.or(`employee_id.eq.${employeeProfile.id},current_approver_id.eq.${employeeProfile.id}`)
      } else {
        countQuery = countQuery.eq('employee_id', employeeProfile.id)
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