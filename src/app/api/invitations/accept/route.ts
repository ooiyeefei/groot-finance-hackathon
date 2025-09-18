/**
 * Invitation Acceptance API
 * GET /api/invitations/accept?token=<invitation_token> - Validate and prepare invitation for acceptance
 * POST /api/invitations/accept - Accept invitation and associate user with business
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'

/**
 * Validate invitation token (for when user clicks invitation link)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation token is required' 
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Validate the invitation token (user ID)
    const { data: invitation, error: fetchError } = await supabase
      .from('users')
      .select('id, email, created_at, role, business_id, invited_by')
      .eq('id', token)
      .is('clerk_user_id', null) // Only pending invitations
      .not('invited_by', 'is', null) // Must be an invitation
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid or expired invitation' 
      }, { status: 404 })
    }

    // Check if invitation hasn't expired (7 days)
    const invitedDate = new Date(invitation.created_at)
    const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))
    
    if (new Date() > expirationDate) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation has expired' 
      }, { status: 410 })
    }

    // Get business information
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', invitation.business_id)
      .single()

    return NextResponse.json({ 
      success: true, 
      invitation: {
        email: invitation.email,
        role: invitation.role,
        businessName: business?.name || 'FinanSEAL Business'
      }
    })

  } catch (error) {
    console.error('[Invitation Accept API] GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

/**
 * Accept invitation and associate authenticated user with business
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication required' 
      }, { status: 401 })
    }

    const body = await request.json()
    const { token, fullName } = body

    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation token is required' 
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Get the invitation record
    const { data: invitation, error: fetchError } = await supabase
      .from('users')
      .select('id, email, created_at, role, business_id, invited_by')
      .eq('id', token)
      .is('clerk_user_id', null) // Only pending invitations
      .not('invited_by', 'is', null) // Must be an invitation
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid invitation or already accepted' 
      }, { status: 404 })
    }

    // Check if invitation hasn't expired (7 days)
    const invitedDate = new Date(invitation.created_at)
    const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))
    
    if (new Date() > expirationDate) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation has expired' 
      }, { status: 410 })
    }

    // Get user's email from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await (await clerkClient()).users.getUser(userId)
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress

    // Verify email matches invitation
    if (!userEmail || userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: 'Email address does not match invitation'
      }, { status: 403 })
    }

    // Check if user already has records in Supabase (existing user accepting cross-business invitation)
    const { data: existingUserRecord } = await supabase
      .from('users')
      .select('id, business_id, role')
      .eq('clerk_user_id', userId)
      .single()

    if (existingUserRecord && existingUserRecord.id !== invitation.id) {
      // User already exists with different business - handle cross-business invitation
      console.log(`[Invitation Accept] Existing user ${userEmail} accepting cross-business invitation`)

      // For now, we'll prevent cross-business memberships to keep it simple
      // TODO: Implement multi-business support in future
      return NextResponse.json({
        success: false,
        error: 'You already belong to another business. Multi-business support is not yet available.'
      }, { status: 409 })
    }

    // Determine the full name to save
    let finalFullName = null
    if (fullName && fullName.trim()) {
      // Use provided full name from the form
      finalFullName = fullName.trim()
    } else if (clerkUser.firstName && clerkUser.lastName) {
      // Fall back to Clerk name if available
      finalFullName = `${clerkUser.firstName} ${clerkUser.lastName}`
    }

    // Update the invitation record to associate with Clerk user
    const { error: updateError } = await supabase
      .from('users')
      .update({
        clerk_user_id: userId,
        full_name: finalFullName,
        updated_at: new Date().toISOString()
      })
      .eq('id', token)

    if (updateError) {
      console.error('[Invitation Accept API] Update error:', updateError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to accept invitation' 
      }, { status: 500 })
    }

    // Create employee profile with invited business and role
    const rolePermissions = {
      employee: true,
      manager: invitation.role === 'admin' || invitation.role === 'manager' ? true : false,
      admin: invitation.role === 'admin' ? true : false
    }

    const { data: employeeProfile, error: profileError } = await supabase
      .from('employee_profiles')
      .insert({
        user_id: invitation.id, // Keep using invitation UUID as this links to the users table record
        business_id: invitation.business_id,
        employee_id: `EMP-${crypto.randomUUID()}`, // Use secure UUID
        department: 'General',
        job_title: invitation.role === 'admin' ? 'Administrator' : 
                   invitation.role === 'manager' ? 'Manager' : 'Employee',
        role_permissions: rolePermissions
      })
      .select('*')
      .single()

    if (profileError) {
      console.error('[Invitation Accept API] Profile creation error:', profileError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create employee profile' 
      }, { status: 500 })
    }

    // Sync role to Clerk metadata
    await syncRoleToClerk(userId, rolePermissions)

    console.log(`[Invitation Accept API] Invitation accepted: ${userEmail} → ${invitation.business_id}`)

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation accepted successfully',
      profile: employeeProfile
    })

  } catch (error) {
    console.error('[Invitation Accept API] POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}