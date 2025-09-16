/**
 * Audit Events API Endpoints
 * Provides Otto's consolidated audit trail functionality
 * Part of the Hybrid Architecture implementation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
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

    const supabase = await createAuthenticatedSupabaseClient()
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

    // Build query with user/actor information
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

    const supabase = await createAuthenticatedSupabaseClient()

    // Get user's business_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('business_id')
      .eq('id', userId)
      .single()

    if (userError || !user?.business_id) {
      return NextResponse.json(
        { success: false, error: 'User business not found' },
        { status: 400 }
      )
    }

    // Create audit event
    const { data: auditEvent, error: auditError } = await supabase
      .from('audit_events')
      .insert({
        business_id: user.business_id,
        actor_user_id: userId,
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