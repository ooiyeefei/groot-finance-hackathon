import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData, createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

// GET - Fetch business profile for current user
export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const user = await getUserData(userId)

    if (!user.business_id) {
      return NextResponse.json({ error: 'No business associated with user' }, { status: 404 })
    }

    // SECURITY: Use authenticated client with RLS enforcement
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Fetch business profile using the user's business_id
    const { data: businessProfile, error } = await supabase
      .from('businesses')
      .select('id, name, logo_url, logo_fallback_color')
      .eq('id', user.business_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching business profile:', error)
      return NextResponse.json({ error: 'Failed to fetch business profile' }, { status: 500 })
    }

    // If no profile exists, create a default one
    if (!businessProfile) {
      const { data: newProfile, error: createError } = await supabase
        .from('businesses')
        .insert({
          name: 'My Business', // Clean default name without suffix
          logo_fallback_color: '#3b82f6'
        })
        .select('id, name, logo_url, logo_fallback_color')
        .single()

      if (createError) {
        console.error('Error creating business profile:', createError)
        return NextResponse.json({ error: 'Failed to create business profile' }, { status: 500 })
      }

      // CRITICAL FIX: Update user's business_id to link them to the newly created business
      const { error: linkError } = await supabase
        .from('users')
        .update({
          business_id: newProfile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (linkError) {
        console.error('Error linking user to new business:', linkError)
        return NextResponse.json({ error: 'Failed to link user to business' }, { status: 500 })
      }

      console.log(`[Business Profile] Successfully created and linked business ${newProfile.id} to user ${userId}`)
      return NextResponse.json({ success: true, data: newProfile })
    }

    return NextResponse.json({ success: true, data: businessProfile })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update business profile
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, logo_url, logo_fallback_color } = body

    // Validate input
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const user = await getUserData(userId)

    if (!user.business_id) {
      return NextResponse.json({ error: 'No business associated with user' }, { status: 404 })
    }

    // SECURITY: Use authenticated client with RLS enforcement
    const supabase = await createAuthenticatedSupabaseClient(userId)

    const updateData: any = {
      name: name.trim(),
      updated_at: new Date().toISOString()
    }

    if (logo_url !== undefined) {
      updateData.logo_url = logo_url
    }

    if (logo_fallback_color) {
      updateData.logo_fallback_color = logo_fallback_color
    }

    // Update business profile using the user's business_id
    const { data: updatedProfile, error } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', user.business_id)
      .select('id, name, logo_url, logo_fallback_color')
      .single()

    if (error) {
      console.error('Error updating business profile:', error)
      return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: updatedProfile })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}