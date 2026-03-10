/**
 * Accounting Entries Data Access Layer
 * Centralized business logic for accounting entries CRUD operations
 * Consolidates logic from both /api/accounting-entries and /api/transactions
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { currencyService } from '@/lib/services/currency-service'
import { roundCurrency } from '@/lib/utils/format-number'
import { CrossBorderTaxComplianceTool } from '@/lib/ai/tools'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import {
  CreateAccountingEntryRequest as CreateTransactionRequest,
  UpdateAccountingEntryRequest as UpdateTransactionRequest,
  SupportedCurrency,
  AccountingEntryListParams as TransactionListParams,
  TRANSACTION_CATEGORIES
} from '@/domains/accounting-entries/types'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

export interface AccountingEntry {
  id: string
  user_id: string
  business_id?: string
  source_record_id?: string
  source_document_type?: string
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
  due_date?: string
  payment_date?: string
  payment_method?: string
  notes?: string
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

// Helper function to get valid categories (uses hardcoded categories, dynamic fetching done in Convex)
function getValidCategories(transactionType: 'Income' | 'Cost of Goods Sold' | 'Expense') {
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

/**
 * Create a new accounting entry
 * Migrated to Convex
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
      source_document_type,
      business_id
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

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Category validation using hardcoded categories
    const categoryData = getValidCategories(transaction_type as 'Income' | 'Cost of Goods Sold' | 'Expense')
    let validCategories = [...categoryData.codes]
    let validCategoryNames = [...categoryData.names]
    // Map from category_name -> id for reverse lookup (LLM returns name, we store id)
    const nameToIdMap = new Map<string, string>()

    // For 'Cost of Goods Sold', also include custom business COGS categories
    if (transaction_type === 'Cost of Goods Sold') {
      try {
        // Get user's business_id for COGS category lookup
        const employeeProfile = await ensureUserProfile(userId)
        if (employeeProfile) {
          // Fetch custom COGS categories from user's business
          const customCogsCategories = await client.query(api.functions.businesses.getEnabledCogsCategories, {
            businessId: employeeProfile.business_id
          })

          if (customCogsCategories && customCogsCategories.length > 0) {
            for (const cat of customCogsCategories) {
              const categoryId = cat.id  // Convex document ID
              const name = cat.category_name
              if (categoryId) {
                validCategories.push(categoryId)
              }
              validCategoryNames.push(name)
              // Build name→id mapping for reverse lookup when LLM suggests name
              if (name && categoryId) {
                nameToIdMap.set(name.toLowerCase(), categoryId)
              }
            }
          }
        }
      } catch (error) {
        console.warn('[Accounting Entries Data Access] Failed to fetch custom COGS categories, using defaults:', error)
      }
    }

    let finalCategory = category
    let finalSubcategory = subcategory

    // Case-insensitive category lookup helper
    const findCategoryMatch = (searchCategory: string, categoryList: string[]): string | null => {
      // First try exact match
      if (categoryList.includes(searchCategory)) {
        return searchCategory
      }
      // Then try case-insensitive match
      const lowerSearch = searchCategory.toLowerCase()
      const match = categoryList.find(c => c.toLowerCase() === lowerSearch)
      return match || null
    }

    // First try to match against category codes
    let matchedCategory = findCategoryMatch(category, validCategories)

    // If no match by id, try to match by name and map to id
    if (!matchedCategory) {
      const matchedName = findCategoryMatch(category, validCategoryNames)
      if (matchedName) {
        // Found by name, map to the corresponding id
        const mappedId = nameToIdMap.get(matchedName.toLowerCase())
        if (mappedId) {
          matchedCategory = mappedId
          console.log(`[Accounting Entries Data Access] Mapped category name '${category}' to id '${mappedId}'`)
        }
      }
    }

    if (!matchedCategory) {
      // Check if it's a subcategory in hardcoded system (fallback for legacy data)
      const typeCategories = TRANSACTION_CATEGORIES[transaction_type]
      let foundParentCategory = null

      if (typeCategories) {
        for (const [parentCategory, subCategories] of Object.entries(typeCategories)) {
          // Also do case-insensitive subcategory matching
          const subMatch = subCategories.find((s: string) => s.toLowerCase() === category.toLowerCase())
          if (subMatch) {
            foundParentCategory = parentCategory
            break
          }
        }
      }

      const matchedParent = foundParentCategory ? findCategoryMatch(foundParentCategory, validCategories) : null
      if (matchedParent) {
        // Map subcategory to parent category
        finalCategory = matchedParent
        finalSubcategory = category
        console.log(`[Accounting Entries Data Access] Mapped subcategory '${category}' to parent category '${matchedParent}'`)
      } else {
        // Fallback to default category instead of failing
        // This handles cases where LLM suggests a category that doesn't exist
        const defaultCategories: Record<string, string> = {
          'Income': 'sales_revenue',
          'Cost of Goods Sold': 'cost_of_goods_sold',
          'Expense': 'other'
        }
        const fallbackCategory = defaultCategories[transaction_type] || validCategories[0]

        if (fallbackCategory && validCategories.includes(fallbackCategory)) {
          finalCategory = fallbackCategory
          console.warn(`[Accounting Entries Data Access] Invalid category '${category}' - using fallback '${fallbackCategory}'`)
        } else if (validCategories.length > 0) {
          // Use first available category as last resort
          finalCategory = validCategories[0]
          console.warn(`[Accounting Entries Data Access] Invalid category '${category}' - using first available '${validCategories[0]}'`)
        } else {
          // No valid categories available at all
          console.error(`[Accounting Entries Data Access] No valid categories available for type '${transaction_type}'`)
          return {
            success: false,
            error: `No valid categories available for accounting entry type '${transaction_type}'`
          }
        }
      }
    } else {
      // Use the correctly-cased category from database
      finalCategory = matchedCategory
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

    // Prepare line items for Convex (camelCase)
    const convexLineItems = line_items.map((item, index) => ({
      itemDescription: item.item_description,
      itemCode: item.item_code,
      quantity: item.quantity,
      unitMeasurement: item.unit_measurement,
      unitPrice: item.unit_price,
      totalAmount: roundCurrency(item.quantity * item.unit_price),
      currency: original_currency,
      taxRate: item.tax_rate || 0,
      taxAmount: item.tax_rate ? roundCurrency(roundCurrency(item.quantity * item.unit_price) * (item.tax_rate / 100)) : 0,
      lineOrder: index + 1
    }))

    // Call Convex create mutation
    const entryId = await client.mutation(api.functions.accountingEntries.create, {
      businessId: business_id as Id<"businesses"> | undefined,  // ✅ Pass business context for multi-tenancy
      transactionType: transaction_type,
      category: finalCategory,
      subcategory: finalSubcategory,
      description,
      referenceNumber: reference_number,
      originalCurrency: original_currency,
      originalAmount: original_amount,
      homeCurrency,
      homeCurrencyAmount: homeAmount,
      exchangeRate,
      exchangeRateDate,
      transactionDate: transaction_date,
      vendorName: vendor_name,
      sourceRecordId: source_record_id,
      sourceDocumentType: source_document_type,
      createdByMethod: source_record_id ? 'document_extract' : 'manual',
      processingMetadata: {
        created_via: 'api',
        conversion_attempted: original_currency !== homeCurrency,
        source_record_id: source_record_id || null
      },
      lineItems: convexLineItems.length > 0 ? convexLineItems : undefined
    })

    // Fetch the created entry to return
    const entry = await client.query(api.functions.accountingEntries.getById, {
      id: entryId as string
    })

    if (!entry) {
      return { success: false, error: 'Failed to retrieve created entry' }
    }

    console.log(`[Accounting Entries Data Access] ✅ Created entry ${entryId} via Convex`)

    // Cross-border compliance analysis
    const isCrossBorderTransaction = original_currency !== homeCurrency

    if (isCrossBorderTransaction) {
      console.log(`[Accounting Entries Data Access] Cross-border transaction detected: ${original_currency} → ${homeCurrency}`)

      // Asynchronously trigger compliance analysis (don't block response)
      setImmediate(async () => {
        try {
          const complianceTool = new CrossBorderTaxComplianceTool()

          const analysisResult = await complianceTool.execute({
            transaction_id: entryId as string,
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
            console.log(`[Accounting Entries Data Access] Compliance analysis completed for entry ${entryId}`)
          } else {
            console.error(`[Accounting Entries Data Access] Compliance analysis failed for entry ${entryId}:`, analysisResult.error)
          }
        } catch (error) {
          console.error(`[Accounting Entries Data Access] Compliance analysis error for entry ${entryId}:`, error)
        }
      })
    } else {
      console.log(`[Accounting Entries Data Access] Domestic transaction (${original_currency}), skipping compliance analysis`)
    }

    // Map Convex entry to API response format
    const transaction: AccountingEntry = {
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }

    return {
      success: true,
      data: {
        transaction
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to create accounting entry' }
  }
}

/**
 * Get accounting entries with filtering and pagination
 * Migrated to Convex
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
    console.log(`[Accounting Entries Data Access] 🚀 Starting getAccountingEntries for user ${userId}`)
    console.log(`[Accounting Entries Data Access] 📋 Query params:`, JSON.stringify(params, null, 2))

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call Convex list query
    const result = await client.query(api.functions.accountingEntries.list, {
      businessId: params.business_id as Id<"businesses"> | undefined,
      transactionType: params.transaction_type,
      category: params.category,
      startDate: params.date_from,
      endDate: params.date_to,
      limit: params.limit || 50,
      cursor: params.cursor
    })

    // DEBUG: Log raw entries to verify soft-delete filtering
    console.log(`[Accounting Entries Data Access] 🔍 DEBUG: Raw Convex result:`, {
      totalEntries: result.entries.length,
      entriesWithDeletedAt: result.entries.filter((e: any) => e.deletedAt).length,
      sampleEntries: result.entries.slice(0, 3).map((e: any) => ({
        id: e._id,
        deletedAt: e.deletedAt,
        description: e.description?.substring(0, 30)
      }))
    })

    // Map Convex entries to API response format
    const transactions: AccountingEntry[] = result.entries.map((entry: any) => ({
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }))

    const page = params.page || 1
    const limit = params.limit || 50
    const total = result.totalCount || transactions.length
    const totalPages = Math.ceil(total / limit)
    const hasMore = !!result.nextCursor

    console.log(`[Accounting Entries Data Access] ✅ Retrieved ${transactions.length} entries via Convex`)

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          has_more: hasMore,
          total_pages: totalPages
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
 * Migrated to Convex
 */
export async function getAccountingEntryById(
  userId: string,
  entryId: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Getting entry ${entryId} for user ${userId}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call Convex getById query
    const entry = await client.query(api.functions.accountingEntries.getById, {
      id: entryId
    })

    if (!entry) {
      console.error('[Accounting Entries Data Access] Entry not found or access denied')
      return { success: false, error: 'Accounting entry not found or access denied' }
    }

    // Map Convex entry to API response format
    const transaction: AccountingEntry = {
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }

    console.log(`[Accounting Entries Data Access] ✅ Retrieved entry ${entryId} via Convex`)

    return {
      success: true,
      data: {
        transaction
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to get accounting entry' }
  }
}

/**
 * Update an accounting entry
 * Migrated to Convex
 */
export async function updateAccountingEntry(
  userId: string,
  entryId: string,
  updates: UpdateAccountingEntryRequest
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating entry ${entryId} for user ${userId}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Prepare update data for Convex (camelCase)
    const updateData: Record<string, any> = {}
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.vendor_name !== undefined) updateData.vendorName = updates.vendor_name
    if (updates.reference_number !== undefined) updateData.referenceNumber = updates.reference_number
    if (updates.transaction_date !== undefined) updateData.transactionDate = updates.transaction_date
    if (updates.original_amount !== undefined) updateData.originalAmount = updates.original_amount
    if (updates.original_currency !== undefined) updateData.originalCurrency = updates.original_currency
    if (updates.status !== undefined) updateData.status = updates.status

    // Map line items to Convex format if provided
    if (updates.line_items !== undefined) {
      updateData.lineItems = updates.line_items.map((item, index) => ({
        itemDescription: item.item_description,
        itemCode: item.item_code,
        quantity: item.quantity,
        unitMeasurement: item.unit_measurement,
        unitPrice: item.unit_price,
        totalAmount: roundCurrency(item.quantity * item.unit_price),
        currency: item.currency || updates.original_currency,
        taxRate: item.tax_rate || 0,
        taxAmount: item.tax_rate ? roundCurrency(roundCurrency(item.quantity * item.unit_price) * (item.tax_rate / 100)) : 0,
        lineOrder: index + 1
      }))
    }

    // Call Convex update mutation
    const entryIdAsConvex = await client.mutation(api.functions.accountingEntries.update, {
      id: entryId,
      ...updateData
    })

    // Fetch updated entry to return
    const entry = await client.query(api.functions.accountingEntries.getById, {
      id: entryId
    })

    if (!entry) {
      return { success: false, error: 'Failed to retrieve updated entry' }
    }

    // Map Convex entry to API response format
    const transaction: AccountingEntry = {
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }

    console.log(`[Accounting Entries Data Access] ✅ Updated entry ${entryId} via Convex`)

    return {
      success: true,
      data: {
        transaction
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update accounting entry' }
  }
}

/**
 * Delete an accounting entry (soft delete)
 * Migrated to Convex
 */
export async function deleteAccountingEntry(
  userId: string,
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Deleting entry ${entryId} for user ${userId}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call Convex softDelete mutation
    await client.mutation(api.functions.accountingEntries.softDelete, {
      id: entryId
    })

    console.log(`[Accounting Entries Data Access] ✅ Soft-deleted entry ${entryId} via Convex`)

    return { success: true }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to delete accounting entry' }
  }
}

/**
 * Update accounting entry category
 * Migrated to Convex
 */
export async function updateAccountingEntryCategory(
  userId: string,
  entryId: string,
  category: string,
  subcategory?: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating category for entry ${entryId}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call Convex update mutation with category data
    await client.mutation(api.functions.accountingEntries.update, {
      id: entryId,
      category,
      subcategory: subcategory || undefined
    })

    // Fetch updated entry
    const entry = await client.query(api.functions.accountingEntries.getById, {
      id: entryId
    })

    if (!entry) {
      return { success: false, error: 'Failed to retrieve updated entry' }
    }

    // Map Convex entry to API response format
    const transaction: AccountingEntry = {
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }

    console.log(`[Accounting Entries Data Access] ✅ Updated category for entry ${entryId} via Convex`)

    return {
      success: true,
      data: {
        transaction
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update category' }
  }
}

/**
 * Update accounting entry status
 * Migrated to Convex
 */
export async function updateAccountingEntryStatus(
  userId: string,
  entryId: string,
  status: string
): Promise<{ success: boolean; data?: { transaction: AccountingEntry }; error?: string }> {
  try {
    console.log(`[Accounting Entries Data Access] Updating status for entry ${entryId} to ${status}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Unauthorized' }
    }

    // Call Convex updateStatus mutation
    await client.mutation(api.functions.accountingEntries.updateStatus, {
      id: entryId,
      status: status as 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed'
    })

    // Fetch updated entry
    const entry = await client.query(api.functions.accountingEntries.getById, {
      id: entryId
    })

    if (!entry) {
      return { success: false, error: 'Failed to retrieve updated entry' }
    }

    // Map Convex entry to API response format
    const transaction: AccountingEntry = {
      id: entry._id,
      user_id: entry.userId,
      business_id: entry.businessId,
      source_record_id: entry.sourceRecordId,
      source_document_type: entry.sourceDocumentType,
      transaction_type: entry.transactionType || '',
      category: entry.category || '',
      category_name: (entry as any).categoryName,
      subcategory: (entry as any).subcategory,
      description: entry.description || '',
      reference_number: entry.referenceNumber,
      original_currency: entry.originalCurrency || '',
      original_amount: entry.originalAmount || 0,
      home_currency: entry.homeCurrency || '',
      home_currency_amount: entry.homeCurrencyAmount || 0,
      exchange_rate: entry.exchangeRate || 1,
      exchange_rate_date: entry.exchangeRateDate || '',
      transaction_date: entry.transactionDate || '',
      vendor_name: entry.vendorName,
      created_by_method: entry.createdByMethod,
      processing_metadata: entry.processingMetadata,
      status: entry.status,
      due_date: entry.dueDate,
      payment_date: entry.paymentDate,
      payment_method: entry.paymentMethod,
      notes: entry.notes,
      created_at: entry._creationTime ? new Date(entry._creationTime).toISOString() : new Date().toISOString(),
      updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : undefined,
      line_items: (entry.lineItems || []).map((item: any) => ({
        id: item._id,
        accounting_entry_id: entry._id,
        item_description: item.itemDescription,
        item_code: item.itemCode,
        quantity: item.quantity,
        unit_measurement: item.unitMeasurement,
        unit_price: item.unitPrice,
        total_amount: item.totalAmount,
        currency: item.currency,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_order: item.lineOrder
      }))
    }

    console.log(`[Accounting Entries Data Access] ✅ Updated status for entry ${entryId} via Convex`)

    return {
      success: true,
      data: {
        transaction
      }
    }

  } catch (error) {
    console.error('[Accounting Entries Data Access] Unexpected error:', error)
    return { success: false, error: 'Failed to update status' }
  }
}