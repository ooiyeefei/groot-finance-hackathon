/**
 * Custom hook for fetching dynamic expense categories
 * Replaces hardcoded EXPENSE_CATEGORY_CONFIG with admin-configured categories
 * Supports multi-language category names via locale parameter
 */

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'

export interface DynamicExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  vendor_patterns?: string[]
  ai_keywords?: string[]
  translations?: {
    [locale: string]: {
      category_name: string
      description?: string
    }
  }
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
  const locale = useLocale()

  const fetchCategories = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      // Include locale parameter and enabled filter for active categories only
      const url = new URL('/api/expense-categories', window.location.origin)
      url.searchParams.set('enabled', 'true')
      url.searchParams.set('locale', locale)

      const response = await fetch(url.toString(), {
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

      setCategories(result.data?.categories || [])
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
  }, [locale]) // Re-fetch when locale changes

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