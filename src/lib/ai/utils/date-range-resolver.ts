/**
 * Shared Date Range Resolver
 *
 * Deterministic date range calculation from natural language expressions.
 * Extracted from TransactionLookupTool to be shared across all tools.
 *
 * CRITICAL: All date calculations are deterministic - no LLM inference.
 * Uses referenceDate parameter for testability.
 */

export interface DateRangeResult {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  description: string
}

/**
 * Resolve a natural language date expression into exact YYYY-MM-DD dates.
 *
 * Supported patterns:
 * - Named months: "January 2026", "jan 2026", "January"
 * - Relative periods: "last month", "this month", "last quarter", "this quarter", "this year", "last year"
 * - Rolling windows: "past 60 days", "last 30 days", "past_60_days"
 * - Multi-month: "last 2 months", "past 3 months"
 * - Explicit: "YYYY-MM-DD" to "YYYY-MM-DD" (passthrough)
 *
 * @param expression - Natural language date expression
 * @param referenceDate - Reference date for calculations (defaults to now, useful for testing)
 * @returns DateRangeResult with startDate, endDate, and description
 */
export function resolveDateRange(
  expression: string,
  referenceDate?: Date
): DateRangeResult {
  const ref = referenceDate || new Date()
  const input = expression.trim().toLowerCase()

  // 1. Check for explicit YYYY-MM-DD passthrough
  const explicitMatch = input.match(/^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|through|-)\s*(\d{4}-\d{2}-\d{2}))?$/)
  if (explicitMatch) {
    const startDate = explicitMatch[1]
    const endDate = explicitMatch[2] || startDate
    return { startDate, endDate, description: `${startDate} to ${endDate}` }
  }

  // 2. Named months with optional year: "January 2026", "jan", "feb 2025"
  const monthNames: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5,
    july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
  }

  for (const [name, monthIndex] of Object.entries(monthNames)) {
    const monthPattern = new RegExp(`^${name}(?:\\s+(\\d{4}))?$`)
    const monthMatch = input.match(monthPattern)
    if (monthMatch) {
      const year = monthMatch[1] ? parseInt(monthMatch[1]) : ref.getFullYear()
      const start = new Date(year, monthIndex, 1)
      const end = new Date(year, monthIndex + 1, 0) // last day of month
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: `${capitalizeFirst(name)} ${year}`,
      }
    }
  }

  // 3. Rolling windows: "past N days", "last N days", "past_N_days"
  const rollingMatch = input.match(/(?:past|last)[_\s]+(\d+)[_\s]+days?/)
  if (rollingMatch) {
    const days = parseInt(rollingMatch[1])
    const start = new Date(ref)
    start.setDate(start.getDate() - days)
    return {
      startDate: formatDate(start),
      endDate: formatDate(ref),
      description: `Past ${days} days`,
    }
  }

  // 4. Multi-month: "last N months", "past N months"
  const multiMonthMatch = input.match(/(?:past|last)[_\s]+(\d+)[_\s]+months?/)
  if (multiMonthMatch) {
    const months = parseInt(multiMonthMatch[1])
    const start = new Date(ref)
    start.setMonth(start.getMonth() - months)
    return {
      startDate: formatDate(start),
      endDate: formatDate(ref),
      description: `Past ${months} months`,
    }
  }

  // 5. Relative periods
  if (input === 'this month') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'This month' }
  }

  if (input === 'last month') {
    const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    const end = new Date(ref.getFullYear(), ref.getMonth(), 0)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'Last month' }
  }

  if (input === 'this quarter') {
    const quarterStart = Math.floor(ref.getMonth() / 3) * 3
    const start = new Date(ref.getFullYear(), quarterStart, 1)
    const end = new Date(ref.getFullYear(), quarterStart + 3, 0)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'This quarter' }
  }

  if (input === 'last quarter') {
    const currentQuarterStart = Math.floor(ref.getMonth() / 3) * 3
    const start = new Date(ref.getFullYear(), currentQuarterStart - 3, 1)
    const end = new Date(ref.getFullYear(), currentQuarterStart, 0)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'Last quarter' }
  }

  if (input === 'this year') {
    const start = new Date(ref.getFullYear(), 0, 1)
    const end = new Date(ref.getFullYear(), 11, 31)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'This year' }
  }

  if (input === 'last year') {
    const start = new Date(ref.getFullYear() - 1, 0, 1)
    const end = new Date(ref.getFullYear() - 1, 11, 31)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'Last year' }
  }

  if (input === 'today') {
    return { startDate: formatDate(ref), endDate: formatDate(ref), description: 'Today' }
  }

  if (input === 'yesterday') {
    const yesterday = new Date(ref)
    yesterday.setDate(yesterday.getDate() - 1)
    return { startDate: formatDate(yesterday), endDate: formatDate(yesterday), description: 'Yesterday' }
  }

  if (input === 'this week') {
    const dayOfWeek = ref.getDay()
    const start = new Date(ref)
    start.setDate(start.getDate() - dayOfWeek) // Sunday start
    const end = new Date(start)
    end.setDate(end.getDate() + 6) // Saturday end
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'This week' }
  }

  if (input === 'last week') {
    const dayOfWeek = ref.getDay()
    const start = new Date(ref)
    start.setDate(start.getDate() - dayOfWeek - 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { startDate: formatDate(start), endDate: formatDate(end), description: 'Last week' }
  }

  // 6. Shorthand patterns from existing TransactionLookupTool: "past_30_days"
  const underscoreMatch = input.match(/^past_(\d+)_days$/)
  if (underscoreMatch) {
    const days = parseInt(underscoreMatch[1])
    const start = new Date(ref)
    start.setDate(start.getDate() - days)
    return {
      startDate: formatDate(start),
      endDate: formatDate(ref),
      description: `Past ${days} days`,
    }
  }

  // 7. Fallback: default to last 30 days
  const start = new Date(ref)
  start.setDate(start.getDate() - 30)
  return {
    startDate: formatDate(start),
    endDate: formatDate(ref),
    description: `Last 30 days (default)`,
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
