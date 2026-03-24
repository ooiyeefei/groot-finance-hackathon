/**
 * ROI Calculator — Configurable Assumptions
 *
 * Time-savings assumptions and input constraints only.
 * Pricing data comes from Stripe catalog via server-side props.
 */

/** Minutes saved per document type (manual process vs Groot automation) */
export const MINUTES_PER_PURCHASE_INVOICE = 8
export const MINUTES_PER_SALES_INVOICE = 6
export const MINUTES_PER_EXPENSE_RECEIPT = 4

/** Standard working hours per month (22 days × 8 hours) */
export const WORKING_HOURS_PER_MONTH = 176

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

/**
 * Plan data passed from server-side Stripe catalog fetch.
 * Contains only what the ROI calculator needs.
 */
export interface ROIPlanData {
  name: string
  teamLimit: number // -1 for unlimited
  ocrLimit: number
  aiMessageLimit: number
  invoiceLimit: number
  einvoiceLimit: number
  currencyOptions: Record<string, number> // lowercase currency → display amount
  price: number // default currency price
  currency: string // default currency code
  features: string[] // full feature list from Stripe metadata
  highlightFeatures: string[] // curated highlights for display
}

export type ROIPlanMap = {
  starter: ROIPlanData
  pro: ROIPlanData
  enterprise: ROIPlanData
}
