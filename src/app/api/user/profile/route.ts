/**
 * User Profile API Routes
 * GET - Fetch user profile data including home currency
 * PATCH - Update user profile settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
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

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get user profile from users table
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('id, email, full_name, home_currency, language_preference, timezone, created_at, updated_at')
      .eq('clerk_user_id', userId)
      .single()

    if (error || !userProfile) {
      console.error('Error fetching user profile:', error)
      return NextResponse.json(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: userProfile
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
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Validate supported fields
    const allowedFields = ['home_currency', 'full_name', 'language_preference', 'timezone']
    const updateData: any = {}

    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        // Validate home_currency if provided
        if (key === 'home_currency') {
          const supportedCurrencies = ['THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP']
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

    // Update user profile
    const { data: updatedProfile, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('clerk_user_id', userId)
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