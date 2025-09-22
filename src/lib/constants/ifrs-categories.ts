/**
 * IFRS Accounting Categories Constants
 * Single source of truth for all IFRS accounting categories used across the application
 * Used by: CategorySelector UI, DSPy processing, expense categorization
 */

export interface IFRSCategory {
  category_code: string
  category_name: string
  group: string
}

export interface CategoryOption {
  value: string
  label: string
  group: string
}

// Core IFRS accounting categories for DSPy processing and categorization
export const IFRS_CATEGORIES: IFRSCategory[] = [
  // Direct Expenses
  { category_code: "cost_of_goods_sold", category_name: "Cost of Goods Sold", group: "Direct Expenses" },

  // Operating Expenses
  { category_code: "administrative_expenses", category_name: "Administrative Expenses", group: "Operating Expenses" },
  { category_code: "marketing_advertising", category_name: "Marketing & Advertising", group: "Operating Expenses" },
  { category_code: "travel_entertainment", category_name: "Travel & Entertainment", group: "Operating Expenses" },
  { category_code: "utilities_communications", category_name: "Utilities & Communications", group: "Operating Expenses" },
  { category_code: "rent_facilities", category_name: "Rent & Facilities", group: "Operating Expenses" },
  { category_code: "insurance", category_name: "Insurance", group: "Operating Expenses" },
  { category_code: "taxes_licenses", category_name: "Taxes & Licenses", group: "Operating Expenses" },
  { category_code: "software_subscriptions", category_name: "Software & Subscriptions", group: "Operating Expenses" },
  { category_code: "professional_services", category_name: "Professional Services", group: "Operating Expenses" },
  { category_code: "other_operating", category_name: "Other Operating Expenses", group: "Operating Expenses" },

  // Non-Operating Expenses
  { category_code: "depreciation", category_name: "Depreciation", group: "Non-Operating Expenses" },
  { category_code: "interest_expense", category_name: "Interest Expense", group: "Non-Operating Expenses" },
]

// Convert IFRS categories to CategorySelector format
export const IFRS_CATEGORY_OPTIONS: CategoryOption[] = IFRS_CATEGORIES.map(category => ({
  value: category.category_code,
  label: category.category_name,
  group: category.group
}))

// For DSPy processing - simplified format
export const IFRS_CATEGORIES_FOR_DSPY = IFRS_CATEGORIES.map(category => ({
  category_code: category.category_code,
  category_name: category.category_name
}))

// Income categories (kept separate as they're not IFRS expense categories)
export const INCOME_CATEGORIES: CategoryOption[] = [
  { value: 'operating_revenue', label: 'Operating Revenue', group: 'Income' },
  { value: 'other_income', label: 'Other Income', group: 'Income' },
  { value: 'investment_income', label: 'Investment Income', group: 'Income' },
  { value: 'government_grants', label: 'Government Grants', group: 'Income' },
]

// Complete category list for CategorySelector (Income + IFRS categories only)
// Legacy categories removed as they're covered by existing IFRS categories:
// - "General Expenses" → "administrative_expenses" or "other_operating"
// - "General Income" → "other_income"
// - "Other" → "other_operating"
export const COMPLETE_CATEGORY_OPTIONS: CategoryOption[] = [
  ...INCOME_CATEGORIES,
  ...IFRS_CATEGORY_OPTIONS
]