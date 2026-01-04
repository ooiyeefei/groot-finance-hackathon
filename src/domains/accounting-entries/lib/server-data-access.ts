/**
 * Server-Side Data Access for Accounting Entries
 *
 * Functions designed for Server Components to enable parallel data fetching
 * Bypasses API routes for direct database access (faster performance)
 *
 * MIGRATED TO CONVEX (2026-01-03)
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import {
  getAccountingEntries,
  type AccountingEntry,
  type AccountingEntryListParams
} from './data-access'

/**
 * Get initial accounting entries for server-side rendering
 * Called from Server Components with user ID from auth()
 */
export async function getInitialAccountingEntries(
  userId: string,
  params: AccountingEntryListParams = { page: 1, limit: 20, sort_by: 'transaction_date', sort_order: 'desc' }
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
    console.log(`[Server Data Access] Fetching initial accounting entries for user: ${userId}`)

    const result = await getAccountingEntries(userId, params)

    console.log(`[Server Data Access] ✅ Fetched ${result.data?.transactions?.length || 0} entries`)
    return result
  } catch (error) {
    console.error('[Server Data Access] Error fetching accounting entries:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch accounting entries'
    }
  }
}

/**
 * Get business context for current user (CONVEX)
 * Used to display business info and validate access
 */
export async function getBusinessContext(userId: string): Promise<{
  success: boolean
  data?: {
    business_id: string
    business_name: string
    home_currency: string
    role: 'owner' | 'admin' | 'manager' | 'employee'
  }
  error?: string
}> {
  try {
    console.log(`[Server Data Access] Fetching business context for user: ${userId}`)

    const { client } = await getAuthenticatedConvex()

    if (!client) {
      return {
        success: false,
        error: 'Not authenticated'
      }
    }

    // Fetch business context and business details in parallel
    const [businessContext, business] = await Promise.all([
      client.query(api.functions.businesses.getBusinessContext, {}),
      client.query(api.functions.businesses.getCurrentBusiness, {})
    ])

    if (!businessContext || !business) {
      return {
        success: false,
        error: 'Business not found or not accessible'
      }
    }

    console.log(`[Server Data Access] ✅ Business context: ${businessContext.businessName} (${businessContext.role})`)

    return {
      success: true,
      data: {
        business_id: String(businessContext.businessId),
        business_name: businessContext.businessName,
        home_currency: business.homeCurrency || 'USD',
        role: businessContext.role as 'owner' | 'admin' | 'manager' | 'employee'
      }
    }
  } catch (error) {
    console.error('[Server Data Access] Error fetching business context:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch business context'
    }
  }
}

/**
 * Get enabled expense categories (CONVEX)
 * Used for dropdowns and filtering
 */
export async function getEnabledCategories(businessId: string): Promise<{
  success: boolean
  data?: Array<{
    id: string
    category_name: string
    category_code: string
    is_custom: boolean
  }>
  error?: string
}> {
  try {
    console.log(`[Server Data Access] Fetching categories for business: ${businessId}`)

    const { client } = await getAuthenticatedConvex()

    if (!client) {
      return {
        success: false,
        error: 'Not authenticated'
      }
    }

    const categories = await client.query(
      api.functions.businesses.getEnabledExpenseCategories,
      { businessId }
    )

    console.log(`[Server Data Access] ✅ Fetched ${categories?.length || 0} categories`)

    // Map Convex response to expected format
    const mappedCategories = (categories || []).map(cat => ({
      id: cat.id,
      category_name: cat.category_name,
      category_code: cat.category_code,
      is_custom: true // Categories from customExpenseCategories are always custom
    }))

    return {
      success: true,
      data: mappedCategories
    }
  } catch (error) {
    console.error('[Server Data Access] Error fetching categories:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch categories'
    }
  }
}

/**
 * Parallel fetch all required data for accounting page
 * Optimized for initial page load
 */
export async function getAccountingPageData(userId: string) {
  console.log(`[Server Data Access] Starting parallel fetch for user: ${userId}`)
  const startTime = performance.now()

  try {
    // Fetch all data in parallel
    const [businessResult, entriesResult] = await Promise.all([
      getBusinessContext(userId),
      getInitialAccountingEntries(userId, {
        page: 1,
        limit: 20,
        sort_by: 'transaction_date',
        sort_order: 'desc'
      })
    ])

    // Fetch categories if business context succeeded
    let categoriesResult: Awaited<ReturnType<typeof getEnabledCategories>> = { success: false, data: [] }
    if (businessResult.success && businessResult.data) {
      categoriesResult = await getEnabledCategories(businessResult.data.business_id)
    }

    const endTime = performance.now()
    console.log(`[Server Data Access] ✅ Parallel fetch completed in ${(endTime - startTime).toFixed(2)}ms`)

    return {
      business: businessResult.data || null,
      entries: entriesResult.data || null,
      categories: categoriesResult.data || [],
      performance: {
        fetchTime: endTime - startTime
      }
    }
  } catch (error) {
    const endTime = performance.now()
    console.error(`[Server Data Access] ❌ Parallel fetch failed after ${(endTime - startTime).toFixed(2)}ms:`, error)

    return {
      business: null,
      entries: null,
      categories: [],
      performance: {
        fetchTime: endTime - startTime
      },
      error: error instanceof Error ? error.message : 'Failed to fetch page data'
    }
  }
}
