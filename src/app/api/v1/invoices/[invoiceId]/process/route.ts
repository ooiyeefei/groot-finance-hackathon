import { NextRequest, NextResponse } from 'next/server'
import { processDocument } from '@/domains/invoices/lib/data-access'
import { rateLimit } from '@/domains/security/lib/rate-limit'

/**
 * POST /api/v1/invoices/[invoiceId]/process - Process/reprocess invoice with OCR
 * Migrated from /api/invoices/[invoiceId]/process
 * Rate limited for expensive OCR/AI processing (10 requests per hour per user)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  // Apply strict rate limiting for expensive document processing operations
  const processRateLimit = await rateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10 // 10 processing requests per hour
  })

  if (processRateLimit) {
    return processRateLimit // Return rate limit error response
  }
  try {
    const { invoiceId } = await params

    console.log('[API v1] POST /invoices/:id/process - Invoice ID:', invoiceId)

    const result = await processDocument(invoiceId)

    return NextResponse.json({
      success: true,
      data: result
    }, { status: 202 }) // 202 Accepted for async processing

  } catch (error) {
    console.error('[API v1] POST /invoices/:id/process error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 })
      }

      if (error.message.includes('Document not found') || error.message.includes('access denied')) {
        return NextResponse.json({
          success: false,
          error: 'Document not found or access denied'
        }, { status: 404 })
      }

      if (error.message.includes('already being processed')) {
        return NextResponse.json({
          success: false,
          error: 'Document is already being processed'
        }, { status: 409 }) // Conflict
      }

      // Handle OCR usage limit exceeded
      if (error.message.includes('OCR limit reached')) {
        return NextResponse.json({
          success: false,
          error: error.message,
          requiresUpgrade: true
        }, { status: 403 }) // Forbidden - requires upgrade
      }

      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}