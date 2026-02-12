/**
 * System Holidays - Uses date-holidays library directly
 *
 * Provides system (country-level) public holidays without DB storage.
 * Custom business holidays are stored separately in Convex.
 */

import Holidays from 'date-holidays';

const SUPPORTED_COUNTRIES = ['MY', 'SG', 'ID', 'PH', 'TH', 'VN'];

// Cache instances to avoid re-creating for the same country
const instanceCache = new Map<string, Holidays>();

function getHolidaysInstance(countryCode: string): Holidays {
  let instance = instanceCache.get(countryCode);
  if (!instance) {
    instance = new Holidays(countryCode);
    instanceCache.set(countryCode, instance);
  }
  return instance;
}

export interface SystemHoliday {
  date: string;
  name: string;
  countryCode: string;
  year: number;
  isCustom: false;
}

/**
 * Get public holidays for a country and year from date-holidays library
 */
export function getSystemHolidays(countryCode: string, year: number): SystemHoliday[] {
  if (!SUPPORTED_COUNTRIES.includes(countryCode)) return [];

  const hd = getHolidaysInstance(countryCode);
  const rawHolidays = hd.getHolidays(year);

  return rawHolidays
    .filter((h) => h.type === 'public')
    .map((h) => ({
      date: h.date.split(' ')[0],
      name: h.name,
      countryCode,
      year,
      isCustom: false as const,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get public holiday dates as YYYY-MM-DD strings
 */
export function getSystemHolidayDates(countryCode: string, year: number): string[] {
  return getSystemHolidays(countryCode, year).map((h) => h.date);
}
