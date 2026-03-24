import {
  MINUTES_PER_PURCHASE_INVOICE,
  MINUTES_PER_SALES_INVOICE,
  MINUTES_PER_EXPENSE_RECEIPT,
  WORKING_HOURS_PER_MONTH,
  type SupportedCurrency,
  type ROIPlanData,
  type ROIPlanMap,
} from './constants'

export interface CalculationInput {
  purchaseInvoices: number
  salesInvoices: number
  expenseReceipts: number
  financeStaff: number
  monthlySalary: number
  currency: SupportedCurrency
}

export interface CalculationResult {
  hoursSavedPerMonth: number
  monthlyCostSavings: number
  annualCostSavings: number
  paybackPeriodMonths: number
  timeSpentPercent: number
  hourlyRate: number
  hasResults: boolean
  /** Groot monthly price for the selected plan tier */
  grootPrice: number
  /** Name of the selected plan tier */
  planName: string
  /** Quotas from the selected plan */
  planQuotas: {
    ocrLimit: number
    aiMessageLimit: number
    invoiceLimit: number
    einvoiceLimit: number
    teamLimit: number
  }
  /** Full feature list from the selected plan */
  planFeatures: string[]
  /** Curated highlight features for compact display */
  planHighlightFeatures: string[]
}

/**
 * Pick the right plan based on team member count.
 */
function getPlanForTeamSize(teamSize: number, plans: ROIPlanMap): ROIPlanData & { key: string } {
  if (teamSize <= plans.starter.teamLimit) {
    return { ...plans.starter, key: 'starter' }
  }
  if (plans.pro.teamLimit === -1 || teamSize <= plans.pro.teamLimit) {
    return { ...plans.pro, key: 'pro' }
  }
  return { ...plans.enterprise, key: 'enterprise' }
}

/**
 * Resolve price for a currency from plan's currencyOptions.
 */
function resolvePlanPrice(plan: ROIPlanData, currency: string): number {
  const lower = currency.toLowerCase()
  return plan.currencyOptions[lower] ?? plan.price
}

/**
 * Calculate ROI metrics from prospect inputs.
 * Pure function — no side effects, no network calls.
 * Plans data comes from Stripe catalog (fetched server-side).
 */
export function calculateROI(input: CalculationInput, plans: ROIPlanMap): CalculationResult {
  const {
    purchaseInvoices,
    salesInvoices,
    expenseReceipts,
    financeStaff,
    monthlySalary,
    currency,
  } = input

  const totalMinutesSaved =
    purchaseInvoices * MINUTES_PER_PURCHASE_INVOICE +
    salesInvoices * MINUTES_PER_SALES_INVOICE +
    expenseReceipts * MINUTES_PER_EXPENSE_RECEIPT

  const hoursSavedPerMonth = totalMinutesSaved / 60
  const hourlyRate = monthlySalary / WORKING_HOURS_PER_MONTH
  const monthlyCostSavings = hoursSavedPerMonth * hourlyRate
  const annualCostSavings = monthlyCostSavings * 12

  const plan = getPlanForTeamSize(financeStaff, plans)
  const grootPrice = resolvePlanPrice(plan, currency)
  const paybackPeriodMonths =
    monthlyCostSavings > 0
      ? Math.round((grootPrice / monthlyCostSavings) * 10) / 10
      : 0

  const totalTeamHours = financeStaff * WORKING_HOURS_PER_MONTH
  const timeSpentPercent =
    totalTeamHours > 0
      ? Math.round((hoursSavedPerMonth / totalTeamHours) * 1000) / 10
      : 0

  const hasResults =
    (purchaseInvoices > 0 || salesInvoices > 0 || expenseReceipts > 0) &&
    monthlySalary > 0

  return {
    hoursSavedPerMonth: Math.round(hoursSavedPerMonth * 10) / 10,
    monthlyCostSavings: Math.round(monthlyCostSavings * 100) / 100,
    annualCostSavings: Math.round(annualCostSavings * 100) / 100,
    paybackPeriodMonths,
    timeSpentPercent,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    hasResults,
    grootPrice,
    planName: plan.name,
    planQuotas: {
      ocrLimit: plan.ocrLimit,
      aiMessageLimit: plan.aiMessageLimit,
      invoiceLimit: plan.invoiceLimit,
      einvoiceLimit: plan.einvoiceLimit,
      teamLimit: plan.teamLimit,
    },
    planFeatures: plan.features,
    planHighlightFeatures: plan.highlightFeatures,
  }
}
