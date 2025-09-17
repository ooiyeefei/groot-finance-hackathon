/**
 * Debug API to check user permissions in database vs Clerk
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)
    
    // Get from Supabase employee_profiles
    const { data: profileData, error: profileError } = await supabase
      .from('employee_profiles')
      .select('user_id, role_permissions, created_at, updated_at')
      .eq('user_id', userId)
      .single()

    // Get from Clerk metadata
    const clerkUser = await (await clerkClient()).users.getUser(userId)
    
    return NextResponse.json({
      success: true,
      userId,
      supabase: {
        data: profileData,
        error: profileError
      },
      clerk: {
        publicMetadata: clerkUser.publicMetadata,
        privateMetadata: clerkUser.privateMetadata
      },
      comparison: {
        supabasePermissions: profileData?.role_permissions,
        clerkPermissions: clerkUser.publicMetadata?.permissions
      }
    })

  } catch (error) {
    console.error('[Debug User Permissions] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}