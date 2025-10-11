/**
 * Individual Accounting Entry CRUD API Endpoints
 * Handles get, update, and delete operations for specific P&L entries
 * REFACTOR: Updated from transactions to accounting_entries for P&L structure
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'
import { currencyService } from '@/lib/currency-service'
import { CrossBorderTaxComplianceTool } from '@/lib/tools'
import { UpdateTransactionRequest, SupportedCurrency } from '@/types/transaction'

// Get specific accounting entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
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
    const entryId = resolvedParams.entryId

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: 'Accounting entry ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Accounting Entry API] Getting entry ${entryId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    const { data: accountingEntry, error } = await supabase
      .from('accounting_entries')
      .select(`
        *,
        line_items!left (*)
      `)
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .or('deleted_at.is.null', { foreignTable: 'line_items' })
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Accounting entry not found' },
          { status: 404 }
        )
      }
      console.error('[Accounting Entry API] Failed to fetch entry:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch accounting entry' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { transaction: accountingEntry } // Keep "transaction" key for backwards compatibility
    })

  } catch (error) {
    console.error('[Accounting Entry API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// Update accounting entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
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
    const entryId = resolvedParams.entryId

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: 'Accounting entry ID is required' },
        { status: 400 }
      )
    }

    const body: UpdateTransactionRequest = await request.json()

    console.log(`[Accounting Entry API] Updating entry ${entryId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    // First, verify the entry exists and belongs to the user
    const { data: existingEntry, error: fetchError } = await supabase
      .from('accounting_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Accounting entry not found' },
          { status: 404 }
        )
      }
      console.error('[Accounting Entry API] Failed to fetch existing entry:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to verify accounting entry' },
        { status: 500 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // P&L VALIDATION: Only allow Income, Cost of Goods Sold, Expense
    if (body.transaction_type !== undefined) {
      if (!['Income', 'Cost of Goods Sold', 'Expense'].includes(body.transaction_type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid accounting entry type. Only Income, Cost of Goods Sold, and Expense are allowed.' },
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
      // Validate date: set to null if empty string, otherwise use the value
      updateData.transaction_date = body.transaction_date === '' ? null : body.transaction_date
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

    if (body.status !== undefined) {
      updateData.status = body.status
    }

    if (body.due_date !== undefined) {
      // Validate date: set to null if empty string, otherwise use the value
      updateData.due_date = body.due_date === '' ? null : body.due_date
    }

    if (body.payment_date !== undefined) {
      // Validate date: set to null if empty string, otherwise use the value
      updateData.payment_date = body.payment_date === '' ? null : body.payment_date
    }

    if (body.payment_method !== undefined) {
      updateData.payment_method = body.payment_method
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes
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
      const newCurrency = body.original_currency || existingEntry.original_currency
      const newAmount = body.original_amount || existingEntry.original_amount

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
      const homeCurrency: SupportedCurrency = body.home_currency || existingEntry.home_currency || 'USD'

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
          console.error('[Accounting Entry API] Currency conversion failed during update:', error)
          // Keep existing conversion data if conversion fails
        }
      } else {
        updateData.home_currency_amount = newAmount
        updateData.exchange_rate = 1
        updateData.exchange_rate_date = new Date().toISOString().split('T')[0]
      }
    }

    // SECURITY: Update entry with proper UUID validation
    const { data: updatedEntry, error: updateError } = await supabase
      .from('accounting_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .select(`
        *,
        line_items!left (*)
      `)
      .single()

    if (updateError) {
      console.error('[Accounting Entry API] Failed to update entry:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update accounting entry' },
        { status: 500 }
      )
    }

    console.log(`[Accounting Entry API] Successfully updated entry ${entryId}`)

    // Handle line items update if provided
    if (body.line_items && Array.isArray(body.line_items)) {
      console.log(`[Accounting Entry API] Updating ${body.line_items.length} line items for entry ${entryId}`)

      // Delete existing line items (soft delete)
      const deletedAt = new Date().toISOString()
      const { error: deleteLineItemsError } = await supabase
        .from('line_items')
        .update({
          deleted_at: deletedAt,
          updated_at: deletedAt
        })
        .eq('accounting_entry_id', entryId)

      if (deleteLineItemsError) {
        console.error('[Accounting Entry API] Failed to delete existing line items:', deleteLineItemsError)
      }

      // Create new line items
      const updatedLineItems = []
      for (let i = 0; i < body.line_items.length; i++) {
        const lineItem = body.line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price

        const { data: createdLineItem, error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            accounting_entry_id: entryId,
            item_description: lineItem.description,
            item_code: lineItem.item_code || null,
            quantity: lineItem.quantity,
            unit_measurement: lineItem.unit_measurement || null,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: updatedEntry.original_currency,
            tax_rate: lineItem.tax_rate || 0,
            tax_amount: lineItem.tax_rate ? lineTotal * lineItem.tax_rate : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })
          .select()
          .single()

        if (lineItemError) {
          console.error('[Accounting Entry API] Failed to create updated line item:', lineItemError)
        } else {
          console.log('[Accounting Entry API] Successfully updated line item:', createdLineItem)
          updatedLineItems.push(createdLineItem)
        }
      }

      // Update the response with new line items
      updatedEntry.line_items = updatedLineItems
      console.log(`[Accounting Entry API] Successfully updated ${updatedLineItems.length} line items`)
    }

    // TASK 2: Cross-border compliance analysis for updated entries
    // Check if currency or amount changed and if it's now a cross-border transaction
    const finalHomeCurrency = updatedEntry.home_currency
    const finalOriginalCurrency = updatedEntry.original_currency
    const isCrossBorderTransaction = finalOriginalCurrency !== finalHomeCurrency

    if (isCrossBorderTransaction) {
      console.log(`[Accounting Entry API] Cross-border transaction detected after update: ${finalOriginalCurrency} → ${finalHomeCurrency}`)

      // Asynchronously trigger compliance analysis (don't block response)
      setImmediate(async () => {
        try {
          const complianceTool = new CrossBorderTaxComplianceTool()

          const analysisResult = await complianceTool.execute({
            transaction_id: entryId,
            amount: updatedEntry.original_amount,
            original_currency: finalOriginalCurrency,
            home_currency: finalHomeCurrency,
            transaction_type: updatedEntry.transaction_type,
            category: updatedEntry.category,
            description: updatedEntry.description,
            vendor_name: updatedEntry.vendor_name
          }, {
            userId: userId
          })

          if (analysisResult.success) {
            console.log(`[Accounting Entry API] Compliance analysis completed for updated entry ${entryId}`)
          } else {
            console.error(`[Accounting Entry API] Compliance analysis failed for updated entry ${entryId}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Accounting Entry API] Compliance analysis error for updated entry ${entryId}:`, error)
        }
      })
    } else {
      console.log(`[Accounting Entry API] Domestic transaction after update (${finalOriginalCurrency}), skipping compliance analysis`)
    }

    return NextResponse.json({
      success: true,
      data: { transaction: updatedEntry } // Keep "transaction" key for backwards compatibility
    })

  } catch (error) {
    console.error('[Accounting Entry API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// Delete accounting entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
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
    const entryId = resolvedParams.entryId

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: 'Accounting entry ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Accounting Entry API] Deleting entry ${entryId} for user ${userId}`)

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    // First verify the entry exists and belongs to the user (and is not already deleted)
    const { data: existingEntry, error: fetchError } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Accounting entry not found' },
          { status: 404 }
        )
      }
      console.error('[Accounting Entry API] Failed to verify entry for deletion:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Failed to verify accounting entry' },
        { status: 500 }
      )
    }

    const deletedAt = new Date().toISOString()

    // SECURITY: Soft delete with proper UUID validation
    const { error: deleteError } = await supabase
      .from('accounting_entries')
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID

    if (deleteError) {
      console.error('[Accounting Entry API] Failed to soft delete entry:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete accounting entry' },
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
      .eq('accounting_entry_id', entryId)

    if (lineItemsDeleteError) {
      console.error('[Accounting Entry API] Failed to soft delete line items:', lineItemsDeleteError)
      // Continue with success since entry was deleted, but log the line items error
    }

    console.log(`[Accounting Entry API] Successfully deleted entry ${entryId}`)

    return NextResponse.json({
      success: true,
      data: { message: 'Accounting entry deleted successfully' }
    })

  } catch (error) {
    console.error('[Accounting Entry API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}