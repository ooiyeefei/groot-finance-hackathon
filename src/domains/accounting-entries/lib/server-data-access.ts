/**
 * Server-Side Data Access for Accounting Entries
 *
 * Functions designed for Server Components to enable parallel data fetching
 * Bypasses API routes for direct database access (faster performance)
 */

import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
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
 * Get business context for current user
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

    const supabase = createServiceSupabaseClient()

    // Get user profile with business information
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('business_id, home_currency')
      .eq('id', userId)
      .single()

    if (profileError || !userProfile) {
      return {
        success: false,
        error: 'User profile not found'
      }
    }

    // Get business details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, home_currency')
      .eq('id', userProfile.business_id)
      .single()

    if (businessError || !business) {
      return {
        success: false,
        error: 'Business not found'
      }
    }

    // Get user role in business
    const { data: membership, error: membershipError } = await supabase
      .from('business_user_roles')
      .select('role')
      .eq('business_id', userProfile.business_id)
      .eq('user_id', userId)
      .single()

    const role = membership?.role || 'employee'

    console.log(`[Server Data Access] ✅ Business context: ${business.name} (${role})`)

    return {
      success: true,
      data: {
        business_id: business.id,
        business_name: business.name,
        home_currency: business.home_currency || userProfile.home_currency || 'USD',
        role: role as 'owner' | 'admin' | 'manager' | 'employee'
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
 * Get enabled expense categories
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

    const supabase = createServiceSupabaseClient()

    const { data: categories, error } = await supabase
      .from('expense_categories')
      .select('id, category_name, category_code, is_custom')
      .eq('business_id', businessId)
      .eq('is_enabled', true)
      .order('category_name', { ascending: true })

    if (error) {
      console.error('[Server Data Access] Error fetching categories:', error)
      return {
        success: false,
        error: error.message
      }
    }

    console.log(`[Server Data Access] ✅ Fetched ${categories?.length || 0} categories`)

    return {
      success: true,
      data: categories || []
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
