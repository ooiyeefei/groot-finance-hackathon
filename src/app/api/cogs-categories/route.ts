/**
 * Custom COGS Categories Management API
 * Allows users to manage their business Cost of Goods Sold categories for invoice categorization
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'

interface CustomCOGSCategory {
  id?: string
  category_name: string
  category_code: string
  description?: string
  gl_account: string
  cost_type: 'direct' | 'indirect'
  is_active?: boolean
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
}

// GET - Retrieve all COGS categories for the business
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    // Get COGS categories from the business JSONB column
    const { data: businessData, error: categoriesError } = await supabase
      .from('businesses')
      .select('custom_cogs_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    if (categoriesError) {
      console.error('[COGS Categories API] Error fetching categories:', categoriesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch COGS categories' },
        { status: 500 }
      )
    }

    // Extract categories from JSONB column and sort (include inactive categories for management)
    const categories = (businessData?.custom_cogs_categories || [])
      .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

    return NextResponse.json({
      success: true,
      data: {
        categories,
        can_manage: employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
      }
    })

  } catch (error) {
    console.error('[COGS Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new COGS category
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CustomCOGSCategory = await request.json()
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile and check permissions
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    // Check if user has management permissions
    const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to create COGS categories' },
        { status: 403 }
      )
    }

    // Validate required fields
    if (!body.category_name || !body.category_code || !body.gl_account || !body.cost_type) {
      return NextResponse.json(
        { success: false, error: 'Category name, code, GL account, and cost type are required' },
        { status: 400 }
      )
    }

    // Validate cost_type
    if (!['direct', 'indirect'].includes(body.cost_type)) {
      return NextResponse.json(
        { success: false, error: 'Cost type must be either "direct" or "indirect"' },
        { status: 400 }
      )
    }

    // Get existing categories to check for duplicates
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_cogs_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_cogs_categories || []
    const existingCategory = existingCategories.find((cat: any) => cat.category_code === body.category_code)

    if (existingCategory) {
      return NextResponse.json(
        { success: false, error: 'Category code already exists' },
        { status: 409 }
      )
    }

    // Create new COGS category object
    const newCategory = {
      id: crypto.randomUUID(),
      category_name: body.category_name,
      category_code: body.category_code,
      description: body.description || '',
      gl_account: body.gl_account,
      cost_type: body.cost_type,
      ai_keywords: body.ai_keywords || [],
      vendor_patterns: body.vendor_patterns || [],
      sort_order: body.sort_order || 99,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Add to existing categories array
    const updatedCategories = [...existingCategories, newCategory]

    // Update the business with the new categories array
    const { error: createError } = await supabase
      .from('businesses')
      .update({ custom_cogs_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)

    if (createError) {
      console.error('[COGS Categories API] Error creating category:', createError)
      return NextResponse.json(
        { success: false, error: 'Failed to create COGS category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: newCategory
    })

  } catch (error) {
    console.error('[COGS Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update existing COGS category
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CustomCOGSCategory & { id: string } = await request.json()
    const supabase = await createAuthenticatedSupabaseClient(userId)

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Category ID is required for updates' },
        { status: 400 }
      )
    }

    // Get or create employee profile and check permissions
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    // Check if user has management permissions
    const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to update COGS categories' },
        { status: 403 }
      )
    }

    // Validate cost_type if provided
    if (body.cost_type && !['direct', 'indirect'].includes(body.cost_type)) {
      return NextResponse.json(
        { success: false, error: 'Cost type must be either "direct" or "indirect"' },
        { status: 400 }
      )
    }

    // Get existing categories
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_cogs_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_cogs_categories || []
    const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === body.id)

    if (categoryIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'COGS category not found' },
        { status: 404 }
      )
    }

    // Update the category in the array
    const updatedCategories = [...existingCategories]
    updatedCategories[categoryIndex] = {
      ...updatedCategories[categoryIndex],
      category_name: body.category_name,
      category_code: body.category_code,
      description: body.description,
      gl_account: body.gl_account,
      cost_type: body.cost_type,
      ai_keywords: body.ai_keywords || [],
      vendor_patterns: body.vendor_patterns || [],
      sort_order: body.sort_order,
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString()
    }

    // Update the business with the modified categories array
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ custom_cogs_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)

    const updatedCategory = updatedCategories[categoryIndex]

    if (updateError) {
      console.error('[COGS Categories API] Error updating category:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update COGS category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedCategory
    })

  } catch (error) {
    console.error('[COGS Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete existing COGS category
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: { id: string } = await request.json()
    const supabase = await createAuthenticatedSupabaseClient(userId)

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Category ID is required for deletion' },
        { status: 400 }
      )
    }

    // Get or create employee profile and check permissions
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    // Check if user has management permissions
    const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to delete COGS categories' },
        { status: 403 }
      )
    }

    // Get existing categories
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_cogs_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_cogs_categories || []
    const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === body.id)

    if (categoryIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'COGS category not found' },
        { status: 404 }
      )
    }

    // Remove the category from the array
    const updatedCategories = existingCategories.filter((cat: any) => cat.id !== body.id)

    // Update the business with the filtered categories array
    const { error: deleteError } = await supabase
      .from('businesses')
      .update({ custom_cogs_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)

    if (deleteError) {
      console.error('[COGS Categories API] Error deleting category:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete COGS category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { deleted_id: body.id }
    })

  } catch (error) {
    console.error('[COGS Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}