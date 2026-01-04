/**
 * Audit Service Layer
 *
 * Business logic for audit trail management:
 * - Audit event creation and retrieval
 * - Multi-tenant isolation with business context
 * - Query filtering and pagination
 *
 * Migrated to Convex from Supabase
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 *
 * Security:
 * - Mandatory business_id filtering for multi-tenant isolation
 * - Tracks sensitive operations for compliance (SOC2, GDPR)
 *
 * Use Cases:
 * - Permission changes
 * - Data access tracking
 * - Deletion audit trails
 * - Compliance reporting
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'

// ===== TYPE DEFINITIONS =====

export interface AuditEvent {
  id: string
  business_id: string
  actor_user_id: string
  event_type: string
  target_entity_type: string
  target_entity_id: string
  details: Record<string, any>
  created_at: string
  actor_user?: {
    id: string
    full_name: string
    email: string
  }
}

export interface GetAuditEventsRequest {
  userId: string
  page?: number
  limit?: number
  event_type?: string
  target_entity_type?: string
  target_entity_id?: string
  actor_user_id?: string
  date_from?: string
  date_to?: string
}

export interface GetAuditEventsResult {
  events: AuditEvent[]
  pagination: {
    page: number
    limit: number
    total: number
    has_more: boolean
  }
}

export interface CreateAuditEventRequest {
  userId: string
  event_type: string
  target_entity_type: string
  target_entity_id: string
  details?: Record<string, any>
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Get Audit Events
 *
 * Retrieves audit events with filtering and pagination.
 * Enforces multi-tenant isolation with business_id.
 *
 * @param request - Query parameters and user context
 * @returns Paginated audit events
 * @throws Error if database query fails
 */
export async function getAuditEvents(request: GetAuditEventsRequest): Promise<GetAuditEventsResult> {
  const {
    userId,
    page = 1,
    limit = 100,
    event_type,
    target_entity_type,
    target_entity_id,
    actor_user_id,
    date_from,
    date_to
  } = request

  // Get user profile with business context
  const userProfile = await ensureUserProfile(userId)
  if (!userProfile) {
    throw new Error('Failed to get user profile')
  }

  // Get Convex client
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Convert date strings to timestamps if provided
  const dateFromTs = date_from ? new Date(date_from).getTime() : undefined
  const dateToTs = date_to ? new Date(date_to).getTime() : undefined

  // Calculate cursor from page
  const cursor = page > 1 ? String((page - 1) * limit) : undefined

  // Query audit events using Convex
  const result = await convexClient.query(api.functions.audit.list, {
    businessId: userProfile.business_id,
    eventType: event_type,
    targetEntityType: target_entity_type,
    targetEntityId: target_entity_id,
    actorUserId: actor_user_id,
    dateFrom: dateFromTs,
    dateTo: dateToTs,
    limit,
    cursor
  })

  // Transform Convex response to expected format
  const events: AuditEvent[] = (result.events || []).map((event: any) => ({
    id: event._id,
    business_id: event.businessId,
    actor_user_id: event.actorUserId,
    event_type: event.eventType,
    target_entity_type: event.targetEntityType,
    target_entity_id: event.targetEntityId,
    details: event.details || {},
    created_at: new Date(event._creationTime).toISOString(),
    actor_user: event.actorUser ? {
      id: event.actorUser.id,
      full_name: event.actorUser.fullName || '',
      email: event.actorUser.email
    } : undefined
  }))

  const total = result.totalCount || 0
  const offset = (page - 1) * limit

  return {
    events,
    pagination: {
      page,
      limit,
      total,
      has_more: total > offset + limit
    }
  }
}

/**
 * Create Audit Event
 *
 * Logs an audit event for sensitive operations.
 * Automatically includes business context and actor information.
 *
 * @param request - Audit event details
 * @returns Created audit event
 * @throws Error if creation fails
 */
export async function createAuditEvent(request: CreateAuditEventRequest): Promise<AuditEvent> {
  const { userId, event_type, target_entity_type, target_entity_id, details = {} } = request

  // Validate required fields
  if (!event_type || !target_entity_type || !target_entity_id) {
    throw new Error('event_type, target_entity_type, and target_entity_id are required')
  }

  // Get user profile with business context
  const userProfile = await ensureUserProfile(userId)
  if (!userProfile) {
    throw new Error('Failed to get user profile')
  }

  // Get Convex client
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Create audit event using Convex mutation
  const eventId = await convexClient.mutation(api.functions.audit.create, {
    businessId: userProfile.business_id,
    eventType: event_type,
    targetEntityType: target_entity_type,
    targetEntityId: target_entity_id,
    details
  })

  // Return the created event (fetch it to get full data)
  const createdEvent = await convexClient.query(api.functions.audit.getById, {
    id: eventId
  })

  if (!createdEvent) {
    throw new Error('Failed to retrieve created audit event')
  }

  return {
    id: createdEvent._id,
    business_id: createdEvent.businessId,
    actor_user_id: createdEvent.actorUserId,
    event_type: createdEvent.eventType,
    target_entity_type: createdEvent.targetEntityType,
    target_entity_id: createdEvent.targetEntityId,
    details: createdEvent.details || {},
    created_at: new Date(createdEvent._creationTime).toISOString(),
    actor_user: createdEvent.actorUser ? {
      id: createdEvent.actorUser.id,
      full_name: createdEvent.actorUser.fullName || '',
      email: createdEvent.actorUser.email
    } : undefined
  }
}
