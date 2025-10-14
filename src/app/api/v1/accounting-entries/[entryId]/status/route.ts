/**
 * PUT /api/v1/accounting-entries/[entryId]/status - Update accounting entry status
 * RESTful API following Next.js 15 App Router conventions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { updateAccountingEntryStatus } from '@/domains/accounting-entries/lib/data-access'

/**
 * Update accounting entry status (PUT method)
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
    const { status } = await request.json()

    console.log(`[Accounting Entries API v1] PUT - Updating status for entry ${entryId} to ${status}`)

    const result = await updateAccountingEntryStatus(userId, entryId, status)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 400 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] PUT - Unexpected error during status update:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update status' },
      { status: 500 }
    )
  }
}

/**
 * Update accounting entry status (PATCH method - same logic as PUT)
 */
export async function PATCH(
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
    const { status } = await request.json()

    console.log(`[Accounting Entries API v1] PATCH - Updating status for entry ${entryId} to ${status}`)

    const result = await updateAccountingEntryStatus(userId, entryId, status)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.includes('not found') ? 404 : 400 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Accounting Entries API v1] PATCH - Unexpected error during status update:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update status' },
      { status: 500 }
    )
  }
}