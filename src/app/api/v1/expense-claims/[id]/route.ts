/**
 * North Star Expense Claims API v1 - Individual Resource Routes
 * GET /api/v1/expense-claims/{id} - Get single expense claim
 * PUT /api/v1/expense-claims/{id} - Update expense claim (unified updates + status changes)
 * DELETE /api/v1/expense-claims/{id} - Delete expense claim (draft, failed, or classification_failed)
 */

import { auth } from '@/lib/demo-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getExpenseClaim, updateExpenseClaim, deleteExpenseClaim } from '@/domains/expense-claims/lib/data-access'
import { UpdateExpenseClaimRequest } from '@/domains/expense-claims/types'
import { apiCache } from '@/lib/cache/api-cache'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/v1/expense-claims/{id}
 * Fetch single expense claim with transaction data and line items
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const result = await getExpenseClaim(userId, id)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error === 'Expense claim not found or access denied' ? 404 : 500 }
      )
    }

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: result.data
    }), 'volatile')

  } catch (error) {
    console.error('[North Star API v1] GET expense-claim error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/v1/expense-claims/{id}
 * Unified update endpoint - handles both field updates and status changes
 * Status changes are RESTful via {"status": "submitted"} instead of action parameters
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const updateRequest: UpdateExpenseClaimRequest = await request.json()

    const result = await updateExpenseClaim(userId, id, updateRequest)

    if (!result.success) {
      if (result.error === 'Expense claim not found or access denied') {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 404 }
        )
      }

      if (result.error?.includes('Invalid transition') ||
          result.error?.includes('Cannot edit') ||
          result.error?.includes('Only draft')) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Determine success message based on what was updated
    let message = 'Expense claim updated successfully'
    if (updateRequest.status) {
      message = `Expense claim status changed to ${updateRequest.status}`
    }

    // Invalidate expense claims cache after successful update
    // This ensures dashboard shows fresh data immediately
    apiCache.invalidate(userId, 'expense-claims')

    return NextResponse.json({
      success: true,
      data: result.data,
      message
    })

  } catch (error) {
    console.error('[North Star API v1] PUT expense-claim error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/expense-claims/{id}
 * Delete expense claim (draft, failed, or classification_failed claims only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const result = await deleteExpenseClaim(userId, id)

    if (!result.success) {
      if (result.error === 'Expense claim not found or access denied') {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 404 }
        )
      }

      if (result.error?.includes('Only draft') || result.error?.includes('Only draft or failed')) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Invalidate expense claims cache after successful deletion
    apiCache.invalidate(userId, 'expense-claims')

    return NextResponse.json({
      success: true,
      message: result.message || 'Expense claim deleted successfully'
    })

  } catch (error) {
    console.error('[North Star API v1] DELETE expense-claim error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}