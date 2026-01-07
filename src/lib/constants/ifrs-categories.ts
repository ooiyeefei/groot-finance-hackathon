/**
 * IFRS Accounting Categories Constants
 * Single source of truth for all IFRS accounting categories used across the application
 * Used by: CategorySelector UI, AI processing, expense categorization
 */

export interface IFRSCategory {
  id: string
  category_name: string
  group: string
}

export interface CategoryOption {
  value: string
  label: string
  group: string
}

// Core IFRS accounting categories for AI processing and categorization
export const IFRS_CATEGORIES: IFRSCategory[] = [
  // Direct Expenses
  { id: "cost_of_goods_sold", category_name: "Cost of Goods Sold", group: "Direct Expenses" },

  // Operating Expenses
  { id: "administrative_expenses", category_name: "Administrative Expenses", group: "Operating Expenses" },
  { id: "marketing_advertising", category_name: "Marketing & Advertising", group: "Operating Expenses" },
  { id: "travel_entertainment", category_name: "Travel & Entertainment", group: "Operating Expenses" },
  { id: "utilities_communications", category_name: "Utilities & Communications", group: "Operating Expenses" },
  { id: "rent_facilities", category_name: "Rent & Facilities", group: "Operating Expenses" },
  { id: "insurance", category_name: "Insurance", group: "Operating Expenses" },
  { id: "taxes_licenses", category_name: "Taxes & Licenses", group: "Operating Expenses" },
  { id: "software_subscriptions", category_name: "Software & Subscriptions", group: "Operating Expenses" },
  { id: "professional_services", category_name: "Professional Services", group: "Operating Expenses" },
  { id: "other_operating", category_name: "Other Operating Expenses", group: "Operating Expenses" },

  // Non-Operating Expenses
  { id: "depreciation", category_name: "Depreciation", group: "Non-Operating Expenses" },
  { id: "interest_expense", category_name: "Interest Expense", group: "Non-Operating Expenses" },
]

// Convert IFRS categories to CategorySelector format
export const IFRS_CATEGORY_OPTIONS: CategoryOption[] = IFRS_CATEGORIES.map(category => ({
  value: category.id,
  label: category.category_name,
  group: category.group
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