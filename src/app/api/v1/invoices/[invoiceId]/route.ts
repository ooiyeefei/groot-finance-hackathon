import { NextRequest, NextResponse } from 'next/server'
import { getDocument, updateDocument, deleteDocument, processDocument } from '@/domains/invoices/lib/data-access'

/**
 * GET /api/v1/invoices/[invoiceId] - Get single invoice by ID
 * Migrated from /api/invoices/[invoiceId] GET
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await params

    console.log('[API v1] GET /invoices/:id - Invoice ID:', invoiceId)

    const document = await getDocument(invoiceId)

    if (!document) {
      return NextResponse.json({
        success: false,
        error: 'Document not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: document
    }, { status: 200 })

  } catch (error) {
    console.error('[API v1] GET /invoices/:id error:', error)

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
 * PUT /api/v1/invoices/[invoiceId] - Update invoice
 * Migrated from /api/invoices/[invoiceId] PUT
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await params
    const body = await request.json()

    console.log('[API v1] PUT /invoices/:id - Invoice ID:', invoiceId, 'Updates:', body)

    // Validate request body
    const allowedFields = ['processing_status', 'extracted_data', 'error_message', 'confidence_score']
    const updates = Object.keys(body)
      .filter(key => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = body[key]
        return obj
      }, {})

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid update fields provided'
      }, { status: 400 })
    }

    const document = await updateDocument(invoiceId, updates)

    return NextResponse.json({
      success: true,
      data: document
    }, { status: 200 })

  } catch (error) {
    console.error('[API v1] PUT /invoices/:id error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 })
      }

      if (error.message.includes('Failed to update document')) {
        return NextResponse.json({
          success: false,
          error: 'Document not found or access denied'
        }, { status: 404 })
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
 * DELETE /api/v1/invoices/[invoiceId] - Delete invoice (soft delete)
 * Migrated from /api/invoices/[invoiceId] DELETE
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await params

    console.log('[API v1] DELETE /invoices/:id - Invoice ID:', invoiceId)

    await deleteDocument(invoiceId)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    }, { status: 200 })

  } catch (error) {
    console.error('[API v1] DELETE /invoices/:id error:', error)

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

      if (error.message.includes('linked transactions')) {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete document that has linked transactions. Please delete the transaction first.'
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