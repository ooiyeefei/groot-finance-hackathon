import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../../convex/_generated/api'
import { internal } from '@/../../convex/_generated/api'
import type { Id } from '@/../../convex/_generated/dataModel'
import { sendBuyerNotification } from '@/lib/services/buyer-notification-service'
import {
  validateBuyerEmail,
  getSkipReason,
  type EventType,
} from '@/../../convex/lib/buyerNotificationHelper'

/**
 * POST /api/v1/sales-invoices/[invoiceId]/lhdn/notify
 *
 * Send buyer notification email for e-invoice lifecycle events.
 * Called internally from Convex actions after status changes.
 *
 * Flow:
 * 1. Authenticate with internal service key
 * 2. Load invoice + business data from Convex
 * 3. Validate buyer email
 * 4. Check idempotency (already sent check)
 * 5. Check business settings (notification enabled/disabled)
 * 6. Send email via buyer notification service
 * 7. Log result via appendNotificationLog internalMutation
 *
 * Auth: Internal service key (X-Internal-Key header) — not user-facing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params
    const body = await request.json()
    const { businessId, eventType, cancellationReason } = body as {
      businessId: string
      eventType: EventType
      cancellationReason?: string
    }

    // Verify internal service key
    const internalKey = request.headers.get('X-Internal-Key')
    const expectedKey = process.env.MCP_INTERNAL_SERVICE_KEY
    if (!internalKey || internalKey !== expectedKey) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Validate eventType
    if (!['validation', 'cancellation', 'rejection'].includes(eventType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid event type' },
        { status: 400 }
      )
    }

    // Validate cancellationReason if eventType is cancellation
    if (eventType === 'cancellation' && !cancellationReason) {
      return NextResponse.json(
        { success: false, error: 'Cancellation reason required for cancellation events' },
        { status: 400 }
      )
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

    // Load invoice (using getById query)
    const invoice = await convex.query(api.functions.salesInvoices.getById, {
      id: invoiceId,
      businessId: businessId as Id<'businesses'>,
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    // Load business (using getById query)
    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    })

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Get buyer email from customer snapshot
    const buyerEmail = invoice.customerSnapshot?.email

    // Check skip conditions (idempotency, email validation, business settings)
    const skipReason = getSkipReason(buyerEmail, business, invoice, eventType)

    if (skipReason) {
      // Log skip reason
      await convex.mutation(api.functions.salesInvoices.appendNotificationLogPublic, {
        invoiceId: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        logEntry: {
          eventType,
          recipientEmail: buyerEmail || '',
          timestamp: Date.now(),
          sendStatus: 'skipped',
          skipReason,
        },
      })

      console.log(
        `[LHDN Notify] Skipped ${eventType} notification for invoice ${invoice.invoiceNumber}: ${skipReason}`
      )

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: skipReason,
      })
    }

    // All checks passed - send email
    if (!buyerEmail) {
      throw new Error('buyerEmail is required but was null after skip checks')
    }

    if (!invoice.lhdnDocumentUuid || !invoice.lhdnLongId) {
      // Log failure
      await convex.mutation(api.functions.salesInvoices.appendNotificationLogPublic, {
        invoiceId: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        logEntry: {
          eventType,
          recipientEmail: buyerEmail,
          timestamp: Date.now(),
          sendStatus: 'failed',
          errorMessage: 'LHDN document UUID or long ID missing',
        },
      })

      return NextResponse.json(
        { success: false, error: 'Invoice not submitted to LHDN' },
        { status: 400 }
      )
    }

    // Map eventType to buyer notification service event format
    const notificationEvent =
      eventType === 'validation'
        ? 'validated'
        : eventType === 'cancellation'
          ? 'cancelled'
          : 'rejection_confirmed'

    // Send email via buyer notification service
    const result = await sendBuyerNotification({
      event: notificationEvent as 'validated' | 'cancelled' | 'rejection_confirmed',
      buyerEmail,
      buyerName: invoice.customerSnapshot?.businessName,
      invoiceNumber: invoice.invoiceNumber || 'N/A',
      businessName: business.name || 'Unknown Business',
      amount: invoice.totalAmount || 0,
      currency: invoice.currency || 'MYR',
      lhdnDocumentUuid: invoice.lhdnDocumentUuid,
      lhdnLongId: invoice.lhdnLongId,
      reason: cancellationReason,
    })

    // Log result
    if (result.success) {
      await convex.mutation(api.functions.salesInvoices.appendNotificationLogPublic, {
        invoiceId: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        logEntry: {
          eventType,
          recipientEmail: buyerEmail,
          timestamp: Date.now(),
          sendStatus: 'sent',
          sesMessageId: result.messageId,
        },
      })

      console.log(
        `[LHDN Notify] Sent ${eventType} notification for invoice ${invoice.invoiceNumber} to ${buyerEmail}`
      )

      return NextResponse.json({
        success: true,
        data: {
          sentTo: buyerEmail,
          sesMessageId: result.messageId,
          loggedAt: Date.now(),
        },
      })
    } else {
      await convex.mutation(api.functions.salesInvoices.appendNotificationLogPublic, {
        invoiceId: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        logEntry: {
          eventType,
          recipientEmail: buyerEmail,
          timestamp: Date.now(),
          sendStatus: 'failed',
          errorMessage: result.error,
        },
      })

      console.error(
        `[LHDN Notify] Failed to send ${eventType} notification for invoice ${invoice.invoiceNumber}: ${result.error}`
      )

      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send notification' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[LHDN Notify] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
