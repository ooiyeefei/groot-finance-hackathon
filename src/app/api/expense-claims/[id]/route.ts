/**
 * Individual Expense Claim API Routes
 * GET - Fetch single expense claim
 * PUT - Update existing expense claim
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
import { currencyService } from '@/lib/currency-service'
import { SupportedCurrency } from '@/types/transaction'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/expense-claims/[id] - Fetch single expense claim
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Get user profile to convert Clerk userId to user UUID
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get user profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API GET] User ${userId} accessing claim ${id}`)
    console.log(`[Individual Claim API GET] User profile:`, {
      membershipId: userProfile.id,
      userId: userProfile.user_id,
      businessId: userProfile.business_id,
      role: userProfile.role,
      rolePermissions: userProfile.role_permissions
    })

    // Determine which Supabase client to use based on user roles
    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS (same as dashboard API)
      console.log(`[Individual Claim API GET] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API GET] Using authenticated client for employee user`)
      supabase = await createBusinessContextSupabaseClient()
    }

    // Fetch the expense claim with related transaction data and line items
    // Expense Claims module: Always read from expense_claims table only
    let claimQuery = supabase
      .from('expense_claims')
      .select('*')
      .eq('id', id)

    // For service client, we need to manually check access permissions
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      claimQuery = claimQuery.eq('business_id', userProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      // CRITICAL: Use user UUID, not membership ID
      claimQuery = claimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: claim, error } = await claimQuery.single()

    if (error) {
      console.error('Error fetching expense claim:', error)
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Transform the data to match the expected frontend structure
    // Expense Claims module: Always read from expense_claims table for all statuses
    const transformedClaim = {
      ...claim,
      // Always use processing_metadata from expense_claims
      extracted_data: claim.processing_metadata || null,
      // Construct consistent transaction interface from expense_claims data
      transaction: {
        id: claim.accounting_entry_id, // Links to accounting_entries if approved
        description: claim.description,
        original_amount: claim.total_amount,
        original_currency: claim.currency,
        home_currency_amount: claim.home_currency_amount || claim.total_amount,
        home_currency: claim.home_currency || claim.currency,
        transaction_date: claim.transaction_date,
        vendor_name: claim.vendor_name,
        vendor_id: null,
        reference_number: claim.processing_metadata?.financial_data?.reference_number || null,
        notes: null,
        processing_metadata: claim.processing_metadata,
        business_purpose: claim.business_purpose,
        expense_category: claim.expense_category,
        line_items: claim.processing_metadata?.line_items?.map((item: any, index: number) => ({
          id: `temp-${index}`,
          item_description: item.description || item.item_description, 
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.total_amount
        })) || []
      }
    }

    return NextResponse.json({
      success: true,
      data: transformedClaim
    })

  } catch (error) {
    console.error('Error in GET /api/expense-claims/[id]:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/expense-claims/[id] - Update existing expense claim
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    
    // Get employee profile to convert Clerk userId to employee UUID
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API PUT] User ${userId} updating claim ${id}`)
    console.log(`[Individual Claim API PUT] Employee profile:`, {
      profileId: userProfile.id,
      rolePermissions: userProfile.role_permissions
    })

    // Determine which Supabase client to use based on user roles
    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS
      console.log(`[Individual Claim API PUT] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API PUT] Using authenticated client for employee user`)
      supabase = await createBusinessContextSupabaseClient()
    }

    // First, check if the expense claim exists and is accessible by the user
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select('*')
      .eq('id', id)

    // Apply appropriate access control based on role
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      existingClaimQuery = existingClaimQuery.eq('business_id', userProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      // CRITICAL: Use user UUID, not membership ID
      existingClaimQuery = existingClaimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow editing if the claim is still in draft status
    if (existingClaim.status !== 'draft') { // ✅ Unified status field
      return NextResponse.json(
        { success: false, error: 'Cannot edit expense claims that have been submitted' },
        { status: 400 }
      )
    }

    // For Expense Claims module: Update expense_claims fields directly (no accounting_entries update)

    // Get user's home currency for conversion
    const userHomeCurrency = body.home_currency || 'SGD'

    // Convert to home currency if different
    let homeAmount = body.original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

    if (body.original_currency !== userHomeCurrency && body.original_amount > 0) {
      try {
        const conversion = await currencyService.convertAmount(
          body.original_amount,
          body.original_currency,
          userHomeCurrency as SupportedCurrency
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
        exchangeRateDate = conversion.rate_date

      } catch (error) {
        console.error('[Individual Claim API PUT] Currency conversion failed:', error)
      }
    }

    // Prepare update data with all fields including currency conversion
    const updateData: any = {
      description: body.description,
      vendor_name: body.vendor_name,
      total_amount: body.original_amount,
      currency: body.original_currency,
      transaction_date: body.transaction_date,
      business_purpose: body.business_purpose,
      expense_category: body.expense_category,

      // Currency conversion fields
      home_currency: userHomeCurrency,
      home_currency_amount: homeAmount,
      exchange_rate: exchangeRate,

      updated_at: new Date().toISOString()
    }

    // Include enhanced fields if provided
    if (body.business_purpose_details) {
      updateData.business_purpose_details = body.business_purpose_details
    }

    // Handle line items updates in processing_metadata if provided
    if (body.line_items && Array.isArray(body.line_items)) {
      console.log(`[Individual Claim API PUT] Updating ${body.line_items.length} line items in processing_metadata`)

      // Get existing processing_metadata to preserve other fields
      const existingMetadata = existingClaim.processing_metadata || {}

      // Update line items in metadata
      const updatedLineItems = body.line_items.map((item: any, index: number) => ({
        item_description: item.description || item.item_description || 'Item',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_amount: item.total_amount || 0,
        currency: body.original_currency,
        tax_amount: item.tax_amount || 0,
        tax_rate: item.tax_rate || 0,
        item_category: item.item_category || null,
        line_order: index + 1
      }))

      // Update processing_metadata with new line items
      updateData.processing_metadata = {
        ...existingMetadata,
        line_items: updatedLineItems,
        last_updated: new Date().toISOString(),
        update_source: 'manual_edit'
      }
    }

    // Single update to expense_claims table
    const { error: claimUpdateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', id)

    if (claimUpdateError) {
      console.error('Error updating expense claim:', claimUpdateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim' },
        { status: 500 }
      )
    }

    // Fetch the updated claim to return
    const { data: updatedClaim, error: refetchError } = await supabase
      .from('expense_claims')
      .select('*')
      .eq('id', id)
      .single()

    if (refetchError) {
      console.error('Error refetching updated claim:', refetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch updated claim' },
        { status: 500 }
      )
    }

    // Transform the updated data to match the expected frontend structure
    const transformedUpdatedClaim = {
      ...updatedClaim,
      transaction: updatedClaim.transaction ? {
        ...updatedClaim.transaction,
        business_purpose: updatedClaim.business_purpose,
        expense_category: updatedClaim.expense_category
      } : null
    }

    return NextResponse.json({
      success: true,
      data: transformedUpdatedClaim,
      message: 'Expense claim updated successfully'
    })

  } catch (error) {
    console.error('Error in PUT /api/expense-claims/[id]:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/expense-claims/[id] - Delete expense claim (drafts only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    
    // Get employee profile to convert Clerk userId to employee UUID
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API DELETE] User ${userId} deleting claim ${id}`)

    // Determine which Supabase client to use based on user roles
    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS
      console.log(`[Individual Claim API DELETE] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API DELETE] Using authenticated client for employee user`)
      supabase = await createBusinessContextSupabaseClient()
    }

    // First, check if the expense claim exists and is accessible
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select('id, status, accounting_entry_id, user_id, business_id') // ✅ Unified status field
      .eq('id', id)

    // Apply appropriate access control based on role
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      existingClaimQuery = existingClaimQuery.eq('business_id', userProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      // CRITICAL: Use user UUID, not membership ID
      existingClaimQuery = existingClaimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow deleting draft claims
    if (existingClaim.status !== 'draft') { // ✅ Unified status field
      return NextResponse.json(
        { success: false, error: 'Only draft expense claims can be deleted' },
        { status: 400 }
      )
    }

    // Delete the associated accounting entry first (if exists)
    if (existingClaim.accounting_entry_id) {
      const { error: accountingDeleteError } = await supabase
        .from('accounting_entries')
        .delete()
        .eq('id', existingClaim.accounting_entry_id)

      if (accountingDeleteError) {
        console.error('Error deleting accounting entry:', accountingDeleteError)
        return NextResponse.json(
          { success: false, error: 'Failed to delete associated accounting entry' },
          { status: 500 }
        )
      }
    }

    // Delete the expense claim
    const { error: deleteError } = await supabase
      .from('expense_claims')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting expense claim:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete expense claim' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API DELETE] Successfully deleted claim ${id}`)

    return NextResponse.json({
      success: true,
      message: 'Expense claim deleted successfully'
    })

  } catch (error) {
    console.error('Error in DELETE /api/expense-claims/[id]:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}