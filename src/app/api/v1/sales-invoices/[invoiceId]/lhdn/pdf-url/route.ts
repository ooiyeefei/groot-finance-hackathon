import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../../convex/_generated/api'
import type { Id } from '@/../../convex/_generated/dataModel'
import { getEinvoicePdfUrl } from '@/lib/cloudfront-signer'

/**
 * GET /api/v1/sales-invoices/[invoiceId]/lhdn/pdf-url
 *
 * Generate CloudFront signed URL for stored LHDN-validated e-invoice PDF.
 * 001-einv-pdf-gen: Server-side URL signing with private key from SSM.
 *
 * Auth: Clerk user session (invoice must belong to user's business).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    // Clerk authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { invoiceId } = await params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'businessId is required' },
        { status: 400 }
      )
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

    // Get S3 path from Convex
    const s3Path = await convex.query(api.functions.salesInvoices.getLhdnPdfPath, {
      invoiceId: invoiceId as Id<'sales_invoices'>,
      businessId: businessId as Id<'businesses'>,
    })

    if (!s3Path) {
      return NextResponse.json(
        { success: false, error: 'PDF not found or not yet generated' },
        { status: 404 }
      )
    }

    // Generate CloudFront signed URL (1-hour expiry)
    const signedUrl = await getEinvoicePdfUrl(s3Path, 3600)

    return NextResponse.json({
      success: true,
      data: { url: signedUrl },
    })
  } catch (error) {
    console.error('[LHDN PDF URL] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
