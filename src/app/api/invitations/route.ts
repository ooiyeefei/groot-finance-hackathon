/**
 * Business Invitations API (Using Users Table)
 * POST /api/invitations - Create new invitation
 * GET /api/invitations - List invitations for business
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'
import { emailService } from '@/lib/services/email-service'
import type { CreateInvitationRequest } from '@/types/invitations'

/**
 * Create new business invitation
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({ 
        success: false, 
        error: 'Admin permissions required to send invitations' 
      }, { status: 403 })
    }

    const body = await request.json() as CreateInvitationRequest
    const { email, role, employee_id, department, job_title } = body

    // Validate input
    if (!email || !role) {
      return NextResponse.json({ 
        success: false, 
        error: 'Email and role are required' 
      }, { status: 400 })
    }

    if (!['employee', 'manager', 'admin'].includes(role)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid role specified' 
      }, { status: 400 })
    }

    // Map new role system to legacy user_role enum values
    const legacyRoleMapping: Record<string, string> = {
      'employee': 'member',
      'manager': 'admin',
      'admin': 'owner'
    }

    // Use service client to avoid schema cache issues with confirmation_token
    const supabase = createServiceSupabaseClient()

    // Check if user already exists in the business
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, clerk_user_id, created_at')
      .eq('business_id', userContext.profile.business_id)
      .ilike('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User is already a member of this business'
      }, { status: 409 })
    }

    // Check if pending invitation already exists
    const { data: existingInvitation } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('business_id', userContext.profile.business_id)
      .ilike('email', email)
      .eq('status', 'pending')
      .single()

    if (existingInvitation) {
      return NextResponse.json({
        success: false,
        error: 'Pending invitation already exists for this email'
      }, { status: 409 })
    }

    // Create invitation record in invitations table
    const { data: invitation, error: insertError } = await supabase
      .from('invitations')
      .insert({
        email: email.toLowerCase(),
        business_id: userContext.profile.business_id,
        invited_by: userId,
        role: legacyRoleMapping[role], // Map to legacy enum: employee->member, manager->admin, admin->owner
        employee_id,
        department,
        job_title,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('[Invitations API] Insert error:', insertError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create invitation' 
      }, { status: 500 })
    }

    // Get business name for email
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', userContext.profile.business_id)
      .single()

    // Get inviter name from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const inviterUser = await (await clerkClient()).users.getUser(userId)
    const inviterName = inviterUser.firstName && inviterUser.lastName 
      ? `${inviterUser.firstName} ${inviterUser.lastName}`
      : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

    // Send invitation email using the invitation token
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${invitation.invitation_token}`
    
    const emailResult = await emailService.sendInvitation({
      email,
      businessName: business?.name || 'FinanSEAL Business',
      inviterName,
      role, // Keep using the modern role for email content
      invitationToken: invitation.invitation_token, // Use invitation token
      invitationUrl
    })

    if (!emailResult.success) {
      // If email fails, we should still return the invitation but with a warning
      console.error('[Invitations API] Email sending failed:', emailResult.error)
      return NextResponse.json({ 
        success: true, 
        invitation,
        warning: 'Invitation created but email delivery failed. Please share the link manually.'
      })
    }

    console.log(`[Invitations API] Invitation sent: ${email} → ${userContext.profile.business_id}`)

    return NextResponse.json({ 
      success: true, 
      invitation 
    })

  } catch (error) {
    console.error('[Invitations API] Unexpected error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

/**
 * Get invitations for current business
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({ 
        success: false, 
        error: 'Admin permissions required to view invitations' 
      }, { status: 403 })
    }

    // Use service client to avoid schema cache issues with confirmation_token
    const supabase = createServiceSupabaseClient()

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query - get invitations from invitations table
    let query = supabase
      .from('invitations')
      .select('id, email, role, employee_id, department, job_title, invited_by, status, expires_at, accepted_at, created_at, invitation_token', { count: 'exact' })
      .eq('business_id', userContext.profile.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status)
    }

    const { data: invitations, error, count } = await query

    if (error) {
      console.error('[Invitations API] Fetch error:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch invitations' 
      }, { status: 500 })
    }

    // Transform data to match expected format
    const formattedInvitations = invitations?.map(invitation => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      department: invitation.department,
      job_title: invitation.job_title,
      status: invitation.status,
      invited_at: invitation.created_at,
      expires_at: invitation.expires_at,
      accepted_at: invitation.accepted_at,
      invited_by: invitation.invited_by,
      invitation_token: invitation.invitation_token
    })) || []

    return NextResponse.json({ 
      success: true, 
      invitations: formattedInvitations,
      total: count || 0
    })

  } catch (error) {
    console.error('[Invitations API] Unexpected error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}