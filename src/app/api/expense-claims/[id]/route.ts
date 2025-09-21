/**
 * Individual Expense Claim API Routes
 * GET - Fetch single expense claim
 * PUT - Update existing expense claim
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
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

    // Get employee profile to convert Clerk userId to employee UUID
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API GET] User ${userId} accessing claim ${id}`)
    console.log(`[Individual Claim API GET] Employee profile:`, {
      profileId: employeeProfile.id,
      userId: employeeProfile.user_id,
      employeeId: employeeProfile.employee_id,
      rolePermissions: employeeProfile.role_permissions
    })

    // Determine which Supabase client to use based on user roles
    const isAdmin = employeeProfile.role_permissions.admin
    const isManager = employeeProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS (same as dashboard API)
      console.log(`[Individual Claim API GET] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API GET] Using authenticated client for employee user`)
      supabase = await createAuthenticatedSupabaseClient(userId)
    }

    // Fetch the expense claim with related transaction data and line items
    // Note: business_purpose and expense_category are in expense_claims, not transactions
    let claimQuery = supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          original_amount,
          original_currency,
          home_currency_amount,
          home_currency,
          transaction_date,
          vendor_name,
          vendor_id,
          reference_number,
          notes,
          processing_metadata,
          line_items(
            id,
            item_description,
            quantity,
            unit_price,
            total_amount
          )
        )
      `)
      .eq('id', id)

    // For service client, we need to manually check access permissions
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      claimQuery = claimQuery.eq('business_id', employeeProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      claimQuery = claimQuery.eq('employee_id', employeeProfile.id)
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
    // business_purpose and expense_category are in expense_claims, but frontend expects them in transaction
    const transformedClaim = {
      ...claim,
      // Include extracted_data from transaction's processing_metadata if available
      extracted_data: claim.transaction?.processing_metadata?.extracted_data || null,
      transaction: claim.transaction ? {
        ...claim.transaction,
        business_purpose: claim.business_purpose,  // Move from expense_claims to transaction object
        expense_category: claim.expense_category   // Move from expense_claims to transaction object
      } : null
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
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API PUT] User ${userId} updating claim ${id}`)
    console.log(`[Individual Claim API PUT] Employee profile:`, {
      profileId: employeeProfile.id,
      rolePermissions: employeeProfile.role_permissions
    })

    // Determine which Supabase client to use based on user roles
    const isAdmin = employeeProfile.role_permissions.admin
    const isManager = employeeProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS
      console.log(`[Individual Claim API PUT] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API PUT] Using authenticated client for employee user`)
      supabase = await createAuthenticatedSupabaseClient(userId)
    }

    // First, check if the expense claim exists and is accessible by the user
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          original_amount,
          original_currency,
          home_currency_amount,
          home_currency,
          transaction_date,
          vendor_name,
          reference_number,
          notes,
          line_items(
            id,
            description,
            quantity,
            unit_price,
            total_amount
          )
        )
      `)
      .eq('id', id)

    // Apply appropriate access control based on role
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      existingClaimQuery = existingClaimQuery.eq('business_id', employeeProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      existingClaimQuery = existingClaimQuery.eq('employee_id', employeeProfile.id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow editing if the claim is still in draft status
    if (existingClaim.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Cannot edit expense claims that have been submitted' },
        { status: 400 }
      )
    }

    // Prepare transaction update data with currency conversion
    const transactionUpdateData: any = {
      description: body.description,
      original_amount: body.original_amount,
      original_currency: body.original_currency,
      home_currency: body.home_currency,
      transaction_date: body.transaction_date,
      vendor_name: body.vendor_name,
      vendor_id: body.vendor_id, // NEW: Support vendor_id updates
      reference_number: body.reference_number,
      notes: body.notes,
      updated_at: new Date().toISOString()
    }

    // Calculate home currency amount if currencies are different
    if (body.original_currency !== body.home_currency && body.original_amount > 0) {
      console.log(`[Individual Claim API PUT] Converting ${body.original_amount} ${body.original_currency} to ${body.home_currency}`)

      try {
        // Use currency service directly instead of HTTP request
        const conversion = await currencyService.convertAmount(
          body.original_amount,
          body.original_currency as SupportedCurrency,
          body.home_currency as SupportedCurrency
        )

        transactionUpdateData.home_currency_amount = conversion.converted_amount
        transactionUpdateData.exchange_rate = conversion.exchange_rate
        console.log(`[Individual Claim API PUT] Converted to ${conversion.converted_amount} ${body.home_currency} (rate: ${conversion.exchange_rate})`)
      } catch (conversionError) {
        console.log(`[Individual Claim API PUT] Currency conversion error: ${conversionError}, setting home currency amount same as original`)
        transactionUpdateData.home_currency_amount = body.original_amount
      }
    } else {
      // Same currency - just copy the amount
      transactionUpdateData.home_currency_amount = body.original_amount
      console.log(`[Individual Claim API PUT] Same currency (${body.original_currency}), no conversion needed`)
    }

    // Update the associated transaction (with currency conversion)
    const { error: transactionError } = await supabase
      .from('transactions')
      .update(transactionUpdateData)
      .eq('id', existingClaim.transaction_id)

    if (transactionError) {
      console.error('Error updating transaction:', transactionError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense details' },
        { status: 500 }
      )
    }

    // Handle line items updates if provided
    if (body.line_items && Array.isArray(body.line_items)) {
      console.log(`[Individual Claim API PUT] Updating ${body.line_items.length} line items`)

      // First, delete existing line items for this transaction to avoid duplicates
      const { error: deleteLineItemsError } = await supabase
        .from('line_items')
        .delete()
        .eq('transaction_id', existingClaim.transaction_id)

      if (deleteLineItemsError) {
        console.warn(`[Individual Claim API PUT] Warning: Could not delete existing line items: ${deleteLineItemsError.message}`)
      }

      // Insert updated line items (only if there are items to insert)
      if (body.line_items.length > 0) {
        const lineItemsData = body.line_items.map((item: any, index: number) => ({
          transaction_id: existingClaim.transaction_id,
          item_description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          total_amount: item.total_amount || 0,
          currency: body.original_currency, // Required field - inherit from transaction
          tax_amount: 0,
          tax_rate: 0,
          item_category: null,
          item_code: item.item_code || null,
          unit_measurement: item.unit_measurement || null,
          line_order: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        const { error: lineItemsError } = await supabase
          .from('line_items')
          .insert(lineItemsData)

        if (lineItemsError) {
          console.error('Error inserting updated line items:', lineItemsError)
          console.warn(`[Individual Claim API PUT] Line items could not be saved: ${lineItemsError.message}`)
          // Don't fail the entire operation, just log the warning
        } else {
          console.log(`[Individual Claim API PUT] Successfully updated ${body.line_items.length} line items`)
        }
      }
    }

    // Update the expense claim (business_purpose and expense_category are here)
    const updateData: any = {
      business_purpose: body.business_purpose,
      expense_category: body.expense_category,
      updated_at: new Date().toISOString()
    }
    
    // Include enhanced fields if provided
    if (body.business_purpose_details) {
      updateData.business_purpose_details = body.business_purpose_details
    }
    
    const { error: expenseClaimError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', id)

    if (expenseClaimError) {
      console.error('Error updating expense claim:', expenseClaimError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim' },
        { status: 500 }
      )
    }

    // Fetch the updated claim to return (including line items)
    const { data: updatedClaim, error: refetchError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          original_amount,
          original_currency,
          home_currency_amount,
          home_currency,
          transaction_date,
          vendor_name,
          reference_number,
          notes,
          line_items(
            id,
            item_description,
            quantity,
            unit_price,
            total_amount,
            item_code,
            unit_measurement
          )
        )
      `)
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
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Individual Claim API DELETE] User ${userId} deleting claim ${id}`)

    // Determine which Supabase client to use based on user roles
    const isAdmin = employeeProfile.role_permissions.admin
    const isManager = employeeProfile.role_permissions.manager
    
    let supabase
    if (isAdmin || isManager) {
      // Admin/Manager users can use service client to bypass RLS
      console.log(`[Individual Claim API DELETE] Using service client for admin/manager user`)
      supabase = createServiceSupabaseClient()
    } else {
      // Regular employees use authenticated client with RLS
      console.log(`[Individual Claim API DELETE] Using authenticated client for employee user`)
      supabase = await createAuthenticatedSupabaseClient(userId)
    }

    // First, check if the expense claim exists and is accessible
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select('id, status, transaction_id, employee_id, business_id')
      .eq('id', id)

    // Apply appropriate access control based on role
    if (isAdmin || isManager) {
      // Admin/Manager can access claims within their business
      existingClaimQuery = existingClaimQuery.eq('business_id', employeeProfile.business_id)
    } else {
      // Regular employees can only access their own claims
      existingClaimQuery = existingClaimQuery.eq('employee_id', employeeProfile.id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow deleting draft claims
    if (existingClaim.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Only draft expense claims can be deleted' },
        { status: 400 }
      )
    }

    // Delete the associated transaction first (if exists)
    if (existingClaim.transaction_id) {
      const { error: transactionDeleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', existingClaim.transaction_id)

      if (transactionDeleteError) {
        console.error('Error deleting transaction:', transactionDeleteError)
        return NextResponse.json(
          { success: false, error: 'Failed to delete associated transaction' },
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