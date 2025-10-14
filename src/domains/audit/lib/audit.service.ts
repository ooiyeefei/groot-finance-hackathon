/**
 * Audit Service Layer
 *
 * Business logic for audit trail management:
 * - Audit event creation and retrieval
 * - Multi-tenant isolation with business context
 * - Query filtering and pagination
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

import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/db/supabase-server'

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

  // Get user data with business context
  const userData = await getUserData(userId)
  const supabase = await createAuthenticatedSupabaseClient(userId)

  // Build query with MANDATORY business context filtering
  let query = supabase
    .from('audit_events')
    .select(`
      *,
      actor_user:users!audit_events_actor_user_id_fkey (
        id,
        full_name,
        email
      )
    `, { count: 'exact' })
    .eq('business_id', userData.business_id) // CRITICAL: Multi-tenant isolation
    .order('created_at', { ascending: false })

  // Apply filters
  if (event_type) {
    query = query.eq('event_type', event_type)
  }
  if (target_entity_type) {
    query = query.eq('target_entity_type', target_entity_type)
  }
  if (target_entity_id) {
    query = query.eq('target_entity_id', target_entity_id)
  }
  if (actor_user_id) {
    query = query.eq('actor_user_id', actor_user_id)
  }
  if (date_from) {
    query = query.gte('created_at', date_from)
  }
  if (date_to) {
    query = query.lte('created_at', date_to)
  }

  // Apply pagination
  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data: auditEvents, error, count } = await query

  if (error) {
    console.error('[Audit Service] Query error:', error)
    throw new Error('Failed to fetch audit events')
  }

  return {
    events: auditEvents || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      has_more: (count || 0) > offset + limit
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

  // Get user data with business context
  const userData = await getUserData(userId)
  const supabase = await createAuthenticatedSupabaseClient(userId)

  // Create audit event with proper business context
  const { data: auditEvent, error: auditError } = await supabase
    .from('audit_events')
    .insert({
      business_id: userData.business_id, // Multi-tenant isolation
      actor_user_id: userData.id, // Use Supabase UUID
      event_type,
      target_entity_type,
      target_entity_id,
      details
    })
    .select()
    .single()

  if (auditError) {
    console.error('[Audit Service] Create error:', auditError)
    throw new Error('Failed to create audit event')
  }

  return auditEvent
}
