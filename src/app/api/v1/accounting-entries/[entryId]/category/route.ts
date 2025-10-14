/**
 * PUT /api/v1/accounting-entries/[entryId]/category - Update accounting entry category
 * RESTful API following Next.js 15 App Router conventions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { updateAccountingEntryCategory } from '@/domains/accounting-entries/lib/data-access'

/**
 * Update accounting entry category
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { entryId } = await params
    const { category, subcategory } = await request.json()

    console.log(`[Accounting Entries API v1] Updating category for entry ${entryId} to ${category}`)

    const result = await updateAccountingEntryCategory(userId, entryId, category, subcategory)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 400 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during category update:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update category' },
      { status: 500 }
    )
  }
}