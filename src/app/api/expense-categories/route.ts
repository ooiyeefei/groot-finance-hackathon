/**
 * Custom Expense Categories Management API
 * Allows users to manage their business expense categories
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createBusinessContextSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'

interface CustomExpenseCategory {
  id?: string
  category_name: string
  category_code: string
  description?: string
  is_active?: boolean
  parent_category_id?: string
  ai_keywords?: string[]
  vendor_patterns?: string[]
  tax_treatment?: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt?: boolean
  receipt_threshold?: number
  policy_limit?: number
  requires_manager_approval?: boolean
  sort_order?: number
}

// GET - Retrieve all categories for the business
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

    // Get categories from the business JSONB column
    const { data: businessData, error: categoriesError } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    if (categoriesError) {
      console.error('[Categories API] Error fetching categories:', categoriesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch categories' },
        { status: 500 }
      )
    }

    // Extract categories from JSONB column and sort (include inactive categories for management)
    const categories = (businessData?.custom_expense_categories || [])
      .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

    return NextResponse.json({
      success: true,
      data: {
        categories,
        can_manage: employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
      }
    })

  } catch (error) {
    console.error('[Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new category
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CustomExpenseCategory = await request.json()
    const supabase = await createBusinessContextSupabaseClient()
    
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
        { success: false, error: 'Insufficient permissions to create categories' },
        { status: 403 }
      )
    }

    // Validate required fields
    if (!body.category_name || !body.category_code) {
      return NextResponse.json(
        { success: false, error: 'Category name and code are required' },
        { status: 400 }
      )
    }

    // Get existing categories to check for duplicates
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_expense_categories || []
    const existingCategory = existingCategories.find((cat: any) => cat.category_code === body.category_code)

    if (existingCategory) {
      return NextResponse.json(
        { success: false, error: 'Category code already exists' },
        { status: 409 }
      )
    }

    // Create new category object
    const newCategory = {
      id: crypto.randomUUID(),
      category_name: body.category_name,
      category_code: body.category_code,
      description: body.description || '',
      parent_category_id: body.parent_category_id || null,
      ai_keywords: body.ai_keywords || [],
      vendor_patterns: body.vendor_patterns || [],
      tax_treatment: body.tax_treatment || 'deductible',
      requires_receipt: body.requires_receipt ?? false,
      receipt_threshold: body.receipt_threshold || 0,
      policy_limit: body.policy_limit || null,
      requires_manager_approval: true, // Always require manager approval
      sort_order: body.sort_order || 99,
      is_active: true,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Add to existing categories array
    const updatedCategories = [...existingCategories, newCategory]
    
    // Update the business with the new categories array
    const { error: createError } = await supabase
      .from('businesses')
      .update({ custom_expense_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)

    if (createError) {
      console.error('[Categories API] Error creating category:', createError)
      return NextResponse.json(
        { success: false, error: 'Failed to create category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: newCategory
    })

  } catch (error) {
    console.error('[Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update existing category
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CustomExpenseCategory & { id: string } = await request.json()
    const supabase = await createBusinessContextSupabaseClient()
    
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
        { success: false, error: 'Insufficient permissions to update categories' },
        { status: 403 }
      )
    }

    // Get existing categories
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_expense_categories || []
    const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === body.id)
    
    if (categoryIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Category not found' },
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
      ai_keywords: body.ai_keywords || [],
      vendor_patterns: body.vendor_patterns || [],
      tax_treatment: body.tax_treatment,
      requires_receipt: body.requires_receipt,
      receipt_threshold: body.receipt_threshold,
      policy_limit: body.policy_limit,
      requires_manager_approval: body.requires_manager_approval,
      sort_order: body.sort_order,
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString()
    }

    // Update the business with the modified categories array
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ custom_expense_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)
    
    const updatedCategory = updatedCategories[categoryIndex]

    if (updateError) {
      console.error('[Categories API] Error updating category:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedCategory
    })

  } catch (error) {
    console.error('[Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete existing category
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
    const supabase = await createBusinessContextSupabaseClient()
    
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
        { success: false, error: 'Insufficient permissions to delete categories' },
        { status: 403 }
      )
    }

    // Get existing categories
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', employeeProfile.business_id)
      .single()

    const existingCategories = businessData?.custom_expense_categories || []
    const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === body.id)
    
    if (categoryIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Category not found' },
        { status: 404 }
      )
    }

    // Remove the category from the array
    const updatedCategories = existingCategories.filter((cat: any) => cat.id !== body.id)

    // Update the business with the filtered categories array
    const { error: deleteError } = await supabase
      .from('businesses')
      .update({ custom_expense_categories: updatedCategories })
      .eq('id', employeeProfile.business_id)

    if (deleteError) {
      console.error('[Categories API] Error deleting category:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { deleted_id: body.id }
    })

  } catch (error) {
    console.error('[Categories API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}