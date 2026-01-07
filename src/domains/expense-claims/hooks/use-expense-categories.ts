/**
 * Custom hook for fetching dynamic expense categories
 * Replaces hardcoded EXPENSE_CATEGORY_CONFIG with admin-configured categories
 */

import { useState, useEffect } from 'react'

export interface DynamicExpenseCategory {
  id: string
  category_name: string
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
  is_active?: boolean // Add is_active field to track disabled categories
}

interface UseExpenseCategoriesOptions {
  includeDisabled?: boolean // Option to fetch all categories including disabled ones
}

interface UseExpenseCategoriesReturn {
  categories: DynamicExpenseCategory[]
  loading: boolean
  error: string | null
  refreshCategories: () => Promise<void>
}

export function useExpenseCategories(options: UseExpenseCategoriesOptions = {}): UseExpenseCategoriesReturn {
  const { includeDisabled = false } = options
  const [categories, setCategories] = useState<DynamicExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      // Choose API endpoint based on includeDisabled option
      const endpoint = includeDisabled
        ? '/api/v1/expense-claims/categories' // Fetch all categories (enabled + disabled)
        : '/api/v1/expense-claims/categories/enabled' // Fetch only enabled categories

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch expense categories')
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch expense categories')
      }

      // Handle different response formats based on endpoint
      let categoriesData: DynamicExpenseCategory[] = []

      if (includeDisabled) {
        // /api/v1/expense-claims/categories returns { data: { categories: [...] } }
        categoriesData = result.data?.categories || []
      } else {
        // /api/v1/expense-claims/categories/enabled returns { data: [...] } directly
        categoriesData = result.data || []
      }

      setCategories(categoriesData)
    } catch (err) {
      console.error('Error fetching expense categories:', err)
      setError(err instanceof Error ? err.message : 'Failed to load categories')
      
      // Fallback to empty array on error
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const refreshCategories = async (): Promise<void> => {
    await fetchCategories()
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  return {
    categories,
    loading,
    error,
    refreshCategories
  }
}

/**
 * Utility function to format categories for Select dropdown
 * Provides consistent formatting across components
 */
export function formatCategoriesForSelect(categories: DynamicExpenseCategory[]) {
  return categories.map(category => ({
    value: category.id,
    label: category.category_name,
    description: category.description
  }))
}

/**
 * Utility function to find category by code
 */
export function findCategoryByCode(categories: DynamicExpenseCategory[], code: string): DynamicExpenseCategory | undefined {
  return categories.find(cat => cat.id === code)
}

/**
 * Utility function to check if a category is disabled
 */
export function isCategoryDisabled(category: DynamicExpenseCategory): boolean {
  return category.is_active === false
}

/**
 * Utility function to validate category selection and provide helpful error messages
 */
export function validateCategorySelection(
  selectedCategoryCode: string,
  categories: DynamicExpenseCategory[]
): { isValid: boolean; error?: string; warning?: string } {
  if (!selectedCategoryCode) {
    return { isValid: false, error: 'Category is required' }
  }

  const category = findCategoryByCode(categories, selectedCategoryCode)

  if (!category) {
    return {
      isValid: false,
      error: `Category "${selectedCategoryCode}" not found. Please select a valid category.`
    }
  }

  if (isCategoryDisabled(category)) {
    return {
      isValid: true, // Still valid for edit mode, but show warning
      warning: `Category "${category.category_name}" has been disabled by your admin. Consider updating to an active category.`
    }
  }

  return { isValid: true }
}