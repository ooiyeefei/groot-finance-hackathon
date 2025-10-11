/**
 * User Profile API Routes
 * GET - Fetch user profile data including home currency
 * PATCH - Update user profile settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'
import { SupportedCurrency } from '@/types/transaction'

// GET /api/user/profile - Fetch user profile
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // HYBRID: Use cached getUserData which has all needed fields
    const userData = await getUserData(userId)

    // getUserData already contains all user profile fields we need
    const completeProfile = {
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      home_currency: userData.home_currency,
      // Use defaults for optional fields if not present in userData
      language_preference: (userData as any).language_preference || 'en',
      timezone: (userData as any).timezone || 'Asia/Singapore',
      created_at: (userData as any).created_at || null,
      updated_at: (userData as any).updated_at || null
    }

    return NextResponse.json({
      success: true,
      data: completeProfile
    })

  } catch (error) {
    console.error('Error in GET /api/user/profile:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/user/profile - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const userData = await getUserData(userId)

    // HYBRID: Use service client for user profile updates (bypass RLS for user's own profile)
    const { createServiceSupabaseClient } = await import('@/lib/supabase-server')
    const supabase = createServiceSupabaseClient()

    // Validate supported fields
    const allowedFields = ['home_currency', 'full_name', 'language_preference', 'timezone']
    const updateData: any = {}

    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        // Validate home_currency if provided
        if (key === 'home_currency') {
          const supportedCurrencies = ['THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR']
          if (!supportedCurrencies.includes(value as string)) {
            return NextResponse.json(
              { success: false, error: `Unsupported currency: ${value}` },
              { status: 400 }
            )
          }
        }
        updateData[key] = value
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString()

    // Update user profile using service client (bypasses RLS for user's own profile)
    const { data: updatedProfile, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userData.id)
      .select('id, email, full_name, home_currency, language_preference, timezone, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error updating user profile:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    console.log(`[User Profile API] Updated profile for user ${userId}:`, updateData)

    return NextResponse.json({
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully'
    })

  } catch (error) {
    console.error('Error in PATCH /api/user/profile:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}