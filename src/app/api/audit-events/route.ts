/**
 * Audit Events API Endpoints
 * Provides Otto's consolidated audit trail functionality
 * Part of the Hybrid Architecture implementation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { CreateAuditEventRequest } from '@/types/expense-claims'

// Get audit events with filtering
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 🚨 CRITICAL SECURITY FIX: Add business context validation to prevent cross-tenant data exposure
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    const { searchParams } = new URL(request.url)

    // Query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const event_type = searchParams.get('event_type')
    const target_entity_type = searchParams.get('target_entity_type')
    const target_entity_id = searchParams.get('target_entity_id')
    const actor_user_id = searchParams.get('actor_user_id')
    const date_from = searchParams.get('date_from')
    const date_to = searchParams.get('date_to')

    // 🚨 CRITICAL SECURITY FIX: Build query with MANDATORY business context filtering
    let query = supabase
      .from('audit_events')
      .select(`
        *,
        actor_user:users!audit_events_actor_user_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('business_id', userData.business_id) // 🚨 CRITICAL: Prevent cross-business audit log access
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
      console.error('[Audit Events API] Query error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit events' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: auditEvents,
      pagination: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit
      }
    })

  } catch (error) {
    console.error('[Audit Events API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Create audit event (for manual logging)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CreateAuditEventRequest = await request.json()
    const { event_type, target_entity_type, target_entity_id, details } = body

    // Input validation
    if (!event_type || !target_entity_type || !target_entity_id) {
      return NextResponse.json(
        { success: false, error: 'event_type, target_entity_type, and target_entity_id are required' },
        { status: 400 }
      )
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // SECURITY FIX: Create audit event with proper business context and Supabase UUID
    const { data: auditEvent, error: auditError } = await supabase
      .from('audit_events')
      .insert({
        business_id: userData.business_id, // SECURITY FIX: Use validated business context
        actor_user_id: userData.id, // SECURITY FIX: Use Supabase UUID instead of Clerk ID
        event_type,
        target_entity_type,
        target_entity_id,
        details: details || {}
      })
      .select()
      .single()

    if (auditError) {
      console.error('[Audit Events API] Create error:', auditError)
      return NextResponse.json(
        { success: false, error: 'Failed to create audit event' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: auditEvent,
      message: 'Audit event logged successfully'
    })

  } catch (error) {
    console.error('[Audit Events API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}