/**
 * Expense Category Mapping System
 * Maps business-specific expense categories to standard accounting categories
 * Based on Otto financial consultant's IFRS compliance recommendations
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

// Standard IFRS accounting categories for transactions table
export const ACCOUNTING_CATEGORIES = {
  // Operating Expenses
  TRAVEL_EXPENSES: 'travel_expenses',
  PROFESSIONAL_SERVICES: 'professional_services',
  MARKETING_ADVERTISING: 'marketing_advertising',
  UTILITIES: 'utilities',
  OFFICE_SUPPLIES: 'office_supplies',
  MAINTENANCE_REPAIRS: 'maintenance_repairs',
  TRAINING_DEVELOPMENT: 'training_development',
  ENTERTAINMENT_MEALS: 'entertainment_meals',
  VEHICLE_TRANSPORT: 'vehicle_transport',

  // Other Categories
  MISCELLANEOUS: 'miscellaneous_expenses',
  OTHER_OPERATING: 'other_operating'
} as const

// Business expense category to accounting category mapping
// Based on common Southeast Asian SME expense patterns
const CATEGORY_MAPPING: Record<string, string> = {
  // Travel related
  'travel': ACCOUNTING_CATEGORIES.TRAVEL_EXPENSES,
  'travel_accommodation': ACCOUNTING_CATEGORIES.TRAVEL_EXPENSES,
  'TRAVEL': ACCOUNTING_CATEGORIES.TRAVEL_EXPENSES,

  // Transportation & Vehicle
  'petrol': ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT,
  'petrol_transport': ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT,
  'toll': ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT,
  'parking': ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT,
  'vehicle': ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT,

  // Entertainment & Meals
  'entertainment': ACCOUNTING_CATEGORIES.ENTERTAINMENT_MEALS,
  'entertainment_meals': ACCOUNTING_CATEGORIES.ENTERTAINMENT_MEALS,
  'meals': ACCOUNTING_CATEGORIES.ENTERTAINMENT_MEALS,
  'food': ACCOUNTING_CATEGORIES.ENTERTAINMENT_MEALS,

  // Office & Supplies
  'office_supplies': ACCOUNTING_CATEGORIES.OFFICE_SUPPLIES,
  'supplies': ACCOUNTING_CATEGORIES.OFFICE_SUPPLIES,
  'stationery': ACCOUNTING_CATEGORIES.OFFICE_SUPPLIES,
  'equipment': ACCOUNTING_CATEGORIES.OFFICE_SUPPLIES,

  // Utilities & Communications
  'utilities': ACCOUNTING_CATEGORIES.UTILITIES,
  'utilities_comms': ACCOUNTING_CATEGORIES.UTILITIES,
  'internet': ACCOUNTING_CATEGORIES.UTILITIES,
  'phone': ACCOUNTING_CATEGORIES.UTILITIES,
  'communications': ACCOUNTING_CATEGORIES.UTILITIES,

  // Marketing & Advertising
  'marketing': ACCOUNTING_CATEGORIES.MARKETING_ADVERTISING,
  'marketing_advertising': ACCOUNTING_CATEGORIES.MARKETING_ADVERTISING,
  'advertising': ACCOUNTING_CATEGORIES.MARKETING_ADVERTISING,

  // Training & Development
  'training': ACCOUNTING_CATEGORIES.TRAINING_DEVELOPMENT,
  'training_development': ACCOUNTING_CATEGORIES.TRAINING_DEVELOPMENT,
  'education': ACCOUNTING_CATEGORIES.TRAINING_DEVELOPMENT,
  'certification': ACCOUNTING_CATEGORIES.TRAINING_DEVELOPMENT,

  // Maintenance & Repairs
  'maintenance': ACCOUNTING_CATEGORIES.MAINTENANCE_REPAIRS,
  'maintenance_repairs': ACCOUNTING_CATEGORIES.MAINTENANCE_REPAIRS,
  'repairs': ACCOUNTING_CATEGORIES.MAINTENANCE_REPAIRS,
  'cleaning': ACCOUNTING_CATEGORIES.MAINTENANCE_REPAIRS,

  // Professional Services
  'professional': ACCOUNTING_CATEGORIES.PROFESSIONAL_SERVICES,
  'consulting': ACCOUNTING_CATEGORIES.PROFESSIONAL_SERVICES,
  'legal': ACCOUNTING_CATEGORIES.PROFESSIONAL_SERVICES,
  'accounting': ACCOUNTING_CATEGORIES.PROFESSIONAL_SERVICES,

  // Fallback categories
  'other': ACCOUNTING_CATEGORIES.MISCELLANEOUS,
  'other_business': ACCOUNTING_CATEGORIES.MISCELLANEOUS,
  'miscellaneous': ACCOUNTING_CATEGORIES.MISCELLANEOUS,
  'general': ACCOUNTING_CATEGORIES.OTHER_OPERATING
}

export interface ExpenseCategoryInfo {
  business_category_id: string
  business_category_name: string
  accounting_category: string
  description?: string
  requires_receipt?: boolean
  requires_manager_approval?: boolean
}

/**
 * Maps business expense category to standard accounting category
 * Follows Otto's hierarchical mapping approach
 */
export function mapExpenseCategoryToAccounting(
  businessCategoryCode: string
): string {
  // Direct mapping lookup
  const directMapping = CATEGORY_MAPPING[businessCategoryCode.toLowerCase()]
  if (directMapping) {
    return directMapping
  }

  // Fallback pattern matching for edge cases
  const lowerCode = businessCategoryCode.toLowerCase()

  if (lowerCode.includes('travel') || lowerCode.includes('flight') || lowerCode.includes('hotel')) {
    return ACCOUNTING_CATEGORIES.TRAVEL_EXPENSES
  }

  if (lowerCode.includes('petrol') || lowerCode.includes('fuel') || lowerCode.includes('transport')) {
    return ACCOUNTING_CATEGORIES.VEHICLE_TRANSPORT
  }

  if (lowerCode.includes('food') || lowerCode.includes('meal') || lowerCode.includes('restaurant')) {
    return ACCOUNTING_CATEGORIES.ENTERTAINMENT_MEALS
  }

  if (lowerCode.includes('office') || lowerCode.includes('supplies') || lowerCode.includes('equipment')) {
    return ACCOUNTING_CATEGORIES.OFFICE_SUPPLIES
  }

  if (lowerCode.includes('marketing') || lowerCode.includes('advertising') || lowerCode.includes('promotion')) {
    return ACCOUNTING_CATEGORIES.MARKETING_ADVERTISING
  }

  if (lowerCode.includes('training') || lowerCode.includes('education') || lowerCode.includes('course')) {
    return ACCOUNTING_CATEGORIES.TRAINING_DEVELOPMENT
  }

  // Default fallback to other operating expenses
  return ACCOUNTING_CATEGORIES.OTHER_OPERATING
}

/**
 * Gets business expense category details by ID
 * Used for validation and enriched transaction data
 * Uses Convex to fetch business categories
 */
export async function getBusinessExpenseCategory(
  businessId: string,
  categoryId: string
): Promise<ExpenseCategoryInfo | null> {
  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Category Mapper] Failed to get authenticated Convex client')
      return null
    }

    // Use the Convex query to get enabled expense categories
    const categories = await client.query(api.functions.businesses.getEnabledExpenseCategories, {
      businessId
    })

    if (!categories || categories.length === 0) {
      return null
    }

    // Find the specific category by id
    const category = categories.find((cat: {
      id: string
      category_name: string
      description?: string
      requires_receipt?: boolean
      requires_manager_approval?: boolean
    }) => cat.id === categoryId)

    if (!category) {
      return null
    }

    // Use category_name for accounting category mapping (fallback pattern matching)
    const accountingCategory = mapExpenseCategoryToAccounting(category.category_name)

    return {
      business_category_id: category.id,
      business_category_name: category.category_name,
      accounting_category: accountingCategory,
      description: category.description,
      requires_receipt: category.requires_receipt,
      requires_manager_approval: category.requires_manager_approval
    }

  } catch (error) {
    console.error('[Category Mapper] Unexpected error:', error)
    return null
  }
}

/**
 * Gets all valid business expense categories for a business
 * Used for dropdown selections and AI categorization
 * Uses Convex to fetch business categories
 */
export async function getBusinessExpenseCategories(
  businessId: string
): Promise<ExpenseCategoryInfo[]> {
  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Category Mapper] Failed to get authenticated Convex client')
      return []
    }

    // Use the Convex query to get enabled expense categories (already sorted)
    const categories = await client.query(api.functions.businesses.getEnabledExpenseCategories, {
      businessId
    })

    if (!categories || categories.length === 0) {
      return []
    }

    // Transform to ExpenseCategoryInfo format
    return categories.map((category: {
      id: string
      category_name: string
      description?: string
      requires_receipt?: boolean
      requires_manager_approval?: boolean
    }) => ({
      business_category_id: category.id,
      business_category_name: category.category_name,
      accounting_category: mapExpenseCategoryToAccounting(category.category_name),
      description: category.description,
      requires_receipt: category.requires_receipt,
      requires_manager_approval: category.requires_manager_approval
    }))

  } catch (error) {
    console.error('[Category Mapper] Unexpected error:', error)
    return []
  }
}

/**
 * Validates if a category id exists and is active for a business
 */
export async function isValidExpenseCategory(
  businessId: string,
  categoryId: string
): Promise<boolean> {
  const category = await getBusinessExpenseCategory(businessId, categoryId)
  return category !== null
}