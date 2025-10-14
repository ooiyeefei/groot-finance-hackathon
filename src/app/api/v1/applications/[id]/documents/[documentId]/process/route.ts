/**
 * Application Document Reprocessing API v1
 * POST - Reprocess document with application context
 */

import { NextRequest, NextResponse } from 'next/server'
import { reprocessDocument } from '@/domains/applications/lib/application-documents.service'

interface RouteParams {
  params: Promise<{ id: string; documentId: string }>
}

/**
 * POST /api/v1/applications/[id]/documents/[documentId]/process
 * Reprocesses document with application context for slot validation
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: applicationId, documentId } = await params

    // Call service layer
    const result = await reprocessDocument(applicationId, documentId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API v1 POST /applications/[id]/documents/[documentId]/process] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle not found or access denied errors
    if (error instanceof Error && (
      error.message.includes('not found') ||
      error.message.includes('access denied') ||
      error.message.includes('not associated')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    // Handle validation errors
    if (error instanceof Error && error.message.includes('status')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}
