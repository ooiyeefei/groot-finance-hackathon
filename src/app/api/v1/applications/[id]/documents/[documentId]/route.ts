/**
 * Application Document Management API v1
 * DELETE - Soft delete document from application (preserves file)
 */

import { NextRequest, NextResponse } from 'next/server'
import { deleteDocument } from '@/domains/applications/lib/application-documents.service'

interface RouteParams {
  params: Promise<{ id: string; documentId: string }>
}

/**
 * DELETE /api/v1/applications/[id]/documents/[documentId]
 * Soft deletes document from application (file preserved in storage)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: applicationId, documentId } = await params

    if (!applicationId || !documentId) {
      return NextResponse.json(
        { success: false, error: 'Application ID and Document ID required' },
        { status: 400 }
      )
    }

    // Call service layer
    const result = await deleteDocument(applicationId, documentId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API v1 DELETE /applications/[id]/documents/[documentId]] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle not found errors
    if (error instanceof Error && (
      error.message.includes('not found') ||
      error.message.includes('access denied')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error during document removal'
      },
      { status: 500 }
    )
  }
}
