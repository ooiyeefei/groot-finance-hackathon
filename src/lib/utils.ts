import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Month names for date formatting
 */
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Format a business date WITHOUT timezone conversion
 *
 * CRITICAL: Use this for financial document dates (invoice date, transaction date, etc.)
 * These dates should be displayed exactly as recorded, NOT converted to viewer's timezone.
 *
 * @param dateInput - ISO date string (YYYY-MM-DD or full ISO timestamp) OR Convex timestamp (number in ms)
 * @param format - 'short' for "Jan 15, 2025" or 'long' for "January 15, 2025"
 * @returns Formatted date string
 *
 * @example
 * formatBusinessDate('2025-10-31') // "Oct 31, 2025"
 * formatBusinessDate('2025-10-31', 'long') // "October 31, 2025"
 * formatBusinessDate(1704067200000) // "Jan 1, 2024" (Convex timestamp)
 */
export function formatBusinessDate(dateInput: string | number | null | undefined, format: 'short' | 'long' = 'short'): string {
  if (dateInput === null || dateInput === undefined) return 'N/A'

  try {
    let year: number, month: number, day: number

    // Handle Convex timestamps (numbers in milliseconds)
    if (typeof dateInput === 'number') {
      const date = new Date(dateInput)
      if (isNaN(date.getTime())) {
        console.warn(`[formatBusinessDate] Invalid timestamp: ${dateInput}`)
        return 'Invalid Date'
      }
      // Use UTC to avoid timezone issues
      year = date.getUTCFullYear()
      month = date.getUTCMonth() + 1
      day = date.getUTCDate()
    } else {
      // Handle string dates (ISO format)
      const dateString = dateInput
      // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
      const datePart = dateString.split('T')[0]
      const parts = datePart.split('-').map(Number)
      year = parts[0]
      month = parts[1]
      day = parts[2]
    }

    // Validate parsed values
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      console.warn(`[formatBusinessDate] Invalid date format: ${dateInput}`)
      return String(dateInput)
    }

    const monthNames = format === 'long' ? MONTH_NAMES_LONG : MONTH_NAMES_SHORT
    const monthName = monthNames[month - 1]

    if (!monthName) {
      console.warn(`[formatBusinessDate] Invalid month: ${month}`)
      return String(dateInput)
    }

    return `${monthName} ${day}, ${year}`
  } catch (error) {
    console.warn(`[formatBusinessDate] Error formatting ${dateInput}:`, error)
    return String(dateInput)
  }
}

/**
 * Format a system timestamp WITH timezone conversion (uses browser local timezone)
 *
 * Use this for system-generated timestamps (created_at, processed_at, etc.)
 * These represent when events occurred and should be shown in viewer's timezone.
 *
 * @param dateString - ISO date string or timestamp
 * @param format - 'short' for "Jan 15, 2025" or 'long' for "January 15, 2025"
 * @returns Formatted date string in local timezone
 */
export function formatTimestamp(dateString: string | null | undefined, format: 'short' | 'long' = 'short'): string {
  if (!dateString) return 'N/A'

  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString
    }

    return date.toLocaleDateString('en-US', {
      month: format === 'long' ? 'long' : 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch (error) {
    console.warn(`[formatTimestamp] Error formatting ${dateString}:`, error)
    return dateString
  }
}