/**
 * Leave year boundary utilities.
 * Supports configurable leave year start month (e.g., April-March for fiscal year).
 * Default: January (calendar year).
 */

export interface LeaveYearBoundary {
  yearStart: string   // ISO date: "2026-04-01"
  yearEnd: string     // ISO date: "2027-03-31"
  yearLabel: string   // "Apr 2026 - Mar 2027"
  yearNumber: number  // 2026 (the year the period starts in)
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Get the leave year boundaries for a given reference date.
 * @param startMonth 1-12, the month the leave year starts (1=Jan, 4=Apr)
 * @param referenceDate Date to calculate the leave year for (defaults to now)
 */
export function getLeaveYearBoundaries(
  startMonth: number,
  referenceDate?: Date,
): LeaveYearBoundary {
  const ref = referenceDate ?? new Date()
  const refYear = ref.getFullYear()
  const refMonth = ref.getMonth() + 1 // 1-indexed

  // Determine which leave year the reference date falls in
  let yearNumber: number
  if (startMonth === 1) {
    yearNumber = refYear
  } else if (refMonth >= startMonth) {
    yearNumber = refYear
  } else {
    yearNumber = refYear - 1
  }

  const startDate = new Date(yearNumber, startMonth - 1, 1)
  const endDate = new Date(yearNumber + 1, startMonth - 1, 0) // last day of month before next start

  return {
    yearStart: formatISODate(startDate),
    yearEnd: formatISODate(endDate),
    yearLabel: formatLeaveYearLabel(startMonth, yearNumber),
    yearNumber,
  }
}

/**
 * Get the "year number" for the current leave year.
 * For Jan start: returns calendar year (2026).
 * For Apr start: returns the year the period starts in (Apr 2026 - Mar 2027 → 2026).
 */
export function getCurrentLeaveYear(
  startMonth: number,
  referenceDate?: Date,
): number {
  return getLeaveYearBoundaries(startMonth, referenceDate).yearNumber
}

/**
 * Format a leave year label for display.
 * Jan start: "2026"
 * Apr start: "Apr 2026 - Mar 2027"
 */
export function formatLeaveYearLabel(startMonth: number, yearNumber: number): string {
  if (startMonth === 1) {
    return String(yearNumber)
  }
  const startMonthName = MONTH_NAMES[startMonth - 1]
  const endMonthIndex = startMonth - 2 < 0 ? 11 : startMonth - 2
  const endMonthName = MONTH_NAMES[endMonthIndex]
  const endYear = yearNumber + 1
  return `${startMonthName} ${yearNumber} - ${endMonthName} ${endYear}`
}

function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
