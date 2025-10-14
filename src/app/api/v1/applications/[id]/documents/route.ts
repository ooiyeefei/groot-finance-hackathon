/**
 * Application Documents API v1
 * POST - Upload document to specific slot
 * GET - Get all documents in application
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  uploadDocument,
  getApplicationDocuments
} from '@/domains/applications/lib/application-documents.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/v1/applications/[id]/documents
 * Uploads document to specific application slot
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: applicationId } = await params
    const formData = await request.formData()

    const file = formData.get('file') as File
    const documentSlot = formData.get('slot') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!documentSlot) {
      return NextResponse.json(
        { success: false, error: 'Document slot is required' },
        { status: 400 }
      )
    }

    // Call service layer
    const result = await uploadDocument(applicationId, file, documentSlot)

    return NextResponse.json({
      success: true,
      data: result,
      message: result.is_replacement
        ? 'Document replaced and processing started'
        : 'Document uploaded and processing started'
    })
  } catch (error) {
    console.error('[API v1 POST /applications/[id]/documents] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle validation errors
    if (error instanceof Error && (
      error.message.includes('not found') ||
      error.message.includes('access denied')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    // Handle business logic errors
    if (error instanceof Error && (
      error.message.includes('Cannot upload') ||
      error.message.includes('required')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload document'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/applications/[id]/documents
 * Gets all documents for an application
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: applicationId } = await params

    // Call service layer
    const result = await getApplicationDocuments(applicationId)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('[API v1 GET /applications/[id]/documents] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle not found errors
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch documents'
      },
      { status: 500 }
    )
  }
}
