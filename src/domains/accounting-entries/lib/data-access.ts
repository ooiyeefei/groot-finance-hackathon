/**
 * Accounting Entries Data Access Layer
 * Centralized business logic for accounting entries CRUD operations
 * Consolidates logic from both /api/accounting-entries and /api/transactions
 */

import { createServiceSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { currencyService } from '@/lib/services/currency-service'
import { CrossBorderTaxComplianceTool } from '@/lib/ai/tools'
import {
  CreateAccountingEntryRequest as CreateTransactionRequest,
  UpdateAccountingEntryRequest as UpdateTransactionRequest,
  SupportedCurrency,
  AccountingEntryListParams as TransactionListParams,
  TRANSACTION_CATEGORIES
} from '@/domains/accounting-entries/types'

export interface AccountingEntry {
  id: string
  user_id: string
  business_id?: string
  source_record_id?: string
  transaction_type: string
  category: string
  category_name?: string // Resolved human-readable category name from business categories
  subcategory?: string
  description: string
  reference_number?: string
  original_currency: string
  original_amount: number
  home_currency: string
  home_currency_amount: number
  exchange_rate: number
  exchange_rate_date: string
  transaction_date: string
  vendor_name?: string
  created_by_method?: string
  processing_metadata?: any
  status?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  line_items?: LineItem[]
}

export interface LineItem {
  id: string
  accounting_entry_id: string
  item_description: string
  item_code?: string
  quantity: number
  unit_measurement?: string
  unit_price: number
  total_amount: number
  currency: string
  tax_rate: number
  tax_amount: number
  item_category?: string
  line_order: number
}

export interface CreateAccountingEntryRequest extends CreateTransactionRequest {
  // All properties inherited from CreateTransactionRequest
}

export interface UpdateAccountingEntryRequest extends UpdateTransactionRequest {
  // All properties inherited from UpdateTransactionRequest
}

export interface AccountingEntryListParams extends TransactionListParams {
  // All properties inherited from TransactionListParams
}

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

/**
 * Create a new accounting entry
 */
export async function createAccountingEntry(
  userId: string,
  data: CreateAccountingEntryRequest
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
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
      line_items = [],
      source_record_id,
      source_document_type
    } = data

    // Validate required fields
    if (!transaction_type || !category || !description || !transaction_date ||
        !original_currency || !original_amount || !home_currency) {
      return { success: false, error: 'Missing required fields' }
    }

    // P&L VALIDATION: Only allow Income, Cost of Goods Sold, Expense
    if (!['Income', 'Cost of Goods Sold', 'Expense'].includes(transaction_type)) {
      return {
        success: false,
        error: 'Invalid accounting entry type. Only Income, Cost of Goods Sold, and Expense are allowed.'
      }
    }

    // Validate currency
    if (!currencyService.isSupportedCurrency(original_currency)) {
      return { success: false, error: `Unsupported currency: ${original_currency}` }
    }

    // Validate amount
    if (typeof original_amount !== 'number' || original_amount <= 0) {
      return { success: false, error: 'Amount must be a positive number' }
    }

    console.log(`[Accounting Entries Data Access] Creating ${transaction_type} entry for user ${userId}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // DUPLICATE PREVENTION: Check if accounting entry already exists for this source document
    if (source_record_id && source_document_type) {
      const { data: existingEntry, error: existingError } = await supabase
        .from('accounting_entries')
        .select('id, description, original_amount, original_currency')
        .eq('source_record_id', source_record_id)
        .eq('source_document_type', source_document_type)
        .eq('business_id', userData.business_id)
        .is('deleted_at', null)
        .single()

      if (existingEntry) {
        console.log(`[Accounting Entries Data Access] Duplicate prevention: Entry already exists for ${source_document_type} ${source_record_id}:`, existingEntry)
        return {
          success: false,
          error: `An accounting entry already exists for this ${source_document_type}. Description: "${existingEntry.description}" (${existingEntry.original_amount} ${existingEntry.original_currency})`
        }
      } else if (existingError && existingError.code !== 'PGRST116') {
        // PGRST116 is "no rows found" which is expected, any other error is concerning
        console.error(`[Accounting Entries Data Access] Error checking for duplicates:`, existingError)
        return {
          success: false,
          error: 'Failed to verify duplicate entries'
        }
      }

      console.log(`[Accounting Entries Data Access] No duplicate found for ${source_document_type} ${source_record_id}, proceeding with creation`)
    }

    // Ensure user has a business_id for category validation
    if (!userData.business_id) {
      return {
        success: false,
        error: 'User must be associated with a business to create accounting entries'
      }
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
        console.log(`[Accounting Entries Data Access] Mapped subcategory '${category}' to parent category '${foundParentCategory}'`)
      } else {
        // Invalid category
        console.error(`[Accounting Entries Data Access] Invalid category '${category}' for type '${transaction_type}'. Valid categories:`, validCategories)
        return {
          success: false,
          error: `Invalid category '${category}' for accounting entry type '${transaction_type}'. Valid categories: ${validCategoryNames.join(', ')}`
        }
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
        console.error('[Accounting Entries Data Access] Currency conversion failed:', error)
        // Continue with original amount as fallback
      }
    }

    const { data: accountingEntry, error: entryError } = await supabase
      .from('accounting_entries')
      .insert({
        user_id: userData.id,
        business_id: userData.business_id,
        source_record_id: source_record_id || null,
        source_document_type: source_document_type || null,
        transaction_type,
        category: finalCategory,
        subcategory: finalSubcategory,
        description,
        reference_number,
        original_currency,
        original_amount,
        home_currency: homeCurrency,
        home_currency_amount: homeAmount,
        exchange_rate: exchangeRate,
        exchange_rate_date: exchangeRateDate,
        transaction_date,
        vendor_name,
        created_by_method: source_record_id ? 'document_extract' : 'manual',
        processing_metadata: {
          created_via: 'api',
          conversion_attempted: original_currency !== homeCurrency,
          source_record_id: source_record_id || null
        }
      })
      .select()
      .single()

    if (entryError) {
      console.error('[Accounting Entries Data Access] Failed to create accounting entry:', entryError)
      return { success: false, error: 'Failed to create accounting entry' }
    }

    // Create line items if provided
    console.log(`[Accounting Entries Data Access] Processing ${line_items.length} line items for entry ${accountingEntry.id}`)

    const createdLineItems = []
    if (line_items.length > 0) {
      for (let i = 0; i < line_items.length; i++) {
        const lineItem = line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price

        // Validate line item data before insertion
        if (!lineItem.item_description || !lineItem.quantity || !lineItem.unit_price) {
          console.error('[Accounting Entries Data Access] Invalid line item data:', {
            index: i,
            item_description: lineItem.item_description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            issue: !lineItem.item_description ? 'missing item_description' :
                   !lineItem.quantity ? 'missing quantity' : 'missing unit_price'
          })
          continue // Skip invalid line items
        }

        console.log(`[Accounting Entries Data Access] Creating line item ${i + 1}:`, {
          item_description: lineItem.item_description,
          item_code: lineItem.item_code,
          quantity: lineItem.quantity,
          unit_price: lineItem.unit_price,
          total_amount: lineTotal
        })

        const { data: createdLineItem, error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            accounting_entry_id: accountingEntry.id,
            item_description: lineItem.item_description,
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
          console.error('[Accounting Entries Data Access] Failed to create line item:', lineItemError)
          // Continue creating other line items rather than failing the entire transaction
        } else {
          console.log('[Accounting Entries Data Access] ✅ Successfully created line item:', {
            id: createdLineItem.id,
            description: createdLineItem.item_description,
            total_amount: createdLineItem.total_amount
          })
          createdLineItems.push(createdLineItem)
        }
      }
    }

    console.log(`[Accounting Entries Data Access] Created accounting entry ${accountingEntry.id} with ${createdLineItems.length} line items`)

    // Cross-border compliance analysis
    const isCrossBorderTransaction = original_currency !== homeCurrency

    if (isCrossBorderTransaction) {
      console.log(`[Accounting Entries Data Access] Cross-border transaction detected: ${original_currency} → ${homeCurrency}`)

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
            console.log(`[Accounting Entries Data Access] Compliance analysis completed for entry ${accountingEntry.id}`)
          } else {
            console.error(`[Accounting Entries Data Access] Compliance analysis failed for entry ${accountingEntry.id}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Accounting Entries Data Access] Compliance analysis error for entry ${accountingEntry.id}:`, error)
        }
      })
    } else {
      console.log(`[Accounting Entries Data Access] Domestic transaction (${original_currency}), skipping compliance analysis`)
    }

    return {
      success: true,
      data: {
        transaction: {
          ...accountingEntry,
          line_items: createdLineItems
        }
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to create accounting entry' }
  }
}

/**
 * Get accounting entries with filtering and pagination
 */
export async function getAccountingEntries(
  userId: string,
  params: AccountingEntryListParams
): Promise<{
  success: boolean
  data?: {
    transactions: AccountingEntry[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
      total_pages: number
    }
  }
  error?: string
}> {
  try {
    console.log(`[Accounting Entries Data Access] Listing entries for user ${userId}:`, params)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    let query = supabase
      .from('accounting_entries')
      .select(`
        *,
        line_items!left (*)
      `)
      .eq('business_id', userData.business_id)
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

    const { data: accountingEntries, error } = await query

    if (error) {
      console.error('[Accounting Entries Data Access] Failed to fetch entries:', error)
      return { success: false, error: 'Failed to fetch accounting entries' }
    }

    // Get total count with proper business filtering (excluding soft-deleted entries)
    const { count: totalCount } = await supabase
      .from('accounting_entries')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)

    const hasMore = offset + params.limit! < (totalCount || 0)

    return {
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
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to fetch accounting entries' }
  }
}

/**
 * Get a single accounting entry by ID
 */
export async function getAccountingEntryById(
  userId: string,
  entryId: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Getting entry ${entryId} for user ${userId}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    const { data: accountingEntry, error } = await supabase
      .from('accounting_entries')
      .select(`
        *,
        line_items!left (*)
      `)
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)
      .single()

    if (error || !accountingEntry) {
      console.error('[Accounting Entries Data Access] Entry not found or access denied:', error)
      return { success: false, error: 'Accounting entry not found or access denied' }
    }

    // Fetch related expense claim separately (since FK is on expense_claims table)
    const { data: expenseClaims, error: expenseClaimError } = await supabase
      .from('expense_claims')
      .select(`
        id,
        status,
        business_purpose,
        created_at
      `)
      .eq('accounting_entry_id', entryId)
      .eq('business_id', userData.business_id)

    // Attach expense claims to the accounting entry (should be at most one)
    if (!expenseClaimError && expenseClaims && expenseClaims.length > 0) {
      accountingEntry.expense_claims = expenseClaims
    } else {
      accountingEntry.expense_claims = []
    }

    // Resolve category name using dynamic business categories
    if (userData.business_id && accountingEntry.transaction_type && accountingEntry.category) {
      try {
        const categoryData = await fetchDynamicCategories(supabase, userData.business_id, accountingEntry.transaction_type)
        const categoryIndex = categoryData.codes.indexOf(accountingEntry.category)
        if (categoryIndex !== -1 && categoryData.names[categoryIndex]) {
          accountingEntry.category_name = categoryData.names[categoryIndex]
        }
      } catch (error) {
        console.error('[Accounting Entries Data Access] Failed to resolve category name:', error)
        // Continue without category name resolution
      }
    }

    return {
      success: true,
      data: {
        transaction: accountingEntry
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to get accounting entry' }
  }
}

/**
 * Update an accounting entry
 */
export async function updateAccountingEntry(
  userId: string,
  entryId: string,
  updates: UpdateAccountingEntryRequest
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating entry ${entryId} for user ${userId}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // First verify the entry exists and user has access to it
    const { data: existingEntry, error: fetchError } = await supabase
      .from('accounting_entries')
      .select('id, user_id, transaction_type, business_id')
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existingEntry) {
      return { success: false, error: 'Accounting entry not found or access denied' }
    }

    // Prepare update data (filter out undefined/null values)
    const updateData: any = {}

    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.vendor_name !== undefined) updateData.vendor_name = updates.vendor_name
    if (updates.reference_number !== undefined) updateData.reference_number = updates.reference_number
    if (updates.transaction_date !== undefined) updateData.transaction_date = updates.transaction_date
    if (updates.original_amount !== undefined) updateData.original_amount = updates.original_amount
    if (updates.original_currency !== undefined) updateData.original_currency = updates.original_currency
    if (updates.status !== undefined) updateData.status = updates.status

    // Update the entry
    const { data: updatedEntry, error: updateError } = await supabase
      .from('accounting_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .select()
      .single()

    if (updateError) {
      console.error('[Accounting Entries Data Access] Failed to update entry:', updateError)
      return { success: false, error: 'Failed to update accounting entry' }
    }

    // Handle line items updates if provided
    let updatedLineItems: LineItem[] = []

    if (updates.line_items !== undefined) {
      console.log(`[Accounting Entries Data Access] Processing ${updates.line_items.length} line item updates for entry ${entryId}`)

      // First, delete all existing line items for this entry (soft delete approach)
      await supabase
        .from('line_items')
        .delete()
        .eq('accounting_entry_id', entryId)

      // Create new line items from the updated list
      for (let i = 0; i < updates.line_items.length; i++) {
        const lineItem = updates.line_items[i]
        const lineTotal = lineItem.quantity * lineItem.unit_price

        // Validate line item data before insertion
        if (!lineItem.item_description || !lineItem.quantity || !lineItem.unit_price) {
          console.error('[Accounting Entries Data Access] Invalid line item data in update:', {
            index: i,
            item_description: lineItem.item_description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            issue: !lineItem.item_description ? 'missing item_description' :
                   !lineItem.quantity ? 'missing quantity' : 'missing unit_price'
          })
          continue // Skip invalid line items
        }

        console.log(`[Accounting Entries Data Access] Creating updated line item ${i + 1}:`, {
          item_description: lineItem.item_description,
          item_code: lineItem.item_code,
          quantity: lineItem.quantity,
          unit_price: lineItem.unit_price,
          total_amount: lineTotal
        })

        const { data: createdLineItem, error: lineItemError } = await supabase
          .from('line_items')
          .insert({
            accounting_entry_id: entryId,
            item_description: lineItem.item_description,
            item_code: lineItem.item_code || null,
            quantity: lineItem.quantity,
            unit_measurement: lineItem.unit_measurement || null,
            unit_price: lineItem.unit_price,
            total_amount: lineTotal,
            currency: updatedEntry.original_currency,
            tax_rate: lineItem.tax_rate || 0,
            tax_amount: lineItem.tax_rate ? lineTotal * (lineItem.tax_rate / 100) : 0,
            item_category: lineItem.item_category || null,
            line_order: i + 1
          })
          .select()
          .single()

        if (lineItemError) {
          console.error('[Accounting Entries Data Access] Failed to create updated line item:', lineItemError)
          // Continue creating other line items rather than failing the entire update
        } else {
          console.log('[Accounting Entries Data Access] ✅ Successfully created updated line item:', {
            id: createdLineItem.id,
            description: createdLineItem.item_description,
            total_amount: createdLineItem.total_amount
          })
          updatedLineItems.push(createdLineItem)
        }
      }

      console.log(`[Accounting Entries Data Access] Updated entry ${entryId} with ${updatedLineItems.length} line items`)
    } else {
      // If no line items update requested, fetch existing line items
      const { data: existingLineItems } = await supabase
        .from('line_items')
        .select('*')
        .eq('accounting_entry_id', entryId)
        .is('deleted_at', null)
        .order('line_order')

      updatedLineItems = existingLineItems || []
    }

    return {
      success: true,
      data: {
        transaction: {
          ...updatedEntry,
          line_items: updatedLineItems
        }
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update accounting entry' }
  }
}

/**
 * Delete an accounting entry (soft delete)
 */
export async function deleteAccountingEntry(
  userId: string,
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Deleting entry ${entryId} for user ${userId}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // Soft delete by setting deleted_at timestamp
    const { error } = await supabase
      .from('accounting_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)

    if (error) {
      console.error('[Accounting Entries Data Access] Failed to delete entry:', error)
      return { success: false, error: 'Failed to delete accounting entry' }
    }

    return { success: true }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to delete accounting entry' }
  }
}

/**
 * Update accounting entry category
 */
export async function updateAccountingEntryCategory(
  userId: string,
  entryId: string,
  category: string,
  subcategory?: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating category for entry ${entryId}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    const { data: updatedEntry, error } = await supabase
      .from('accounting_entries')
      .update({
        category,
        subcategory: subcategory || null
      })
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)
      .select(`
        *,
        line_items!left (*)
      `)
      .single()

    if (error) {
      console.error('[Accounting Entries Data Access] Failed to update category:', error)
      return { success: false, error: 'Failed to update category' }
    }

    return {
      success: true,
      data: {
        transaction: updatedEntry
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update category' }
  }
}

/**
 * Update accounting entry status
 */
export async function updateAccountingEntryStatus(
  userId: string,
  entryId: string,
  status: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating status for entry ${entryId} to ${status}`)

    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    const { data: updatedEntry, error } = await supabase
      .from('accounting_entries')
      .update({ status })
      .eq('id', entryId)
      .eq('business_id', userData.business_id)
      .is('deleted_at', null)
      .select(`
        *,
        line_items!left (*)
      `)
      .single()

    if (error) {
      console.error('[Accounting Entries Data Access] Failed to update status:', error)
      return { success: false, error: 'Failed to update status' }
    }

    return {
      success: true,
      data: {
        transaction: updatedEntry
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update status' }
  }
}