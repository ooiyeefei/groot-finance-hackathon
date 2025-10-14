/**
 * Application Summary API v1
 * GET - Get AI-consolidated summary from all processed documents
 */

import { NextRequest, NextResponse } from 'next/server'
import { getApplicationSummary } from '@/domains/applications/lib/application-summary.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/v1/applications/[id]/summary
 * Consolidates AI-extracted data for loan officer review
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: applicationId } = await params

    // Call service layer
    const summary = await getApplicationSummary(applicationId)

    return NextResponse.json({
      success: true,
      data: summary
    })
  } catch (error) {
    console.error('[API v1 GET /applications/[id]/summary] Error:', error)

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
        { success: false, error: 'Application not found' },
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
