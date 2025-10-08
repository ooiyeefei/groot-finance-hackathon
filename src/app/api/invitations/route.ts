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
import { createInvitationToken, isLegacyUuidToken } from '@/lib/invitation-tokens'
import { rateLimiters } from '@/lib/rate-limit'
import { csrfProtection } from '@/lib/csrf-protection'

/**
 * Create new business invitation
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for invitation creation (admin operation)
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

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

    // Enhanced multi-tenant user checking
    console.log(`[Invitations API] Checking for existing user with email: ${email}`)

    // Check if user already has active membership in current business
    const { data: activeMembership } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        role,
        status,
        users!business_memberships_user_id_fkey!inner(email, clerk_user_id, full_name)
      `)
      .eq('business_id', userContext.profile.business_id)
      .eq('status', 'active')
      .ilike('users.email', email)
      .single()

    if (activeMembership) {
      console.log('[Invitations API] User already has active membership:', activeMembership)
      return NextResponse.json({
        success: false,
        error: 'User is already an active member of this business'
      }, { status: 409 })
    }

    // Check for pending invitations in current business
    const { data: pendingMembership } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        role,
        status,
        users!business_memberships_user_id_fkey!inner(email, clerk_user_id, full_name)
      `)
      .eq('business_id', userContext.profile.business_id)
      .eq('status', 'pending')
      .ilike('users.email', email)
      .single()

    if (pendingMembership) {
      console.log(`[Invitations API] Found pending invitation for ${email}, cleaning up for re-invitation`)

      // CRITICAL FIX: Only delete business membership, NEVER delete user records
      // Users may belong to multiple businesses in multi-tenant system
      await supabase
        .from('business_memberships')
        .delete()
        .eq('id', pendingMembership.id)
        .eq('business_id', userContext.profile.business_id) // Multi-tenant isolation

      console.log(`[Invitations API] Cleaned up pending business membership for re-invitation`)
    }

    // Check for removed membership that can be reactivated
    const { data: removedMembership } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        role,
        status,
        users!business_memberships_user_id_fkey!inner(email, clerk_user_id, full_name)
      `)
      .eq('business_id', userContext.profile.business_id)
      .eq('status', 'removed')
      .ilike('users.email', email)
      .single()

    if (removedMembership) {
      console.log(`[Invitations API] Found removed membership for ${email}, can reactivate instead of creating new invitation`)
      return NextResponse.json({
        success: false,
        error: 'User was previously removed from this business. Use the reactivation API instead of sending a new invitation.',
        suggestion: 'reactivate_membership',
        user_id: removedMembership.user_id
      }, { status: 409 })
    }

    // Check for existing user globally (for cross-business invitations)
    const { data: globalUser } = await supabase
      .from('users')
      .select('id, clerk_user_id, business_id, full_name, email, status')
      .ilike('email', email)
      .not('clerk_user_id', 'is', null) // Has Clerk account
      .single()

    let targetUserId = null
    let isExistingUser = false

    if (globalUser) {
      console.log(`[Invitations API] Found existing user globally: ${email}`)

      // Check if user has any active memberships in other businesses
      const { data: otherMemberships } = await supabase
        .from('business_memberships')
        .select('business_id, role, status')
        .eq('user_id', globalUser.id)
        .eq('status', 'active')
        .neq('business_id', userContext.profile.business_id)

      if (otherMemberships && otherMemberships.length > 0) {
        console.log(`[Invitations API] User ${email} has active memberships in ${otherMemberships.length} other businesses - creating cross-business invitation`)
        targetUserId = globalUser.id
        isExistingUser = true
      } else {
        console.log(`[Invitations API] User ${email} exists but has no other active memberships - treating as standard invitation`)
        targetUserId = globalUser.id
        isExistingUser = true
      }
    }

    // Create or update user record for invitation
    let invitation
    let insertError

    if (isExistingUser && targetUserId) {
      // For existing users, we don't create a new user record
      // We'll create the membership directly and use existing user
      console.log(`[Invitations API] Using existing user record for cross-business invitation: ${targetUserId}`)

      invitation = globalUser
    } else {
      // Create new user record for truly new users
      console.log(`[Invitations API] Creating new user record for invitation`)

      const insertResult = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          business_id: userContext.profile.business_id,
          invited_by: userId, // Use Clerk ID for invited_by field
          full_name: null, // Will be filled when user signs up
          home_currency: 'SGD', // Default, user can change later
          clerk_user_id: null, // Explicitly set to null for pending invitations
          invited_role: role, // Store the invited role as fallback
          // Note: status is handled in business_memberships table, not users table
          // Note: created_at will be auto-generated and used as invitation timestamp
        })
        .select('*')
        .single()

      invitation = insertResult.data
      insertError = insertResult.error

      if (invitation) {
        targetUserId = invitation.id
      }
    }

    if (insertError) {
      console.error('[Invitations API] Insert error:', insertError)
      return NextResponse.json({
        success: false,
        error: 'Failed to create invitation'
      }, { status: 500 })
    }

    // Create business membership record with the invited role
    const membershipData: any = {
      user_id: targetUserId, // Links to the users table record
      business_id: userContext.profile.business_id,
      role: role, // Store the actual invited role
      invited_at: new Date().toISOString(),
      status: 'pending', // Proper pending status for invitations
      joined_at: null // Will be set when invitation is accepted
    }

    console.log(`[Invitations API] Creating ${isExistingUser ? 'cross-business' : 'new user'} membership:`, membershipData)

    const { error: membershipError } = await supabase
      .from('business_memberships')
      .insert(membershipData)

    if (membershipError) {
      console.error('[Invitations API] Business membership creation error:', membershipError)
      console.error('[Invitations API] Attempted membership data:', {
        user_id: invitation.id,
        business_id: userContext.profile.business_id,
        role: role,
        email: email
      })

      // Check for existing membership with same email
      const { data: existingMemberships } = await supabase
        .from('business_memberships')
        .select('id, user_id, role, status')
        .eq('business_id', userContext.profile.business_id)
        .in('user_id', [invitation.id])

      if (existingMemberships && existingMemberships.length > 0) {
        console.error('[Invitations API] Found existing memberships:', existingMemberships)
      }

      // Clean up only if we created a new user record
      if (!isExistingUser && invitation?.id) {
        await supabase.from('users').delete().eq('id', invitation.id)
      }
      return NextResponse.json({
        success: false,
        error: `Failed to create invitation membership: ${membershipError.message}`
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

    // Generate secure JWT invitation token with 7-day expiration
    const secureToken = await createInvitationToken(
      targetUserId!,
      userContext.profile.business_id,
      email,
      role,
      7 // 7 days expiration
    )

    // Send invitation email using the JWT token
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

    const emailResult = await emailService.sendInvitation({
      email,
      businessName: business?.name || 'FinanSEAL Business',
      inviterName,
      role, // Keep using the modern role for email content
      invitationToken: secureToken, // Use JWT token
      invitationUrl
    })

    if (!emailResult.success) {
      // If email fails, we should still return the invitation but with a warning
      console.error('[Invitations API] Email sending failed:', emailResult.error)
      return NextResponse.json({
        success: true,
        invitation,
        emailFailed: true,
        warning: `Invitation created but email delivery failed: ${emailResult.error}. Please share the invitation link manually or try resending.`
      })
    }

    console.log(`[Invitations API] ${isExistingUser ? 'Cross-business' : 'New user'} invitation sent: ${email} → ${userContext.profile.business_id}`)

    return NextResponse.json({
      success: true,
      invitation: {
        id: targetUserId,
        email: email.toLowerCase(),
        role: role,
        business_id: userContext.profile.business_id,
        invited_by: userId,
        invitation_type: isExistingUser ? 'cross_business' : 'new_user',
        created_at: new Date().toISOString()
      }
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
    // Apply rate limiting for admin queries
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

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

    // Build query - get pending invitations (invited but no clerk_user_id yet)
    // Include invited_role and join with business_memberships to get role information
    // Specify the exact relationship to avoid ambiguity
    let query = supabase
      .from('users')
      .select(`
        id,
        email,
        created_at,
        invited_by,
        full_name,
        clerk_user_id,
        invited_role,
        business_memberships!business_memberships_user_id_fkey!inner(role)
      `, { count: 'exact' })
      .eq('business_id', userContext.profile.business_id)
      .not('invited_by', 'is', null) // Has been invited (invited_by is set)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by status if provided
    if (status === 'pending') {
      query = query.is('clerk_user_id', null) // Not yet accepted
    } else if (status === 'accepted') {
      query = query.not('clerk_user_id', 'is', null) // Has accepted
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
    const formattedInvitations = invitations?.map(invitation => {
      // Get role from business_memberships or fall back to invited_role
      const membershipRole = invitation.business_memberships?.[0]?.role
      const role = membershipRole || invitation.invited_role || 'employee'

      return {
        id: invitation.id,
        email: invitation.email,
        status: invitation.clerk_user_id ? 'accepted' : 'pending',
        invited_at: invitation.created_at, // Use created_at as invited_at
        invited_by: invitation.invited_by,
        invitation_token: invitation.id, // Use user ID as token
        role: role // Include the actual invited role
      }
    }) || []

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