/**
 * Business Day Calculator
 *
 * Pure function for calculating business days between two dates,
 * excluding weekends and public holidays.
 */

/**
 * Parse ISO date string (YYYY-MM-DD) to Date object at midnight UTC
 */
export function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format Date to ISO date string (YYYY-MM-DD)
 */
export function formatISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date is in the holidays array
 */
export function isHoliday(date: Date, holidays: Date[]): boolean {
  const dateStr = formatISODate(date);
  return holidays.some((h) => formatISODate(h) === dateStr);
}

/**
 * Calculate business days between two dates (inclusive)
 *
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @param holidays - Array of holiday dates to exclude
 * @param excludeWeekends - Whether to exclude weekends (default: true)
 * @returns Number of business days
 */
export function calculateBusinessDays(
  startDate: Date,
  endDate: Date,
  holidays: Date[] = [],
  excludeWeekends: boolean = true
): number {
  // Validate dates
  if (startDate > endDate) {
    return 0;
  }

  let businessDays = 0;
  const current = new Date(startDate);

  // Iterate through each day in the range
  while (current <= endDate) {
    const isWeekendDay = excludeWeekends && isWeekend(current);
    const isHolidayDay = isHoliday(current, holidays);

    if (!isWeekendDay && !isHolidayDay) {
      businessDays++;
    }

    // Move to next day
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return businessDays;
}

/**
 * Calculate business days from ISO date strings
 *
 * @param startDateStr - Start date string (YYYY-MM-DD) (inclusive)
 * @param endDateStr - End date string (YYYY-MM-DD) (inclusive)
 * @param holidayStrings - Array of holiday date strings to exclude
 * @param excludeWeekends - Whether to exclude weekends (default: true)
 * @returns Number of business days
 */
export function calculateBusinessDaysFromStrings(
  startDateStr: string,
  endDateStr: string,
  holidayStrings: string[] = [],
  excludeWeekends: boolean = true
): number {
  const startDate = parseISODate(startDateStr);
  const endDate = parseISODate(endDateStr);
  const holidays = holidayStrings.map(parseISODate);

  return calculateBusinessDays(startDate, endDate, holidays, excludeWeekends);
}

/**
 * Get all dates between start and end (inclusive)
 */
export function getDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Get business days as an array of dates
 *
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @param holidays - Array of holiday dates to exclude
 * @param excludeWeekends - Whether to exclude weekends (default: true)
 * @returns Array of business day dates
 */
export function getBusinessDays(
  startDate: Date,
  endDate: Date,
  holidays: Date[] = [],
  excludeWeekends: boolean = true
): Date[] {
  const allDates = getDateRange(startDate, endDate);

  return allDates.filter((date) => {
    const isWeekendDay = excludeWeekends && isWeekend(date);
    const isHolidayDay = isHoliday(date, holidays);
    return !isWeekendDay && !isHolidayDay;
  });
}

/**
 * Parse date string (YYYY-MM-DD) to Date object in local timezone
 * Preserves the calendar date without timezone conversion
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format Date to input value string (YYYY-MM-DD) in local timezone
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validate that a date range is valid for leave requests
 *
 * @param startDateStr - Start date string (YYYY-MM-DD)
 * @param endDateStr - End date string (YYYY-MM-DD)
 * @param holidayStrings - Array of holiday date strings
 * @returns Validation result with error message if invalid
 */
export function validateDateRange(
  startDateStr: string,
  endDateStr: string,
  holidayStrings: string[] = []
): { valid: boolean; error?: string; totalDays: number } {
  const startDate = parseISODate(startDateStr);
  const endDate = parseISODate(endDateStr);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Start date must not be in the past
  if (startDate < today) {
    return {
      valid: false,
      error: "Start date cannot be in the past",
      totalDays: 0,
    };
  }

  // End date must be >= start date
  if (endDate < startDate) {
    return {
      valid: false,
      error: "End date must be on or after start date",
      totalDays: 0,
    };
  }

  const totalDays = calculateBusinessDaysFromStrings(
    startDateStr,
    endDateStr,
    holidayStrings
  );

  // Must have at least 1 business day
  if (totalDays === 0) {
    return {
      valid: false,
      error: "Selected dates result in 0 business days (all weekends/holidays)",
      totalDays: 0,
    };
  }

  return {
    valid: true,
    totalDays,
  };
}
