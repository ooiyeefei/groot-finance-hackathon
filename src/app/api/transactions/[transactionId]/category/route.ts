import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createUserSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
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

    const { transactionId } = await params
    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
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

    // Validate category against known categories
    const validCategories = [
      // Income categories
      'operating_revenue',
      'other_income', 
      'investment_income',
      'government_grants',
      
      // Expense categories
      'cost_of_goods_sold',
      'administrative_expenses',
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
      'professional_services',
      
      // Legacy categories removed - now covered by IFRS categories:
      // 'General Expenses' → 'other_operating' (Other Operating Expenses)
      // 'General Income' → 'other_income' (Other Income)
      // 'Other' → 'other_operating' (Other Operating Expenses)
    ]

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    // Create user-scoped Supabase client with RLS
    const supabase = await createUserSupabaseClient()

    // Verify the transaction exists and belongs to the user
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id')
      .eq('id', transactionId)
      .single()

    if (fetchError) {
      console.error('Error fetching transaction:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch transaction' },
        { status: 500 }
      )
    }

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    if (transaction.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only update your own transactions' },
        { status: 403 }
      )
    }

    // Update the transaction category
    const { data: updatedTransaction, error: updateError } = await supabase
      .from('transactions')
      .update({
        category: category,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .select('id, category, updated_at')
      .single()

    if (updateError) {
      console.error('Error updating transaction category:', updateError)
      return NextResponse.json(
        { error: 'Failed to update transaction category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction category updated successfully',
      transaction: updatedTransaction
    })

  } catch (error) {
    console.error('Error in transaction category update:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}