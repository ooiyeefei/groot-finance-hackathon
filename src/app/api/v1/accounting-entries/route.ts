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
import { withCache, apiCache, CACHE_TTL } from '@/lib/cache/api-cache'

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
    apiCache.invalidate(userId, 'accounting-entries')

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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // ✅ Validate query parameters with Zod
    const validated = validateQuery(request, listAccountingEntriesQuerySchema)
    if (!validated.success) {
      return validated.error
    }

    const params: AccountingEntryListParams = validated.data as any

    // Cache accounting entries with 3-minute TTL
    const result = await withCache(
      userId,
      'accounting-entries',
      () => getAccountingEntries(userId, params),
      {
        params,
        ttlMs: CACHE_TTL.ACCOUNTING_ENTRIES,
        skipCache: false
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during listing:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch accounting entries' },
      { status: 500 }
    )
  }
}