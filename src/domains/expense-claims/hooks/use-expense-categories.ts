/**
 * Custom hook for fetching dynamic expense categories
 * Replaces hardcoded EXPENSE_CATEGORY_CONFIG with admin-configured categories
 */

import { useState, useEffect } from 'react'

export interface DynamicExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
}

interface UseExpenseCategoriesReturn {
  categories: DynamicExpenseCategory[]
  loading: boolean
  error: string | null
  refreshCategories: () => Promise<void>
}

export function useExpenseCategories(): UseExpenseCategoriesReturn {
  const [categories, setCategories] = useState<DynamicExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/v1/expense-claims/categories/enabled', {
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

      setCategories(result.data || [])
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
    value: category.category_code,
    label: category.category_name,
    description: category.description
  }))
}

/**
 * Utility function to find category by code
 */
export function findCategoryByCode(categories: DynamicExpenseCategory[], code: string): DynamicExpenseCategory | undefined {
  return categories.find(cat => cat.category_code === code)
}