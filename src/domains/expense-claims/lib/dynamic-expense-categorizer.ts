/**
 * Dynamic Expense Categorizer Service
 * Intelligent expense categorization using admin-configured categories with caching
 * Replaces the hardcoded ExpenseCategorizer with dynamic, database-driven categorization
 */

import { DynamicExpenseCategory } from '@/domains/expense-claims/hooks/use-expense-categories'

interface CategorySuggestion {
  category: string
  confidence: number
  reasoning: string
}

interface CategoryValidation {
  isValid: boolean
  warnings: string[]
}

/**
 * In-memory cache for categories to avoid repeated API calls
 */
class CategoryCache {
  private cache: Map<string, { categories: DynamicExpenseCategory[]; timestamp: number }> = new Map()
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  set(businessId: string, categories: DynamicExpenseCategory[]): void {
    this.cache.set(businessId, {
      categories,
      timestamp: Date.now()
    })
  }

  get(businessId: string): DynamicExpenseCategory[] | null {
    const cached = this.cache.get(businessId)
    if (!cached) return null

    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(businessId)
      return null
    }

    return cached.categories
  }

  clear(): void {
    this.cache.clear()
  }

  clearBusiness(businessId: string): void {
    this.cache.delete(businessId)
  }
}

/**
 * Dynamic Expense Categorizer with admin-configured categories
 */
export class DynamicExpenseCategorizer {
  private cache = new CategoryCache()

  /**
   * Fetch enabled categories for a business from API with caching
   */
  private async fetchCategories(businessId?: string): Promise<DynamicExpenseCategory[]> {
    // Check cache first
    if (businessId) {
      const cached = this.cache.get(businessId)
      if (cached) {
        return cached
      }
    }

    try {
      const response = await fetch('/api/v1/expense-claims/categories/enabled', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch categories')
      }

      const categories = result.data || []
      
      // Cache the result if we have a business ID
      if (businessId && categories.length > 0) {
        this.cache.set(businessId, categories)
      }

      return categories
    } catch (error) {
      console.error('Error fetching categories:', error)
      return []
    }
  }

  /**
   * Enhanced categorization using dynamic admin-configured categories
   */
  async categorizeExpense(
    vendorName: string,
    description: string,
    businessId?: string,
    fallbackToDefault: boolean = true
  ): Promise<CategorySuggestion> {
    const categories = await this.fetchCategories(businessId)

    if (!categories.length) {
      return {
        category: '',
        confidence: 0.1,
        reasoning: 'No categories available for categorization'
      }
    }

    const text = `${vendorName} ${description}`.toLowerCase()
    
    let bestMatch: CategorySuggestion = {
      category: '',
      confidence: 0.1,
      reasoning: 'No pattern matches found'
    }

    // Evaluate each category
    for (const category of categories) {
      let matchScore = 0
      const matchReasons: string[] = []

      // Check vendor patterns (if configured)
      if (category.vendor_patterns && category.vendor_patterns.length > 0) {
        for (const pattern of category.vendor_patterns) {
          if (text.includes(pattern.toLowerCase())) {
            matchScore += 0.4 // High weight for vendor patterns
            matchReasons.push(`vendor pattern: "${pattern}"`)
          }
        }
      }

      // Check AI keywords (if configured)
      if (category.ai_keywords && category.ai_keywords.length > 0) {
        for (const keyword of category.ai_keywords) {
          if (text.includes(keyword.toLowerCase())) {
            matchScore += 0.3 // Medium weight for AI keywords
            matchReasons.push(`keyword: "${keyword}"`)
          }
        }
      }

      // Update best match if this category scores higher
      if (matchScore > bestMatch.confidence) {
        bestMatch = {
          category: category.category_code,
          confidence: Math.min(matchScore, 0.95), // Cap confidence for pattern matching
          reasoning: matchReasons.length > 0 
            ? `Matched ${matchReasons.join(', ')}` 
            : 'Pattern match detected'
        }
      }
    }

    // Fallback to first available category if no good matches and fallback enabled
    if (bestMatch.confidence < 0.2 && fallbackToDefault && categories.length > 0) {
      return {
        category: categories[0].category_code,
        confidence: 0.15,
        reasoning: `Defaulted to "${categories[0].category_name}" - no clear pattern match`
      }
    }

    return bestMatch
  }

  /**
   * Batch categorize multiple expenses efficiently
   */
  async batchCategorizeExpenses(
    expenses: Array<{ vendorName: string; description: string }>,
    businessId?: string
  ): Promise<CategorySuggestion[]> {
    // Fetch categories once for all expenses
    const categories = await this.fetchCategories(businessId)

    if (!categories.length) {
      return expenses.map(() => ({
        category: '',
        confidence: 0.1,
        reasoning: 'No categories available for categorization'
      }))
    }

    // Process each expense with the same categories
    return Promise.all(
      expenses.map(expense => 
        this.categorizeExpenseWithCategories(
          expense.vendorName,
          expense.description,
          categories
        )
      )
    )
  }

  /**
   * Internal method to categorize with pre-loaded categories
   */
  private categorizeExpenseWithCategories(
    vendorName: string,
    description: string,
    categories: DynamicExpenseCategory[]
  ): CategorySuggestion {
    const text = `${vendorName} ${description}`.toLowerCase()
    
    let bestMatch: CategorySuggestion = {
      category: categories[0]?.category_code || '',
      confidence: 0.1,
      reasoning: 'No pattern matches found'
    }

    for (const category of categories) {
      let matchScore = 0
      const matchReasons: string[] = []

      // Check vendor patterns
      if (category.vendor_patterns) {
        for (const pattern of category.vendor_patterns) {
          if (text.includes(pattern.toLowerCase())) {
            matchScore += 0.4
            matchReasons.push(`vendor pattern: "${pattern}"`)
          }
        }
      }

      // Check AI keywords
      if (category.ai_keywords) {
        for (const keyword of category.ai_keywords) {
          if (text.includes(keyword.toLowerCase())) {
            matchScore += 0.3
            matchReasons.push(`keyword: "${keyword}"`)
          }
        }
      }

      if (matchScore > bestMatch.confidence) {
        bestMatch = {
          category: category.category_code,
          confidence: Math.min(matchScore, 0.95),
          reasoning: matchReasons.length > 0 
            ? `Matched ${matchReasons.join(', ')}` 
            : 'Pattern match detected'
        }
      }
    }

    return bestMatch
  }

  /**
   * Get available categories with their details
   */
  async getAvailableCategories(businessId?: string): Promise<DynamicExpenseCategory[]> {
    return await this.fetchCategories(businessId)
  }

  /**
   * Validate category against business rules
   */
  async validateCategory(
    categoryCode: string,
    amount: number,
    currency: string = 'SGD',
    businessId?: string
  ): Promise<CategoryValidation> {
    const categories = await this.fetchCategories(businessId)
    const category = categories.find(cat => cat.category_code === categoryCode)
    
    const warnings: string[] = []

    if (!category) {
      return {
        isValid: false,
        warnings: ['Category not found in business configuration']
      }
    }

    // Convert amount to SGD for validation (simplified)
    const sgdAmount = this.convertToSGD(amount, currency)

    // High-value transaction warnings
    if (sgdAmount > 500) {
      warnings.push('High-value expense may require additional documentation')
    }

    if (sgdAmount > 1000) {
      warnings.push('High-value expense requires manager approval')
    }

    return {
      isValid: true,
      warnings
    }
  }

  /**
   * Simple currency conversion for validation (rough estimates)
   */
  private convertToSGD(amount: number, currency: string): number {
    const exchangeRates: Record<string, number> = {
      SGD: 1.0,
      USD: 1.35,
      EUR: 1.45,
      MYR: 0.30,
      THB: 0.037,
      IDR: 0.000088,
      CNY: 0.19,
      VND: 0.000054,
      PHP: 0.024
    }

    return amount * (exchangeRates[currency] || 1.0)
  }

  /**
   * Clear cache for a specific business or all businesses
   */
  clearCache(businessId?: string): void {
    if (businessId) {
      this.cache.clearBusiness(businessId)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; businesses: string[] } {
    const businessIds: string[] = []
    
    // We can't easily extract business IDs from the private cache map
    // This would need to be enhanced if detailed cache monitoring is needed
    
    return {
      size: (this.cache as any).cache.size || 0,
      businesses: businessIds
    }
  }
}

/**
 * Singleton instance for application-wide use
 */
export const dynamicExpenseCategorizer = new DynamicExpenseCategorizer()

/**
 * Factory function for creating new instances (useful for testing)
 */
export function createDynamicExpenseCategorizer(): DynamicExpenseCategorizer {
  return new DynamicExpenseCategorizer()
}