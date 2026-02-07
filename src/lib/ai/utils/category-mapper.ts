/**
 * Category Mapper
 *
 * Maps natural language category terms to IFRS category IDs.
 * Static mapping of ~40 common NL terms to system categories.
 *
 * Uses the IFRS categories defined in src/lib/constants/ifrs-categories.ts
 */

export interface CategoryMatch {
  categoryId: string
  categoryName: string
  confidence: 'exact' | 'partial'
}

/**
 * Static mapping of natural language terms to IFRS category IDs.
 * Format: { nlTerm: { categoryId, categoryName } }
 */
const CATEGORY_MAPPINGS: Record<string, { categoryId: string; categoryName: string }> = {
  // Travel & Entertainment
  'travel': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'entertainment': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'meals': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'food': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'dining': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'coffee': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'lunch': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'dinner': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'breakfast': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'hotel': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'flight': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'flights': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'airfare': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'accommodation': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'taxi': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'transport': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'transportation': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'grab': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },
  'uber': { categoryId: 'travel_entertainment', categoryName: 'Travel & Entertainment' },

  // Administrative Expenses
  'office supplies': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'office': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'supplies': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'stationery': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'admin': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'administrative': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },
  'printing': { categoryId: 'administrative_expenses', categoryName: 'Administrative Expenses' },

  // Employee Benefits
  'benefits': { categoryId: 'employee_benefits', categoryName: 'Employee Benefits' },
  'employee benefits': { categoryId: 'employee_benefits', categoryName: 'Employee Benefits' },
  'insurance': { categoryId: 'employee_benefits', categoryName: 'Employee Benefits' },
  'medical': { categoryId: 'employee_benefits', categoryName: 'Employee Benefits' },
  'healthcare': { categoryId: 'employee_benefits', categoryName: 'Employee Benefits' },

  // Professional Fees
  'consulting': { categoryId: 'professional_fees', categoryName: 'Professional Fees' },
  'professional': { categoryId: 'professional_fees', categoryName: 'Professional Fees' },
  'legal': { categoryId: 'professional_fees', categoryName: 'Professional Fees' },
  'audit': { categoryId: 'professional_fees', categoryName: 'Professional Fees' },
  'accounting': { categoryId: 'professional_fees', categoryName: 'Professional Fees' },

  // Marketing
  'marketing': { categoryId: 'marketing_expenses', categoryName: 'Marketing Expenses' },
  'advertising': { categoryId: 'marketing_expenses', categoryName: 'Marketing Expenses' },
  'promotion': { categoryId: 'marketing_expenses', categoryName: 'Marketing Expenses' },

  // Technology
  'software': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },
  'technology': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },
  'tech': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },
  'saas': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },
  'subscriptions': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },
  'cloud': { categoryId: 'technology_expenses', categoryName: 'Technology Expenses' },

  // Rent & Utilities
  'rent': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'utilities': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'electricity': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'water': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'internet': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'phone': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },
  'telephone': { categoryId: 'rent_utilities', categoryName: 'Rent & Utilities' },

  // Cost of Goods Sold
  'cogs': { categoryId: 'cost_of_goods_sold', categoryName: 'Cost of Goods Sold' },
  'cost of goods': { categoryId: 'cost_of_goods_sold', categoryName: 'Cost of Goods Sold' },
  'raw materials': { categoryId: 'cost_of_goods_sold', categoryName: 'Cost of Goods Sold' },
  'inventory': { categoryId: 'cost_of_goods_sold', categoryName: 'Cost of Goods Sold' },

  // Revenue
  'revenue': { categoryId: 'revenue', categoryName: 'Revenue' },
  'sales': { categoryId: 'revenue', categoryName: 'Revenue' },
  'income': { categoryId: 'revenue', categoryName: 'Revenue' },

  // Depreciation
  'depreciation': { categoryId: 'depreciation_amortization', categoryName: 'Depreciation & Amortization' },
  'amortization': { categoryId: 'depreciation_amortization', categoryName: 'Depreciation & Amortization' },
}

/**
 * Map a natural language category term to an IFRS category ID.
 *
 * @param term - Natural language term (e.g., "meals", "travel", "office supplies")
 * @returns CategoryMatch or null if no match found
 */
export function mapCategoryTerm(term: string): CategoryMatch | null {
  const normalized = term.trim().toLowerCase()

  // 1. Exact match
  const exact = CATEGORY_MAPPINGS[normalized]
  if (exact) {
    return { categoryId: exact.categoryId, categoryName: exact.categoryName, confidence: 'exact' }
  }

  // 2. Partial match - check if the term contains any known keyword
  for (const [keyword, mapping] of Object.entries(CATEGORY_MAPPINGS)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      return { categoryId: mapping.categoryId, categoryName: mapping.categoryName, confidence: 'partial' }
    }
  }

  // 3. No match - the term might be an IFRS category ID already
  const allCategoryIds = new Set(Object.values(CATEGORY_MAPPINGS).map(m => m.categoryId))
  if (allCategoryIds.has(normalized)) {
    const match = Object.values(CATEGORY_MAPPINGS).find(m => m.categoryId === normalized)!
    return { categoryId: match.categoryId, categoryName: match.categoryName, confidence: 'exact' }
  }

  return null
}
