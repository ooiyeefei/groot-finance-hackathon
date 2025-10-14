/**
 * GET /api/v1/accounting-entries/[entryId] - Get single accounting entry
 * PUT /api/v1/accounting-entries/[entryId] - Update accounting entry
 * DELETE /api/v1/accounting-entries/[entryId] - Delete accounting entry
 * RESTful API following Next.js 15 App Router conventions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getAccountingEntryById,
  updateAccountingEntry,
  deleteAccountingEntry,
  type UpdateAccountingEntryRequest
} from '@/domains/accounting-entries/lib/data-access'

/**
 * Get single accounting entry by ID
 */
export async function GET(
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

    console.log(`[Accounting Entries API v1] Getting entry ${entryId} for user ${userId}`)

    const result = await getAccountingEntryById(userId, entryId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during get:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get accounting entry' },
      { status: 500 }
    )
  }
}

/**
 * Update accounting entry
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
    const updates: UpdateAccountingEntryRequest = await request.json()

    console.log(`[Accounting Entries API v1] Updating entry ${entryId} for user ${userId}`)

    const result = await updateAccountingEntry(userId, entryId, updates)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 400 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during update:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update accounting entry' },
      { status: 500 }
    )
  }
}

/**
 * Delete accounting entry (soft delete)
 */
export async function DELETE(
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

    console.log(`[Accounting Entries API v1] Deleting entry ${entryId} for user ${userId}`)

    const result = await deleteAccountingEntry(userId, entryId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] Unexpected error during delete:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete accounting entry' },
      { status: 500 }
    )
  }
}