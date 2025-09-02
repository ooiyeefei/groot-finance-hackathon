/**
 * Transactions CRUD API Endpoints
 * Handles transaction creation, listing, and management
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { currencyService } from '@/lib/currency-service'
import { CrossBorderTaxComplianceTool } from '@/lib/tools/cross-border-tax-compliance-tool'
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
      home_currency,
      vendor_name,
      reference_number,
      document_type, // From OCR extraction
      line_items = [],
      source_document_id  // Optional field to link transaction to document
    } = body

    // Validate required fields
    if (!transaction_type || !category || !description || !transaction_date || 
        !original_currency || !original_amount || !home_currency) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate transaction type
    if (!['income', 'expense', 'transfer', 'asset', 'liability', 'equity'].includes(transaction_type)) {
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

    // Flexible category validation - handles both top-level categories and subcategories
    const typeCategories = TRANSACTION_CATEGORIES[transaction_type]
    const validTopLevelCategories = Object.keys(typeCategories)
    
    let finalCategory = category
    let finalSubcategory = subcategory
    
    // Check if it's a top-level category
    if (validTopLevelCategories.includes(category)) {
      // Valid top-level category, use as-is
      finalCategory = category
      finalSubcategory = subcategory
    } else {
      // Check if it's a subcategory and map to parent category
      let foundParentCategory = null
      for (const [parentCategory, subCategories] of Object.entries(typeCategories)) {
        if (subCategories.includes(category)) {
          foundParentCategory = parentCategory
          break
        }
      }
      
      if (foundParentCategory) {
        // Map subcategory to parent category
        finalCategory = foundParentCategory
        finalSubcategory = category
        console.log(`[Transactions API] Mapped subcategory '${category}' to parent category '${foundParentCategory}'`)
      } else {
        // Invalid category/subcategory
        return NextResponse.json(
          { success: false, error: `Invalid category '${category}' for transaction type '${transaction_type}'` },
          { status: 400 }
        )
      }
    }

    console.log(`[Transactions API] Creating ${transaction_type} transaction for user ${userId}`)

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Use the submitted home currency from the form
    const homeCurrency: SupportedCurrency = home_currency

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
        document_id: source_document_id || null, // Link to source document if provided
        transaction_type,
        category: finalCategory,
        subcategory: finalSubcategory,
        description,
        reference_number,
        document_type, // From OCR extraction - bridges context gap!
        original_currency,
        original_amount,
        home_currency: homeCurrency,
        home_amount: homeAmount,
        exchange_rate: exchangeRate,
        exchange_rate_date: exchangeRateDate,
        transaction_date,
        vendor_name,
        created_by_method: source_document_id ? 'document_extract' : 'manual',
        processing_metadata: {
          created_via: 'api',
          conversion_attempted: original_currency !== homeCurrency,
          source_document_id: source_document_id || null
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
            item_description: lineItem.description,
            item_code: lineItem.item_code || null,
            quantity: lineItem.quantity,
            unit_measurement: lineItem.unit_measurement || null,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: original_currency,
            tax_rate: lineItem.tax_rate,
            tax_amount: lineItem.tax_rate ? lineTotal * lineItem.tax_rate : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })
          .select()
          .single()

        if (lineItemError) {
          console.error('[Transactions API] Failed to create line item:', lineItemError)
          console.error('[Transactions API] Line item data that failed:', {
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
          // Continue creating other line items
        } else {
          console.log('[Transactions API] Successfully created line item:', createdLineItem)
          createdLineItems.push(createdLineItem)
        }
      }
    }

    console.log(`[Transactions API] Created transaction ${transaction.id} with ${createdLineItems.length} line items`)

    // TASK 2: Cross-border compliance analysis
    // Check if this is a cross-border transaction (currency different from home currency)
    const isCrossBorderTransaction = original_currency !== homeCurrency
    
    if (isCrossBorderTransaction) {
      console.log(`[Transactions API] Cross-border transaction detected: ${original_currency} → ${homeCurrency}`)
      
      // Asynchronously trigger compliance analysis (don't block response)
      setImmediate(async () => {
        try {
          const complianceTool = new CrossBorderTaxComplianceTool()
          
          const analysisResult = await complianceTool.execute({
            transaction_id: transaction.id,
            amount: original_amount,
            original_currency: original_currency,
            home_currency: homeCurrency,
            transaction_type: transaction_type,
            category: finalCategory,
            description: description,
            vendor_name: vendor_name
          }, {
            userId: userId
          })

          if (analysisResult.success) {
            console.log(`[Transactions API] Compliance analysis completed for transaction ${transaction.id}`)
          } else {
            console.error(`[Transactions API] Compliance analysis failed for transaction ${transaction.id}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Transactions API] Compliance analysis error for transaction ${transaction.id}:`, error)
        }
      })
    } else {
      console.log(`[Transactions API] Domestic transaction (${original_currency}), skipping compliance analysis`)
    }

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
        error: 'Failed to create transaction'
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

    const supabase = await createAuthenticatedSupabaseClient(userId)
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
      // Sanitize search input to prevent SQL injection
      const sanitizedSearch = params.search.replace(/[%_]/g, '\\$&').replace(/[^\w\s-]/g, '')
      if (sanitizedSearch.trim()) {
        query = query.or(`description.ilike.%${sanitizedSearch}%,vendor_name.ilike.%${sanitizedSearch}%,reference_number.ilike.%${sanitizedSearch}%`)
      }
    }

    // Apply sorting with whitelist validation to prevent SQL injection
    const validSortColumns = ['transaction_date', 'original_amount', 'description', 'vendor_name', 'category', 'created_at']
    let sortColumn = 'transaction_date' // Safe default
    
    if (params.sort_by === 'amount') {
      sortColumn = 'original_amount'
    } else if (params.sort_by === 'date') {
      sortColumn = 'transaction_date'
    } else if (params.sort_by && validSortColumns.includes(params.sort_by)) {
      sortColumn = params.sort_by
    }
    
    const sortOrder = params.sort_order === 'asc' ? 'asc' : 'desc' // Safe default
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

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
        error: 'Failed to fetch transactions'
      },
      { status: 500 }
    )
  }
}