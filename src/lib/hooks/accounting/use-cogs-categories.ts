/**
 * Custom hook for fetching dynamic COGS categories
 * Replaces hardcoded COGS categories with business-configured categories
 */

import { useState, useEffect } from 'react'

export interface DynamicCOGSCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  cost_type: 'direct' | 'indirect'
  vendor_patterns?: string[]
  ai_keywords?: string[]
}

interface UseCOGSCategoriesReturn {
  categories: DynamicCOGSCategory[]
  loading: boolean
  error: string | null
  refreshCategories: () => Promise<void>
}

export function useCOGSCategories(): UseCOGSCategoriesReturn {
  const [categories, setCategories] = useState<DynamicCOGSCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/v1/account-management/cogs-categories/enabled', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch COGS categories')
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch COGS categories')
      }

      setCategories(result.data || [])
    } catch (err) {
      console.error('Error fetching COGS categories:', err)
      setError(err instanceof Error ? err.message : 'Failed to load COGS categories')

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
 * Utility function to format COGS categories for Select dropdown
 * Provides consistent formatting across components
 */
export function formatCOGSCategoriesForSelect(categories: DynamicCOGSCategory[]) {
  return categories.map(category => ({
    value: category.category_code,
    label: category.category_name,
    description: category.description,
    cost_type: category.cost_type
  }))
}

/**
 * Utility function to find COGS category by code
 */
export function findCOGSCategoryByCode(categories: DynamicCOGSCategory[], code: string): DynamicCOGSCategory | undefined {
  return categories.find(cat => cat.category_code === code)
}