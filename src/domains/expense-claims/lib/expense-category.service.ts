/**
 * Expense Category Service Layer
 * Business logic for managing custom expense categories
 * Extracted from /api/v1/expense-claims/categories
 */

import { auth } from '@clerk/nextjs/server'
import { createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'

export interface CustomExpenseCategory {
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

export interface EnabledCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
}

/**
 * Get all categories for the business (including inactive for management)
 */
export async function getAllCategories() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const supabase = await createBusinessContextSupabaseClient()
  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  // Get categories from the business JSONB column
  const { data: businessData, error: categoriesError } = await supabase
    .from('businesses')
    .select('custom_expense_categories')
    .eq('id', employeeProfile.business_id)
    .single()

  if (categoriesError) {
    console.error('[Categories Service] Error fetching categories:', categoriesError)
    throw new Error('Failed to fetch categories')
  }

  // Extract categories from JSONB column and sort (include inactive categories for management)
  const categories = (businessData?.custom_expense_categories || [])
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

  return {
    categories,
    can_manage: employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
  }
}

/**
 * Get only enabled categories for dropdowns and categorization
 */
export async function getEnabledCategories(): Promise<EnabledCategory[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const supabase = await createBusinessContextSupabaseClient()
  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  console.log(`[Categories Service] Fetching categories for business: ${employeeProfile.business_id}`)

  // Get categories from the business JSONB column
  const { data: businessData, error: categoriesError } = await supabase
    .from('businesses')
    .select('custom_expense_categories')
    .eq('id', employeeProfile.business_id)
    .single()

  if (categoriesError) {
    console.error('[Categories Service] Error fetching categories:', categoriesError)
    throw new Error('Failed to fetch categories')
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

  console.log(`[Categories Service] Found ${enabledCategories.length} enabled categories`)

  return enabledCategories
}

/**
 * Create a new expense category
 */
export async function createCategory(body: CustomExpenseCategory) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const supabase = await createBusinessContextSupabaseClient()
  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  // Check if user has management permissions
  const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
  if (!canManage) {
    throw new Error('Insufficient permissions to create categories')
  }

  // Validate required fields
  if (!body.category_name || !body.category_code) {
    throw new Error('Category name and code are required')
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
    throw new Error('Category code already exists')
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
    console.error('[Categories Service] Error creating category:', createError)
    throw new Error('Failed to create category')
  }

  return newCategory
}

/**
 * Update an existing expense category
 */
export async function updateCategory(body: CustomExpenseCategory & { id: string }) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const supabase = await createBusinessContextSupabaseClient()

  if (!body.id) {
    throw new Error('Category ID is required for updates')
  }

  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  // Check if user has management permissions
  const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
  if (!canManage) {
    throw new Error('Insufficient permissions to update categories')
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
    throw new Error('Category not found')
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
    console.error('[Categories Service] Error updating category:', updateError)
    throw new Error('Failed to update category')
  }

  return updatedCategory
}

/**
 * Delete an expense category
 */
export async function deleteCategory(categoryId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const supabase = await createBusinessContextSupabaseClient()

  if (!categoryId) {
    throw new Error('Category ID is required for deletion')
  }

  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  // Check if user has management permissions
  const canManage = employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
  if (!canManage) {
    throw new Error('Insufficient permissions to delete categories')
  }

  // Get existing categories
  const { data: businessData } = await supabase
    .from('businesses')
    .select('custom_expense_categories')
    .eq('id', employeeProfile.business_id)
    .single()

  const existingCategories = businessData?.custom_expense_categories || []
  const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === categoryId)

  if (categoryIndex === -1) {
    throw new Error('Category not found')
  }

  // Remove the category from the array
  const updatedCategories = existingCategories.filter((cat: any) => cat.id !== categoryId)

  // Update the business with the filtered categories array
  const { error: deleteError } = await supabase
    .from('businesses')
    .update({ custom_expense_categories: updatedCategories })
    .eq('id', employeeProfile.business_id)

  if (deleteError) {
    console.error('[Categories Service] Error deleting category:', deleteError)
    throw new Error('Failed to delete category')
  }

  return { deleted_id: categoryId }
}
