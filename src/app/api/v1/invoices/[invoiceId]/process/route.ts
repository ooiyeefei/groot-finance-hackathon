import { NextRequest, NextResponse } from 'next/server'
import { processDocument } from '@/domains/invoices/lib/data-access'

/**
 * POST /api/v1/invoices/[invoiceId]/process - Process/reprocess invoice with OCR
 * Migrated from /api/invoices/[invoiceId]/process
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
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