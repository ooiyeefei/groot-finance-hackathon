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
import { withCacheHeaders } from '@/lib/cache/cache-headers'
import { convexClient } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

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

    // ✅ Inject user's current business context from Convex if not provided in body
    const requestData = validated.data as any
    if (!requestData.business_id) {
      try {
        const convexUser = await convexClient.query(api.functions.users.getByClerkId, { clerkUserId: userId })
        if (convexUser?.businessId) {
          requestData.business_id = convexUser.businessId
          console.log(`[Accounting Entries API v1] 🏢 Injected business_id for creation from Convex: ${requestData.business_id}`)
        }
      } catch (err) {
        console.error(`[Accounting Entries API v1] ❌ Failed to get user from Convex for POST:`, err)
      }
    }

    const result = await createAccountingEntry(userId, requestData)

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

    // ✅ Multi-business support: Skip businessId injection if all_businesses=true
    // This allows users with multiple business memberships to see all their entries
    const allBusinesses = (params as any).all_businesses === true

    if (allBusinesses) {
      console.log(`[Accounting Entries API v1] 🌐 all_businesses=true: Skipping businessId injection, will show entries from ALL user's businesses`)
      // Ensure business_id is NOT set so Convex returns entries by userId only
      delete params.business_id
    } else if (!params.business_id) {
      // ✅ Inject user's current business context from Convex if not provided in query
      try {
        const convexUser = await convexClient.query(api.functions.users.getByClerkId, { clerkUserId: userId })
        if (convexUser?.businessId) {
          params.business_id = convexUser.businessId
          console.log(`[Accounting Entries API v1] 🏢 Injected business_id from Convex: ${params.business_id}`)
        } else {
          console.log(`[Accounting Entries API v1] ⚠️ No business context found for user in Convex (will show all user entries)`)
        }
      } catch (err) {
        console.error(`[Accounting Entries API v1] ❌ Failed to get user from Convex:`, err)
      }
    }

    // Check for cache bypass query param (for debugging)
    const skipCache = request.nextUrl.searchParams.get('skip_cache') === 'true'

    // Cache accounting entries with enhanced Redis cache + stale-while-revalidate
    console.log(`[Accounting Entries API v1] 🔄 Calling getAccountingEntries with enhanced cache... (skipCache=${skipCache})`)
    const result = await withEnhancedCache(
      userId,
      'accounting-entries',
      () => getAccountingEntries(userId, params),
      {
        params,
        ttlMs: ENHANCED_CACHE_TTL.ACCOUNTING_ENTRIES,
        skipCache: skipCache, // Allow cache bypass for debugging
        staleWhileRevalidate: !skipCache // Disable stale-while-revalidate when bypassing
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
    return withCacheHeaders(NextResponse.json(result), 'volatile')

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during listing:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch accounting entries' },
      { status: 500 }
    )
  }
}