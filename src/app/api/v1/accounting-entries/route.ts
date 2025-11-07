/**
 * GET /api/v1/accounting-entries - List accounting entries
 * POST /api/v1/accounting-entries - Create new accounting entry
 * RESTful API following Next.js 15 App Router conventions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  createAccountingEntry,
  getAccountingEntries,
  type CreateAccountingEntryRequest,
  type AccountingEntryListParams
} from '@/domains/accounting-entries/lib/data-access'
import { validateQuery, validateBody, createAccountingEntrySchema, listAccountingEntriesQuerySchema } from '@/lib/validations'
import { withEnhancedCache, enhancedApiCache, ENHANCED_CACHE_TTL } from '@/lib/cache/enhanced-api-cache'

/**
 * Create new accounting entry
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // ✅ Validate request body with Zod
    const validated = await validateBody(request, createAccountingEntrySchema)
    if (!validated.success) {
      return validated.error
    }

    const result = await createAccountingEntry(userId, validated.data as any)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    // Invalidate accounting entries cache after successful creation
    await enhancedApiCache.invalidate(userId, 'accounting-entries')

    return NextResponse.json(result, { status: 201 })

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during creation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create accounting entry' },
      { status: 500 }
    )
  }
}

/**
 * List accounting entries with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      console.log('[Accounting Entries API v1] No userId from auth()')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[Accounting Entries API v1] 🔍 GET request from userId: ${userId}`)
    console.log(`[Accounting Entries API v1] Request URL: ${request.url}`)

    // ✅ Validate query parameters with Zod
    const validated = validateQuery(request, listAccountingEntriesQuerySchema)
    if (!validated.success) {
      console.log('[Accounting Entries API v1] ❌ Query validation failed:', validated.error)
      return validated.error
    }

    const params: AccountingEntryListParams = validated.data as any
    console.log(`[Accounting Entries API v1] 📝 Query params validated:`, JSON.stringify(params, null, 2))

    // Cache accounting entries with enhanced Redis cache + stale-while-revalidate
    console.log(`[Accounting Entries API v1] 🔄 Calling getAccountingEntries with enhanced cache...`)
    const result = await withEnhancedCache(
      userId,
      'accounting-entries',
      () => getAccountingEntries(userId, params),
      {
        params,
        ttlMs: ENHANCED_CACHE_TTL.ACCOUNTING_ENTRIES,
        skipCache: false,
        staleWhileRevalidate: true // Return cached data while refreshing in background
      }
    )

    console.log(`[Accounting Entries API v1] 📊 Query result:`, {
      success: result.success,
      entriesCount: result.success ? result.data?.transactions?.length : 0,
      error: !result.success ? result.error : null,
      hasPagination: result.success ? !!result.data?.pagination : false
    })

    if (!result.success) {
      console.log(`[Accounting Entries API v1] ❌ getAccountingEntries failed:`, result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log(`[Accounting Entries API v1] ✅ Returning ${result.data?.transactions?.length || 0} entries to client`)
    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during listing:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch accounting entries' },
      { status: 500 }
    )
  }
}