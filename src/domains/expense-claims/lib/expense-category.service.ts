/**
 * Expense Category Service Layer
 * Business logic for managing custom expense categories
 * Extracted from /api/v1/expense-claims/categories
 *
 * Migrated to Convex from Supabase
 */

import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'

export interface CustomExpenseCategory {
  id?: string
  category_name: string
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
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
}

/**
 * Get all categories for the business (including inactive for management)
 * Uses Convex to fetch categories
 */
export async function getAllCategories() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  // Get ALL categories (including inactive) from Convex
  const categories = await client.query(api.functions.businesses.getExpenseCategories, {
    businessId: employeeProfile.business_id
  })

  // Sort by sort_order (Convex may not return sorted)
  const sortedCategories = [...(categories || [])]
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

  return {
    categories: sortedCategories,
    can_manage: employeeProfile.role_permissions?.manager || employeeProfile.role_permissions?.admin
  }
}

/**
 * Get only enabled categories for dropdowns and categorization
 * Uses Convex to fetch categories
 */
export async function getEnabledCategories(): Promise<EnabledCategory[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  const employeeProfile = await ensureUserProfile(userId)

  if (!employeeProfile) {
    throw new Error('Failed to create employee profile')
  }

  console.log(`[Categories Service] Fetching categories for business: ${employeeProfile.business_id}`)

  // Get enabled categories from Convex (already filtered and sorted)
  const categories = await client.query(api.functions.businesses.getEnabledExpenseCategories, {
    businessId: employeeProfile.business_id
  })

  // Transform to EnabledCategory format
  const enabledCategories = (categories || []).map((category: any) => ({
    id: category.id,
    category_name: category.category_name,
    description: category.description,
    vendor_patterns: category.vendor_patterns || [],
    ai_keywords: category.ai_keywords || []
  }))

  console.log(`[Categories Service] Found ${enabledCategories.length} enabled categories`)

  return enabledCategories
}

/**
 * Create a new expense category
 * Uses Convex mutation
 */
export async function createCategory(body: CustomExpenseCategory) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

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
  if (!body.category_name) {
    throw new Error('Category name is required')
  }

  // Create category using Convex mutation
  // Note: Convex handles duplicate checking internally
  const newCategory = await client.mutation(api.functions.businesses.createExpenseCategory, {
    businessId: employeeProfile.business_id,
    category_name: body.category_name,
    description: body.description,
    ai_keywords: body.ai_keywords,
    vendor_patterns: body.vendor_patterns,
    requires_receipt: body.requires_receipt,
    requires_manager_approval: body.requires_manager_approval ?? true,
    sort_order: body.sort_order
  })

  return newCategory
}

/**
 * Update an existing expense category
 * Uses Convex mutation
 */
export async function updateCategory(body: CustomExpenseCategory & { id: string }) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

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

  // Update category using Convex mutation
  const updatedCategory = await client.mutation(api.functions.businesses.updateExpenseCategory, {
    businessId: employeeProfile.business_id,
    categoryId: body.id,
    category_name: body.category_name,
    description: body.description,
    ai_keywords: body.ai_keywords,
    vendor_patterns: body.vendor_patterns,
    requires_receipt: body.requires_receipt,
    requires_manager_approval: body.requires_manager_approval,
    sort_order: body.sort_order,
    is_active: body.is_active
  })

  return updatedCategory
}

/**
 * Delete an expense category
 * Uses Convex mutation
 */
export async function deleteCategory(categoryId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

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

  // Delete category using Convex mutation
  await client.mutation(api.functions.businesses.deleteExpenseCategory, {
    businessId: employeeProfile.business_id,
    categoryId
  })

  return { deleted_id: categoryId }
}
