/**
 * LHDN E-Invoice Buyer Rejection (024-einv-buyer-reject-pivot)
 *
 * POST /api/v1/invoices/{invoiceId}/lhdn/reject
 *   - Rejects an LHDN-validated e-invoice within the 72-hour window
 *   - Calls LHDN API to register the rejection
 *   - Updates invoice status to "rejected" (read-only)
 *
 * Security:
 * - Requires Clerk authentication
 * - Only owner/finance_admin/manager roles
 * - Validates 72-hour window from lhdnValidatedAt
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { rejectDocument, authenticate } from '@/lib/lhdn/client'

const REJECTION_WINDOW_MS = 72 * 60 * 60 * 1000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business context for role check
    const context = await client.query(api.functions.businesses.getBusinessContext, {})
    if (!context || !context.businessId) {
      return NextResponse.json(
        { success: false, error: 'No active business context' },
        { status: 400 }
      )
    }

    // RBAC: owner, finance_admin, manager only
    if (!['owner', 'finance_admin', 'manager'].includes(context.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions — owner, finance_admin, or manager required' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { reason } = body

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Rejection reason is required' },
        { status: 400 }
      )
    }

    if (reason.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Rejection reason must be 500 characters or less' },
        { status: 400 }
      )
    }

    // Load invoice
    const invoice = await client.query(api.functions.invoices.getById, {
      id: invoiceId as Id<'invoices'>,
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Verify it's an LHDN-verified e-invoice
    const inv = invoice as Record<string, unknown>
    if (inv.lhdnVerificationStatus !== 'verified' || !inv.lhdnDocumentUuid) {
      return NextResponse.json(
        { success: false, error: 'Invoice is not an LHDN-verified e-invoice' },
        { status: 400 }
      )
    }

    // Check 72-hour window
    const validatedAt = inv.lhdnValidatedAt as number | undefined
    if (!validatedAt || Date.now() - validatedAt >= REJECTION_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: 'E-invoice is not within the 72-hour rejection window' },
        { status: 409 }
      )
    }

    // Authenticate with LHDN
    const business = await client.query(api.functions.businesses.getBusinessContext, {})
    const tin = (business as Record<string, unknown>).lhdnTin as string

    if (!tin) {
      return NextResponse.json(
        { success: false, error: 'Business LHDN TIN not configured' },
        { status: 400 }
      )
    }

    const token = await authenticate(tin)
    const uuid = inv.lhdnDocumentUuid as string

    // Call LHDN rejection API
    await rejectDocument(uuid, reason.trim(), token.accessToken)

    // Update invoice in Convex
    await client.mutation(api.functions.invoices.updateLhdnRejection, {
      invoiceId: invoiceId as Id<'invoices'>,
      reason: reason.trim(),
    })

    return NextResponse.json({
      success: true,
      data: {
        invoiceId,
        lhdnStatus: 'rejected',
        lhdnRejectedAt: Date.now(),
        message: 'E-invoice rejected successfully',
      },
    })
  } catch (error) {
    console.error('[LHDN Reject] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reject e-invoice',
      },
      { status: 500 }
    )
  }
}
