/**
 * Invoice History API Route
 *
 * Returns list of invoices from Stripe for the authenticated user's business.
 * Stripe is the source of truth - we fetch directly from their API.
 *
 * @route GET /api/v1/billing/invoices
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Lazy initialization for Supabase client
let supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error('Supabase environment variables not configured')
    }

    supabaseAdmin = createClient<Database>(url, key)
  }
  return supabaseAdmin
}

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

    // Get user's business context
    const { data: user, error: userError } = await getSupabaseAdmin()
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Billing Invoices] User not found:', userError?.message)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (!user.business_id) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // Get business Stripe customer ID
    const { data: business, error: businessError } = await getSupabaseAdmin()
      .from('businesses')
      .select('id, stripe_customer_id')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Billing Invoices] Business not found:', businessError?.message)
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // No Stripe customer = no invoices yet
    if (!business.stripe_customer_id) {
      return NextResponse.json({
        success: true,
        data: {
          invoices: [],
          hasMore: false,
          message: 'No billing history yet'
        }
      })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)
    const startingAfter = searchParams.get('starting_after') || undefined

    // Fetch invoices from Stripe
    // Using type assertion for Stripe SDK v20+ compatibility
    const invoicesResponse = await getStripe().invoices.list({
      customer: business.stripe_customer_id,
      limit,
      starting_after: startingAfter,
    })

    // Transform Stripe invoices to our response format
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
    }>).map((invoice) => ({
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

    console.log(`[Billing Invoices] Found ${invoices.length} invoices for business ${business.id}`)

    return NextResponse.json({
      success: true,
      data: {
        invoices,
        hasMore: invoicesResponse.has_more,
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Invoices] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
