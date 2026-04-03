/**
 * n8n Webhook Endpoint — Hackathon Demo
 *
 * Receives automation commands from n8n workflows.
 * Supports: auto-approve expenses, mark reimbursed, trigger notifications.
 *
 * n8n sends POST with action + claimId after policy evaluation.
 * Authenticated via shared secret (N8N_WEBHOOK_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || 'hackathon-demo-secret'

type N8nAction = 'auto_approve' | 'mark_reimbursed' | 'policy_check'

interface N8nWebhookPayload {
  action: N8nAction
  claimId: string
  reason?: string
  paymentMethod?: string
  /** Service account userId for Convex auth bypass */
  actingUserId?: string
}

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload: N8nWebhookPayload = await req.json()
  const { action, claimId, reason, paymentMethod, actingUserId } = payload

  if (!action || !claimId) {
    return NextResponse.json({ error: 'action and claimId required' }, { status: 400 })
  }

  try {
    // Use service account or provided userId for Convex operations
    const userId = actingUserId || process.env.N8N_SERVICE_USER_ID
    if (!userId) {
      return NextResponse.json({ error: 'No acting user configured' }, { status: 500 })
    }

    const convex = await getAuthenticatedConvex(userId)

    switch (action) {
      case 'policy_check': {
        // Fetch claim details for n8n policy evaluation
        const claim = await convex.query(api.functions.expenseClaims.getById, {
          id: claimId as any,
        })

        if (!claim) {
          return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
        }

        return NextResponse.json({
          success: true,
          data: {
            id: claim._id,
            status: claim.status,
            amount: claim.totalAmount,
            currency: claim.originalCurrency,
            vendor: claim.vendorName,
            category: claim.expenseCategory,
            submittedBy: claim.userId,
            businessId: claim.businessId,
          },
        })
      }

      case 'auto_approve': {
        // Auto-approve the expense claim
        await convex.mutation(api.functions.expenseClaims.updateStatus, {
          id: claimId as any,
          status: 'approved',
          reviewedBy: userId,
          approvalNotes: reason || 'Auto-approved by n8n automation policy',
        })

        return NextResponse.json({
          success: true,
          message: `Claim ${claimId} auto-approved`,
          action: 'auto_approve',
        })
      }

      case 'mark_reimbursed': {
        // Mark as reimbursed (mock payment)
        await convex.mutation(api.functions.expenseClaims.updateStatus, {
          id: claimId as any,
          status: 'reimbursed',
          reviewedBy: userId,
          approvalNotes: `Payment processed via ${paymentMethod || 'bank transfer'} — automated by n8n`,
        })

        return NextResponse.json({
          success: true,
          message: `Claim ${claimId} marked as reimbursed`,
          action: 'mark_reimbursed',
          paymentMethod: paymentMethod || 'bank_transfer',
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[n8n Webhook] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

/**
 * GET — Health check for n8n webhook node configuration
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'groot-finance-n8n-webhook',
    actions: ['policy_check', 'auto_approve', 'mark_reimbursed'],
    version: '1.0.0',
  })
}
