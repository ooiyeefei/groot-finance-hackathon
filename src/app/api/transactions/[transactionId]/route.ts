/**
 * Individual Transaction CRUD API Endpoints
 * Handles get, update, and delete operations for specific transactions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { currencyService } from '@/lib/currency-service'
import { CrossBorderTaxComplianceTool } from '@/lib/tools'
import { UpdateTransactionRequest, SupportedCurrency } from '@/types/transaction'

// Get specific transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const transactionId = resolvedParams.transactionId

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Transaction API] Getting transaction ${transactionId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        line_items!left (*)
      `)
      .eq('id', transactionId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .or('deleted_at.is.null', { foreignTable: 'line_items' })
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 }
        )
      }
      console.error('[Transaction API] Failed to fetch transaction:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { transaction }
    })

  } catch (error) {
    console.error('[Transaction API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// Update transaction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const transactionId = resolvedParams.transactionId

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      )
    }

    const body: UpdateTransactionRequest = await request.json()
    
    console.log(`[Transaction API] Updating transaction ${transactionId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // First, verify the transaction exists and belongs to the user
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 }
        )
      }
      console.error('[Transaction API] Failed to fetch existing transaction:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to verify transaction' },
        { status: 500 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Only update provided fields
    if (body.transaction_type !== undefined) {
      if (!['income', 'expense', 'transfer'].includes(body.transaction_type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid transaction type' },
          { status: 400 }
        )
      }
      updateData.transaction_type = body.transaction_type
    }

    if (body.category !== undefined) {
      updateData.category = body.category
    }

    if (body.subcategory !== undefined) {
      updateData.subcategory = body.subcategory
    }

    if (body.description !== undefined) {
      updateData.description = body.description
    }

    if (body.transaction_date !== undefined) {
      updateData.transaction_date = body.transaction_date
    }

    if (body.vendor_name !== undefined) {
      updateData.vendor_name = body.vendor_name
    }

    if (body.reference_number !== undefined) {
      updateData.reference_number = body.reference_number
    }

    if (body.document_type !== undefined) {
      updateData.document_type = body.document_type
    }

    // Handle home currency update
    if (body.home_currency !== undefined) {
      // Validate home currency if changed
      if (!currencyService.isSupportedCurrency(body.home_currency)) {
        return NextResponse.json(
          { success: false, error: `Unsupported home currency: ${body.home_currency}` },
          { status: 400 }
        )
      }
      updateData.home_currency = body.home_currency
    }

    // Handle currency and amount updates
    if (body.original_currency !== undefined || body.original_amount !== undefined || body.home_currency !== undefined) {
      const newCurrency = body.original_currency || existingTransaction.original_currency
      const newAmount = body.original_amount || existingTransaction.original_amount

      // Validate currency if changed
      if (body.original_currency && !currencyService.isSupportedCurrency(body.original_currency)) {
        return NextResponse.json(
          { success: false, error: `Unsupported currency: ${body.original_currency}` },
          { status: 400 }
        )
      }

      // Validate amount if changed
      if (body.original_amount !== undefined && (typeof body.original_amount !== 'number' || body.original_amount <= 0)) {
        return NextResponse.json(
          { success: false, error: 'Amount must be a positive number' },
          { status: 400 }
        )
      }

      updateData.original_currency = newCurrency
      updateData.original_amount = newAmount

      // Recalculate home currency conversion - use updated home currency if provided
      const homeCurrency: SupportedCurrency = body.home_currency || existingTransaction.home_currency || 'USD'
      
      if (newCurrency !== homeCurrency) {
        try {
          const conversion = await currencyService.convertAmount(
            newAmount,
            newCurrency as SupportedCurrency,
            homeCurrency
          )
          updateData.home_currency_amount = conversion.converted_amount
          updateData.exchange_rate = conversion.exchange_rate
          updateData.exchange_rate_date = conversion.rate_date
        } catch (error) {
          console.error('[Transaction API] Currency conversion failed during update:', error)
          // Keep existing conversion data if conversion fails
        }
      } else {
        updateData.home_currency_amount = newAmount
        updateData.exchange_rate = 1
        updateData.exchange_rate_date = new Date().toISOString().split('T')[0]
      }
    }

    // SECURITY: Update transaction with proper UUID validation
    const { data: updatedTransaction, error: updateError } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .select(`
        *,
        line_items!left (*)
      `)
      .single()

    if (updateError) {
      console.error('[Transaction API] Failed to update transaction:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update transaction' },
        { status: 500 }
      )
    }

    console.log(`[Transaction API] Successfully updated transaction ${transactionId}`)

    // TASK 2: Cross-border compliance analysis for updated transactions
    // Check if currency or amount changed and if it's now a cross-border transaction
    const finalHomeCurrency = updatedTransaction.home_currency
    const finalOriginalCurrency = updatedTransaction.original_currency
    const isCrossBorderTransaction = finalOriginalCurrency !== finalHomeCurrency
    
    if (isCrossBorderTransaction) {
      console.log(`[Transaction API] Cross-border transaction detected after update: ${finalOriginalCurrency} → ${finalHomeCurrency}`)
      
      // Asynchronously trigger compliance analysis (don't block response)
      setImmediate(async () => {
        try {
          const complianceTool = new CrossBorderTaxComplianceTool()
          
          const analysisResult = await complianceTool.execute({
            transaction_id: transactionId,
            amount: updatedTransaction.original_amount,
            original_currency: finalOriginalCurrency,
            home_currency: finalHomeCurrency,
            transaction_type: updatedTransaction.transaction_type,
            category: updatedTransaction.category,
            description: updatedTransaction.description,
            vendor_name: updatedTransaction.vendor_name
          }, {
            userId: userId
          })

          if (analysisResult.success) {
            console.log(`[Transaction API] Compliance analysis completed for updated transaction ${transactionId}`)
          } else {
            console.error(`[Transaction API] Compliance analysis failed for updated transaction ${transactionId}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Transaction API] Compliance analysis error for updated transaction ${transactionId}:`, error)
        }
      })
    } else {
      console.log(`[Transaction API] Domestic transaction after update (${finalOriginalCurrency}), skipping compliance analysis`)
    }

    return NextResponse.json({
      success: true,
      data: { transaction: updatedTransaction }
    })

  } catch (error) {
    console.error('[Transaction API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// Delete transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const transactionId = resolvedParams.transactionId

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Transaction API] Deleting transaction ${transactionId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // First verify the transaction exists and belongs to the user (and is not already deleted)
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', transactionId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 }
        )
      }
      console.error('[Transaction API] Failed to verify transaction for deletion:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to verify transaction' },
        { status: 500 }
      )
    }

    const deletedAt = new Date().toISOString()

    // SECURITY: Soft delete with proper UUID validation
    const { error: deleteError } = await supabase
      .from('transactions')
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq('id', transactionId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID

    if (deleteError) {
      console.error('[Transaction API] Failed to soft delete transaction:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete transaction' },
        { status: 500 }
      )
    }

    // Also soft delete associated line items to maintain referential integrity
    const { error: lineItemsDeleteError } = await supabase
      .from('line_items')
      .update({ 
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq('transaction_id', transactionId)

    if (lineItemsDeleteError) {
      console.error('[Transaction API] Failed to soft delete line items:', lineItemsDeleteError)
      // Continue with success since transaction was deleted, but log the line items error
    }

    console.log(`[Transaction API] Successfully deleted transaction ${transactionId}`)

    return NextResponse.json({
      success: true,
      data: { message: 'Transaction deleted successfully' }
    })

  } catch (error) {
    console.error('[Transaction API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}