/**
 * Audit Events API Route
 *
 * GET /api/v1/audit-events
 * POST /api/v1/audit-events
 *
 * Provides audit trail functionality for sensitive operations.
 * Enforces multi-tenant isolation with business context.
 *
 * Authentication: Clerk user authentication required
 * Use Case: Compliance tracking (SOC2, GDPR), security auditing
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAuditEvents, createAuditEvent } from '@/domains/audit/lib/audit.service'

/**
 * GET - Fetch Audit Events
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 100)
 * - event_type: string
 * - target_entity_type: string
 * - target_entity_id: string
 * - actor_user_id: string
 * - date_from: ISO date string
 * - date_to: ISO date string
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const event_type = searchParams.get('event_type') || undefined
    const target_entity_type = searchParams.get('target_entity_type') || undefined
    const target_entity_id = searchParams.get('target_entity_id') || undefined
    const actor_user_id = searchParams.get('actor_user_id') || undefined
    const date_from = searchParams.get('date_from') || undefined
    const date_to = searchParams.get('date_to') || undefined

    console.log('[Audit Events API] Fetching audit events with filters')

    // Call service layer
    const result = await getAuditEvents({
      userId,
      page,
      limit,
      event_type,
      target_entity_type,
      target_entity_id,
      actor_user_id,
      date_from,
      date_to
    })

    return NextResponse.json({
      success: true,
      data: result.events,
      pagination: result.pagination
    })

  } catch (error) {
    console.error('[Audit Events API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch audit events'
      },
      { status: 500 }
    )
  }
}

/**
 * POST - Create Audit Event
 *
 * Request Body:
 * {
 *   "event_type": "string (required)",
 *   "target_entity_type": "string (required)",
 *   "target_entity_id": "string (required)",
 *   "details": "object (optional)"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { event_type, target_entity_type, target_entity_id, details } = body

    // Validate required fields
    if (!event_type || !target_entity_type || !target_entity_id) {
      return NextResponse.json(
        { success: false, error: 'event_type, target_entity_type, and target_entity_id are required' },
        { status: 400 }
      )
    }

    console.log(`[Audit Events API] Creating audit event: ${event_type}`)

    // Call service layer
    const auditEvent = await createAuditEvent({
      userId,
      event_type,
      target_entity_type,
      target_entity_id,
      details
    })

    return NextResponse.json({
      success: true,
      data: auditEvent,
      message: 'Audit event logged successfully'
    })

  } catch (error) {
    console.error('[Audit Events API] POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create audit event'
      },
      { status: 500 }
    )
  }
}
