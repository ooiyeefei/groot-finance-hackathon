/**
 * Vendors API Endpoints
 * Manages Otto's vendor verification and risk assessment system
 * Part of the Hybrid Architecture implementation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { 
  Vendor, 
  CreateVendorRequest, 
  UpdateVendorRequest,
  CreateAuditEventRequest 
} from '@/types/expense-claims'

// Get vendors for current business
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
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search')
    const verification_status = searchParams.get('verification_status')
    const risk_level = searchParams.get('risk_level')

    // Build query
    let query = supabase
      .from('vendors')
      .select('*')
      .order('name', { ascending: true })

    // Apply filters
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    if (verification_status) {
      query = query.eq('verification_status', verification_status)
    }
    if (risk_level) {
      query = query.eq('risk_level', risk_level)
    }

    // Apply pagination
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data: vendors, error, count } = await query

    if (error) {
      console.error('[Vendors API] Query error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch vendors' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: vendors,
      pagination: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit
      }
    })

  } catch (error) {
    console.error('[Vendors API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Create new vendor
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CreateVendorRequest = await request.json()
    const { name, verification_status, risk_level, metadata } = body

    // Input validation
    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Vendor name is required' },
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

    // Create vendor
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .insert({
        name: name.trim(),
        business_id: user.business_id,
        verification_status: verification_status || 'unverified',
        risk_level: risk_level || 'low',
        metadata: metadata || {}
      })
      .select()
      .single()

    if (vendorError) {
      console.error('[Vendors API] Create error:', vendorError)
      
      // Handle unique constraint violation
      if (vendorError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'Vendor with this name already exists in your business' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to create vendor' },
        { status: 500 }
      )
    }

    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        business_id: user.business_id,
        actor_user_id: userId,
        event_type: 'vendor.created',
        target_entity_type: 'vendor',
        target_entity_id: vendor.id,
        details: {
          vendor_name: name,
          initial_verification_status: verification_status || 'unverified',
          initial_risk_level: risk_level || 'low'
        }
      })

    return NextResponse.json({
      success: true,
      data: vendor,
      message: 'Vendor created successfully'
    })

  } catch (error) {
    console.error('[Vendors API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}