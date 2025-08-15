/**
 * Transactions CRUD API Endpoints
 * Handles transaction creation, listing, and management
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { currencyService } from '@/lib/currency-service'
import { 
  CreateTransactionRequest, 
  SupportedCurrency, 
  TransactionListParams,
  TRANSACTION_CATEGORIES 
} from '@/types/transaction'

// Create new transaction
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CreateTransactionRequest = await request.json()
    const {
      transaction_type,
      category,
      subcategory,
      description,
      transaction_date,
      original_currency,
      original_amount,
      vendor_name,
      reference_number,
      line_items = []
    } = body

    // Validate required fields
    if (!transaction_type || !category || !description || !transaction_date || 
        !original_currency || !original_amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate transaction type
    if (!['income', 'expense', 'transfer'].includes(transaction_type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction type' },
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

    // Validate amount
    if (typeof original_amount !== 'number' || original_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Validate category exists in our predefined categories
    const typeCategories = TRANSACTION_CATEGORIES[transaction_type]
    const validCategories = Object.keys(typeCategories)
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category '${category}' for transaction type '${transaction_type}'` },
        { status: 400 }
      )
    }

    console.log(`[Transactions API] Creating ${transaction_type} transaction for user ${userId}`)

    const supabase = createServiceSupabaseClient()

    // Get user's home currency (default to USD for now)
    const homeCurrency: SupportedCurrency = 'USD' // TODO: Get from user profile

    // Convert to home currency
    let homeAmount = original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

    if (original_currency !== homeCurrency) {
      try {
        const conversion = await currencyService.convertAmount(
          original_amount,
          original_currency,
          homeCurrency
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
        exchangeRateDate = conversion.rate_date
      } catch (error) {
        console.error('[Transactions API] Currency conversion failed:', error)
        // Continue with original amount as fallback
      }
    }

    // Create transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type,
        category,
        subcategory,
        description,
        reference_number,
        original_currency,
        original_amount,
        home_currency: homeCurrency,
        home_amount: homeAmount,
        exchange_rate: exchangeRate,
        exchange_rate_date: exchangeRateDate,
        transaction_date,
        vendor_name,
        created_by_method: 'manual',
        processing_metadata: {
          created_via: 'api',
          conversion_attempted: original_currency !== homeCurrency
        }
      })
      .select()
      .single()

    if (transactionError) {
      console.error('[Transactions API] Failed to create transaction:', transactionError)
      return NextResponse.json(
        { success: false, error: 'Failed to create transaction' },
        { status: 500 }
      )
    }

    // Create line items if provided
    const createdLineItems = []
    if (line_items.length > 0) {
      for (let i = 0; i < line_items.length; i++) {
        const lineItem = line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price
        
        const { data: createdLineItem, error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            transaction_id: transaction.id,
            description: lineItem.description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            line_total: lineTotal,
            tax_rate: lineItem.tax_rate,
            tax_amount: lineItem.tax_rate ? lineTotal * lineItem.tax_rate : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })
          .select()
          .single()

        if (lineItemError) {
          console.error('[Transactions API] Failed to create line item:', lineItemError)
          // Continue creating other line items
        } else {
          createdLineItems.push(createdLineItem)
        }
      }
    }

    console.log(`[Transactions API] Created transaction ${transaction.id} with ${createdLineItems.length} line items`)

    return NextResponse.json({
      success: true,
      data: {
        transaction: {
          ...transaction,
          line_items: createdLineItems
        }
      }
    })

  } catch (error) {
    console.error('[Transactions API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// List transactions with filtering and pagination
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
    const params: TransactionListParams = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100), // Max 100 per page
      transaction_type: searchParams.get('transaction_type') as any,
      category: searchParams.get('category') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      search: searchParams.get('search') || undefined,
      sort_by: (searchParams.get('sort_by') as any) || 'transaction_date',
      sort_order: (searchParams.get('sort_order') as any) || 'desc'
    }

    console.log(`[Transactions API] Listing transactions for user ${userId}:`, params)

    const supabase = createServiceSupabaseClient()
    let query = supabase
      .from('transactions')
      .select(`
        *,
        line_items (*)
      `)
      .eq('user_id', userId)

    // Apply filters
    if (params.transaction_type) {
      query = query.eq('transaction_type', params.transaction_type)
    }

    if (params.category) {
      query = query.eq('category', params.category)
    }

    if (params.date_from) {
      query = query.gte('transaction_date', params.date_from)
    }

    if (params.date_to) {
      query = query.lte('transaction_date', params.date_to)
    }

    if (params.search) {
      query = query.or(`description.ilike.%${params.search}%,vendor_name.ilike.%${params.search}%,reference_number.ilike.%${params.search}%`)
    }

    // Apply sorting
    const sortColumn = params.sort_by === 'amount' ? 'original_amount' : params.sort_by
    query = query.order(sortColumn!, { ascending: params.sort_order === 'asc' })

    // Apply pagination
    const offset = (params.page! - 1) * params.limit!
    query = query.range(offset, offset + params.limit! - 1)

    const { data: transactions, error, count } = await query

    if (error) {
      console.error('[Transactions API] Failed to fetch transactions:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch transactions' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const hasMore = offset + params.limit! < (totalCount || 0)

    return NextResponse.json({
      success: true,
      data: {
        transactions: transactions || [],
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
    console.error('[Transactions API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}