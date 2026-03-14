/**
 * Invoice History API Route
 *
 * Returns list of invoices from Stripe for the authenticated user's business.
 * Stripe is the source of truth - we fetch directly from their API.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route GET /api/v1/billing/invoices
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

/**
 * Invoice type for API response
 */
interface InvoiceResponse {
  id: string
  number: string | null
  status: string
  amount: number
  currency: string
  created: string
  dueDate: string | null
  paidAt: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  description: string | null
  periodStart: string | null
  periodEnd: string | null
}

export async function GET(request: NextRequest) {
  console.log('[Billing Invoices] Fetching invoice history')

  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Invoices] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    const business = await client.query(api.functions.businesses.getCurrentBusiness)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // No Stripe customer = no invoices yet
    if (!business.stripeCustomerId) {
      return withCacheHeaders(NextResponse.json({
        success: true,
        data: {
          invoices: [],
          hasMore: false,
          message: 'No billing history yet'
        }
      }), 'standard')
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)
    const startingAfter = searchParams.get('starting_after') || undefined

    // Fetch invoices from Stripe, scoped to this business's subscription
    // to avoid showing invoices from other Groot products sharing the same Stripe customer
    const invoicesResponse = await getStripe().invoices.list({
      customer: business.stripeCustomerId,
      ...(business.stripeSubscriptionId ? { subscription: business.stripeSubscriptionId } : {}),
      limit,
      starting_after: startingAfter,
    })

    // Transform Stripe invoices to our response format
    // Filter out $0 trial invoices that mislead users (Stripe auto-generates these for trial periods)
    const invoices: InvoiceResponse[] = (invoicesResponse.data as unknown as Array<{
      id: string
      number: string | null
      status: string
      amount_due: number
      currency: string
      created: number
      due_date: number | null
      status_transitions: { paid_at: number | null }
      hosted_invoice_url: string | null
      invoice_pdf: string | null
      description: string | null
      period_start: number
      period_end: number
    }>)
    .filter((invoice) => {
      // Exclude $0 paid invoices (trial period invoices that show misleading "Paid $0.00")
      const isTrialInvoice = invoice.amount_due === 0 && invoice.status === 'paid'
      return !isTrialInvoice
    })
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status || 'draft',
      amount: invoice.amount_due,
      currency: invoice.currency.toUpperCase(),
      created: new Date(invoice.created * 1000).toISOString(),
      dueDate: invoice.due_date
        ? new Date(invoice.due_date * 1000).toISOString()
        : null,
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      description: invoice.description,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
    }))

    console.log(`[Billing Invoices] Found ${invoices.length} invoices for business ${business._id}`)

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: {
        invoices,
        hasMore: invoicesResponse.has_more,
      }
    }), 'standard')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Invoices] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
