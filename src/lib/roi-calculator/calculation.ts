import {
  MINUTES_PER_PURCHASE_INVOICE,
  MINUTES_PER_SALES_INVOICE,
  MINUTES_PER_EXPENSE_RECEIPT,
  WORKING_HOURS_PER_MONTH,
  GROOT_MONTHLY_PRICE,
  type SupportedCurrency,
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
  /** Hours saved per month by automating with Groot */
  hoursSavedPerMonth: number
  /** Monthly cost savings in selected currency */
  monthlyCostSavings: number
  /** Annual cost savings in selected currency */
  annualCostSavings: number
  /** Months until Groot subscription pays for itself */
  paybackPeriodMonths: number
  /** % of finance staff time currently spent on manual tasks */
  timeSpentPercent: number
  /** Derived hourly rate from monthly salary */
  hourlyRate: number
  /** Whether the inputs produce meaningful results */
  hasResults: boolean
}

/**
 * Calculate ROI metrics from prospect inputs.
 * Pure function — no side effects, no network calls.
 */
export function calculateROI(input: CalculationInput): CalculationResult {
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

  const grootPrice = GROOT_MONTHLY_PRICE[currency] ?? GROOT_MONTHLY_PRICE.USD
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
  }
}
