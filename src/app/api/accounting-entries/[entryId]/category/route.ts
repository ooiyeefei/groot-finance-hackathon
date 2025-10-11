/**
 * Accounting Entry Category Update API
 * Updates P&L category for accounting entries (Level 2 business categories within P&L structure)
 * REFACTOR: Updated from transactions to use accounting_entries table with P&L validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    // Authenticate the user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { entryId } = await params
    if (!entryId) {
      return NextResponse.json(
        { error: 'Accounting entry ID is required' },
        { status: 400 }
      )
    }

    // Parse the request body
    const body = await request.json()
    const { category } = body

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'Category is required and must be a string' },
        { status: 400 }
      )
    }

    console.log(`[Accounting Entry Category API] Updating category for entry ${entryId} to ${category}`)

    // P&L Level 2 Category Validation - these are business-specific categories within P&L structure
    const validCategories = [
      // Income categories (Level 2)
      'operating_revenue',
      'other_income',
      'investment_income',
      'government_grants',

      // Expense categories (Level 2) - used for both COGS and Expense P&L types
      'cost_of_goods_sold',
      'other_operating',
      'marketing_advertising',
      'travel_entertainment',
      'utilities_communications',
      'rent_facilities',
      'insurance',
      'taxes_licenses',
      'depreciation',
      'interest_expense',
      'other_operating',
      'software_subscriptions',
      'professional_services'
    ]

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid P&L category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    // SECURITY: Get user data and create authenticated client
    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    // Verify the entry exists and belongs to the user
    const { data: accountingEntry, error: fetchError } = await supabase
      .from('accounting_entries')
      .select('id, user_id, transaction_type')
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .single()

    if (fetchError) {
      console.error('[Accounting Entry Category API] Error fetching entry:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch accounting entry' },
        { status: 500 }
      )
    }

    if (!accountingEntry) {
      return NextResponse.json(
        { error: 'Accounting entry not found' },
        { status: 404 }
      )
    }

    // P&L VALIDATION: Ensure category aligns with P&L type
    const entryType = accountingEntry.transaction_type
    const isIncomeCategory = ['operating_revenue', 'other_income', 'investment_income', 'government_grants'].includes(category)
    const isExpenseCategory = !isIncomeCategory

    if (entryType === 'Income' && !isIncomeCategory) {
      return NextResponse.json(
        { error: 'Income entries can only use income categories (operating_revenue, other_income, investment_income, government_grants)' },
        { status: 400 }
      )
    }

    if ((entryType === 'Cost of Goods Sold' || entryType === 'Expense') && !isExpenseCategory) {
      return NextResponse.json(
        { error: 'Cost of Goods Sold and Expense entries can only use expense categories' },
        { status: 400 }
      )
    }

    // Update the entry category
    const { data: updatedEntry, error: updateError } = await supabase
      .from('accounting_entries')
      .update({
        category: category,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY: Use Supabase UUID instead of Clerk ID
      .select('id, category, transaction_type, updated_at')
      .single()

    if (updateError) {
      console.error('[Accounting Entry Category API] Error updating category:', updateError)
      return NextResponse.json(
        { error: 'Failed to update accounting entry category' },
        { status: 500 }
      )
    }

    console.log(`[Accounting Entry Category API] Successfully updated entry ${entryId} category to ${category}`)

    return NextResponse.json({
      success: true,
      message: 'Accounting entry category updated successfully',
      data: {
        entry: updatedEntry,
        p_and_l_structure: true,
        note: `Level 2 category '${category}' updated within P&L type '${entryType}'`
      }
    })

  } catch (error) {
    console.error('[Accounting Entry Category API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}