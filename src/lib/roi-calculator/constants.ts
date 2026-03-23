/**
 * ROI Calculator — Configurable Assumptions
 *
 * These values drive the ROI calculation. Update them here when
 * Groot Finance's pricing or productivity benchmarks change.
 * No code changes needed beyond this file.
 */

/** Minutes saved per document type (manual process vs Groot automation) */
export const MINUTES_PER_PURCHASE_INVOICE = 8
export const MINUTES_PER_SALES_INVOICE = 6
export const MINUTES_PER_EXPENSE_RECEIPT = 4

/** Standard working hours per month (22 days × 8 hours) */
export const WORKING_HOURS_PER_MONTH = 176

/** Groot Finance monthly subscription price (USD equivalent for payback calc) */
export const GROOT_MONTHLY_PRICE_USD = 49

/** Currency-specific Groot pricing for payback calculation */
export const GROOT_MONTHLY_PRICE: Record<string, number> = {
  MYR: 199,
  SGD: 59,
  USD: 49,
}

/** Supported currencies with their default display order */
export const SUPPORTED_CURRENCIES = ['MYR', 'SGD', 'USD'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

/** Input field constraints */
export const INPUT_LIMITS = {
  minDocuments: 0,
  maxDocuments: 10_000,
  minStaff: 1,
  maxStaff: 100,
  minSalary: 0,
  maxSalary: 100_000,
} as const
