/**
 * Enabled Expense Categories API 
 * Returns only enabled categories for dropdowns and categorization
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'

interface EnabledCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
}

// GET - Retrieve only enabled categories for dropdowns and auto-categorization
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createBusinessContextSupabaseClient()
    
    // Get or create employee profile
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    console.log(`[Enabled Categories API] Fetching categories for business: ${employeeProfile.business_id}`)

    // Get categories from the business JSONB column
    const { data: businessData, error: categoriesError } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    if (categoriesError) {
      console.error('[Enabled Categories API] Error fetching categories:', categoriesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch categories' },
        { status: 500 }
      )
    }

    // Extract only enabled categories and sort by sort_order
    const allCategories = businessData?.custom_expense_categories || []
    const enabledCategories = allCategories
      .filter((category: any) => category.is_active !== false) // Default to enabled if not specified
      .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))
      .map((category: any) => ({
        id: category.id || category.category_code, // Use category_code as fallback ID
        category_name: category.category_name,
        category_code: category.category_code,
        description: category.description,
        vendor_patterns: category.vendor_patterns || [],
        ai_keywords: category.ai_keywords || []
      }))

    console.log(`[Enabled Categories API] Found ${enabledCategories.length} enabled categories`)

    return NextResponse.json({
      success: true,
      data: enabledCategories
    })

  } catch (error) {
    console.error('[Enabled Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}