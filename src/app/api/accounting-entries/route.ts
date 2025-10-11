/**
 * Accounting Entries CRUD API Endpoints
 * Handles P&L accounting entry creation, listing, and management
 * REFACTOR: Renamed from transactions → accounting_entries for proper P&L structure
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'
import { currencyService } from '@/lib/currency-service'
import { CrossBorderTaxComplianceTool } from '@/lib/tools'
import {
  CreateTransactionRequest,
  SupportedCurrency,
  TransactionListParams,
  TRANSACTION_CATEGORIES
} from '@/types/transaction'

// Helper function to fetch dynamic categories from database
async function fetchDynamicCategories(supabase: any, businessId: string, transactionType: 'Income' | 'Cost of Goods Sold' | 'Expense') {
  try {
    let validCategories: string[] = []
    let validCategoryNames: string[] = []

    if (transactionType === 'Cost of Goods Sold') {
      // Fetch COGS categories
      const { data: businessData, error } = await supabase
        .from('businesses')
        .select('custom_cogs_categories')
        .eq('id', businessId)
        .single()

      if (!error && businessData?.custom_cogs_categories) {
        const categories = businessData.custom_cogs_categories
        const activeCategories = categories.filter((cat: any) => cat.is_active !== false)
        validCategories = activeCategories.map((cat: any) => cat.category_code)
        validCategoryNames = activeCategories.map((cat: any) => cat.category_name)
      }
    } else if (transactionType === 'Expense') {
      // Fetch expense categories
      const { data: businessData, error } = await supabase
        .from('businesses')
        .select('custom_expense_categories')
        .eq('id', businessId)
        .single()

      if (!error && businessData?.custom_expense_categories) {
        const categories = businessData.custom_expense_categories
        const activeCategories = categories.filter((cat: any) => cat.is_active !== false)
        validCategories = activeCategories.map((cat: any) => cat.category_code)
        validCategoryNames = activeCategories.map((cat: any) => cat.category_name)
      }
    } else if (transactionType === 'Income') {
      // For income, use hardcoded categories for now (can be made dynamic later)
      validCategories = ['operating_revenue', 'other_income', 'investment_income', 'government_grants']
      validCategoryNames = ['Operating Revenue', 'Other Income', 'Investment Income', 'Government Grants']
    }

    // Fallback to hardcoded categories if no dynamic categories found
    if (validCategories.length === 0) {
      const typeCategories = TRANSACTION_CATEGORIES[transactionType]
      if (typeCategories) {
        validCategories = Object.keys(typeCategories)
        validCategoryNames = Object.keys(typeCategories).map(key =>
          key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        )
      }
    }

    return { codes: validCategories, names: validCategoryNames }
  } catch (error) {
    console.error('Error fetching dynamic categories:', error)
    // Fallback to hardcoded categories
    const typeCategories = TRANSACTION_CATEGORIES[transactionType]
    if (typeCategories) {
      const codes = Object.keys(typeCategories)
      const names = codes.map(key =>
        key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      )
      return { codes, names }
    }
    return { codes: [], names: [] }
  }
}

// Create new accounting entry
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
      source_document_id  // Optional field to link entry to document
    } = body

    // Validate required fields
    if (!transaction_type || !category || !description || !transaction_date ||
        !original_currency || !original_amount || !home_currency) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // P&L VALIDATION: Only allow Income, Cost of Goods Sold, Expense
    if (!['Income', 'Cost of Goods Sold', 'Expense'].includes(transaction_type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid accounting entry type. Only Income, Cost of Goods Sold, and Expense are allowed.' },
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

    console.log(`[Accounting Entries API] Creating ${transaction_type} entry for user ${userId}`)

    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    // Ensure user has a business_id for category validation
    if (!userData.business_id) {
      return NextResponse.json(
        { success: false, error: 'User must be associated with a business to create accounting entries' },
        { status: 400 }
      )
    }

    // Fetch dynamic categories for validation
    const categoryData = await fetchDynamicCategories(supabase, userData.business_id, transaction_type)
    const validCategories = categoryData.codes
    const validCategoryNames = categoryData.names

    // Dynamic category validation
    let finalCategory = category
    let finalSubcategory = subcategory

    if (!validCategories.includes(category)) {
      // Check if it's a subcategory in hardcoded system (fallback for legacy data)
      const typeCategories = TRANSACTION_CATEGORIES[transaction_type]
      let foundParentCategory = null

      if (typeCategories) {
        for (const [parentCategory, subCategories] of Object.entries(typeCategories)) {
          if (subCategories.includes(category)) {
            foundParentCategory = parentCategory
            break
          }
        }
      }

      if (foundParentCategory && validCategories.includes(foundParentCategory)) {
        // Map subcategory to parent category
        finalCategory = foundParentCategory
        finalSubcategory = category
        console.log(`[Accounting Entries API] Mapped subcategory '${category}' to parent category '${foundParentCategory}'`)
      } else {
        // Invalid category
        console.error(`[Accounting Entries API] Invalid category '${category}' for type '${transaction_type}'. Valid categories:`, validCategories)
        return NextResponse.json(
          {
            success: false,
            error: `Invalid category '${category}' for accounting entry type '${transaction_type}'. Valid categories: ${validCategoryNames.join(', ')}`
          },
          { status: 400 }
        )
      }
    }

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
        console.error('[Accounting Entries API] Currency conversion failed:', error)
        // Continue with original amount as fallback
      }
    }

    const { data: accountingEntry, error: entryError } = await supabase
      .from('accounting_entries')
      .insert({
        user_id: userData.id,
        business_id: userData.business_id, // Required for RLS policy compliance
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
        home_currency_amount: homeAmount,
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

    if (entryError) {
      console.error('[Accounting Entries API] Failed to create accounting entry:', entryError)
      return NextResponse.json(
        { success: false, error: 'Failed to create accounting entry' },
        { status: 500 }
      )
    }

    // Create line items if provided
    console.log(`[Accounting Entries API] Processing ${line_items.length} line items for entry ${accountingEntry.id}`)

    const createdLineItems = []
    if (line_items.length > 0) {
      for (let i = 0; i < line_items.length; i++) {
        const lineItem = line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price

        // Validate line item data before insertion
        if (!lineItem.description || !lineItem.quantity || !lineItem.unit_price) {
          console.error('[Accounting Entries API] Invalid line item data:', {
            index: i,
            description: lineItem.description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            issue: !lineItem.description ? 'missing description' :
                   !lineItem.quantity ? 'missing quantity' : 'missing unit_price'
          })
          continue // Skip invalid line items
        }

        console.log(`[Accounting Entries API] Creating line item ${i + 1}:`, {
          description: lineItem.description,
          item_code: lineItem.item_code,
          quantity: lineItem.quantity,
          unit_price: lineItem.unit_price,
          total_amount: lineTotal
        })

        const { data: createdLineItem, error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            accounting_entry_id: accountingEntry.id,
            item_description: lineItem.description,
            item_code: lineItem.item_code || null,
            quantity: lineItem.quantity,
            unit_measurement: lineItem.unit_measurement || null,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: original_currency,
            tax_rate: lineItem.tax_rate || 0,
            tax_amount: lineItem.tax_rate ? lineTotal * (lineItem.tax_rate / 100) : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })
          .select()
          .single()

        if (lineItemError) {
          console.error('[Accounting Entries API] Failed to create line item:', lineItemError)
          console.error('[Accounting Entries API] Line item data that failed:', {
            accounting_entry_id: accountingEntry.id,
            item_description: lineItem.description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: original_currency,
            tax_rate: lineItem.tax_rate || 0,
            tax_amount: lineItem.tax_rate ? lineTotal * (lineItem.tax_rate / 100) : 0,
            item_category: lineItem.item_category,
            line_order: i + 1
          })
          // Continue creating other line items rather than failing the entire transaction
        } else {
          console.log('[Accounting Entries API] ✅ Successfully created line item:', {
            id: createdLineItem.id,
            description: createdLineItem.item_description,
            total_amount: createdLineItem.total_amount
          })
          createdLineItems.push(createdLineItem)
        }
      }
    }

    console.log(`[Accounting Entries API] Created accounting entry ${accountingEntry.id} with ${createdLineItems.length} line items`)

    // TASK 2: Cross-border compliance analysis
    // Check if this is a cross-border transaction (currency different from home currency)
    const isCrossBorderTransaction = original_currency !== homeCurrency

    if (isCrossBorderTransaction) {
      console.log(`[Accounting Entries API] Cross-border transaction detected: ${original_currency} → ${homeCurrency}`)

      // Asynchronously trigger compliance analysis (don't block response)
      setImmediate(async () => {
        try {
          const complianceTool = new CrossBorderTaxComplianceTool()

          const analysisResult = await complianceTool.execute({
            accounting_entry_id: accountingEntry.id,
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
            console.log(`[Accounting Entries API] Compliance analysis completed for entry ${accountingEntry.id}`)
          } else {
            console.error(`[Accounting Entries API] Compliance analysis failed for entry ${accountingEntry.id}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Accounting Entries API] Compliance analysis error for entry ${accountingEntry.id}:`, error)
        }
      })
    } else {
      console.log(`[Accounting Entries API] Domestic transaction (${original_currency}), skipping compliance analysis`)
    }

    return NextResponse.json({
      success: true,
      data: {
        transaction: {
          ...accountingEntry,
          line_items: createdLineItems
        }
      }
    })

  } catch (error) {
    console.error('[Accounting Entries API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create accounting entry'
      },
      { status: 500 }
    )
  }
}

// List accounting entries with filtering and pagination
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

    console.log(`[Accounting Entries API] Listing entries for user ${userId}:`, params)

    const userData = await getUserData(userId)
    const supabase = await createBusinessContextSupabaseClient()

    let query = supabase
      .from('accounting_entries')
      .select(`
        *,
        line_items!left (*)
      `)
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)
      .or('deleted_at.is.null', { foreignTable: 'line_items' })

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

    const { data: accountingEntries, error, count } = await query

    if (error) {
      console.error('[Accounting Entries API] Failed to fetch entries:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch accounting entries' },
        { status: 500 }
      )
    }

    // SECURITY: Get total count with proper UUID filtering (excluding soft-deleted entries)
    const { count: totalCount } = await supabase
      .from('accounting_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userData.id) // SECURITY FIX: Use Supabase UUID instead of Clerk ID
      .is('deleted_at', null)

    const hasMore = offset + params.limit! < (totalCount || 0)

    return NextResponse.json({
      success: true,
      data: {
        transactions: accountingEntries || [], // Keep "transactions" key for backwards compatibility
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
    console.error('[Accounting Entries API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch accounting entries'
      },
      { status: 500 }
    )
  }
}