/**
 * Applications API v1 - Individual Application Operations
 * GET - Fetch single application with slot details
 * PUT - Update application (draft only)
 * DELETE - Delete application (draft only)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getApplication,
  updateApplication,
  deleteApplication
} from '@/domains/applications/lib/application.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/v1/applications/[id]
 * Fetches single application with detailed slot information
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Call service layer
    const application = await getApplication(id)

    return NextResponse.json({
      success: true,
      data: application
    })
  } catch (error) {
    console.error('[API v1 GET /applications/[id]] Error:', error)

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
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/v1/applications/[id]
 * Updates application details (draft only)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()

    // Call service layer
    const application = await updateApplication(id, body)

    return NextResponse.json({
      success: true,
      data: application,
      message: 'Application updated successfully'
    })
  } catch (error) {
    console.error('[API v1 PUT /applications/[id]] Error:', error)

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

    // Handle validation errors
    if (error instanceof Error && error.message.includes('Cannot edit')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
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

/**
 * DELETE /api/v1/applications/[id]
 * Deletes draft application (documents preserved and disassociated)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Call service layer
    await deleteApplication(id)

    return NextResponse.json({
      success: true,
      message: 'Application deleted successfully (documents preserved)'
    })
  } catch (error) {
    console.error('[API v1 DELETE /applications/[id]] Error:', error)

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

    // Handle validation errors
    if (error instanceof Error && error.message.includes('Only draft')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
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
