/**
 * Applications API v1
 * Thin wrappers around service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listApplications,
  createApplication
} from '@/domains/applications/lib/application.service'
import {
  ListApplicationsParamsSchema,
  CreateApplicationSchema
} from '@/domains/applications/validation/application.schema'

/**
 * GET /api/v1/applications
 * Lists applications for the authenticated user with pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse and validate query parameters using Zod schema
    const validationResult = ListApplicationsParamsSchema.safeParse({
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      status: searchParams.get('status') || undefined,
      application_type: searchParams.get('application_type') || undefined
    })

    // Return validation errors if any
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: validationResult.error.issues
        },
        { status: 400 }
      )
    }

    // Call service layer with validated parameters (includes retry logic for race conditions)
    const result = await listApplications(validationResult.data)

    // Return success response
    return NextResponse.json(
      {
        success: true,
        data: result
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API v1 GET /applications] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
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
 * POST /api/v1/applications
 * Creates a new application for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body using Zod schema
    const body = await request.json()
    const validationResult = CreateApplicationSchema.safeParse(body)

    // Return validation errors if any
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
          details: validationResult.error.issues
        },
        { status: 400 }
      )
    }

    // Call service layer with validated data
    const application = await createApplication(validationResult.data)

    // Return success response with 201 Created
    return NextResponse.json(
      {
        success: true,
        data: application
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API v1 POST /applications] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle invalid application type errors
    if (error instanceof Error && error.message.includes('Invalid application type')) {
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
