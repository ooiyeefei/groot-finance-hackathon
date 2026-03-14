import { NextRequest, NextResponse, after } from 'next/server'
import { getInvoices, createInvoice } from '@/domains/invoices/lib/data-access'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

/**
 * GET /api/v1/invoices - List invoices with filtering and pagination
 * Migrated from /api/invoices/list
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Extract query parameters for filtering
    const filters = {
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      file_type: searchParams.get('file_type') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      cursor: searchParams.get('cursor') || undefined,
    }

    console.log('[API v1] GET /invoices - Filters:', filters)

    const result = await getInvoices(filters)

    return withCacheHeaders(NextResponse.json(result, { status: 200 }), 'standard')
  } catch (error) {
    console.error('[API v1] GET /invoices error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 })
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

/**
 * POST /api/v1/invoices - Create new invoice/document with file upload
 * Migrated from /api/invoices/upload
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.expensive(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const businessId = formData.get('businessId') as string

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 })
    }

    if (!businessId) {
      return NextResponse.json({
        success: false,
        error: 'Business ID is required'
      }, { status: 400 })
    }

    console.log('[API v1] POST /invoices - File:', file.name, 'Business:', businessId)

    const invoice = await createInvoice({ file, businessId })

    // Schedule S3 upload to run AFTER response is sent
    if (invoice.backgroundWork) {
      after(invoice.backgroundWork)
    }

    // Remove backgroundWork from response payload
    const { backgroundWork: _, ...invoiceData } = invoice

    return NextResponse.json({
      success: true,
      data: invoiceData
    }, { status: 201 })

  } catch (error) {
    console.error('[API v1] POST /invoices error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message.includes('not authenticated')) {
        return NextResponse.json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 })
      }

      if (error.message.includes('Unauthorized access to business') ||
          error.message.includes('Business ID is required')) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized access to business'
        }, { status: 403 })
      }

      if (error.message.includes('Rate limit exceeded')) {
        return NextResponse.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        }, { status: 429 })
      }

      if (error.message.includes('File type') ||
          error.message.includes('File size') ||
          error.message.includes('Invalid')) {
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 400 })
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