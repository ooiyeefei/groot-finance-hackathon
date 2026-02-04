/**
 * Business Day Calculator Tests
 *
 * Tests edge cases for leave request business day calculation:
 * - Multi-day leave spanning weekends
 * - Leave including public holidays
 * - Weekend-only selections
 * - Holiday on weekend (doesn't double-count)
 * - Year boundary scenarios
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBusinessDays,
  calculateBusinessDaysFromStrings,
  isWeekend,
  isHoliday,
  parseISODate,
  formatISODate,
  validateDateRange,
  getBusinessDays,
} from '@/domains/leave-management/lib/day-calculator';

describe('Day Calculator', () => {
  describe('parseISODate', () => {
    it('parses valid ISO date string', () => {
      const date = parseISODate('2025-03-15');
      expect(date.getUTCFullYear()).toBe(2025);
      expect(date.getUTCMonth()).toBe(2); // March is 0-indexed
      expect(date.getUTCDate()).toBe(15);
    });

    it('handles single-digit months and days', () => {
      const date = parseISODate('2025-01-05');
      expect(date.getUTCMonth()).toBe(0);
      expect(date.getUTCDate()).toBe(5);
    });
  });

  describe('formatISODate', () => {
    it('formats date to ISO string', () => {
      const date = new Date(Date.UTC(2025, 2, 15)); // March 15, 2025
      expect(formatISODate(date)).toBe('2025-03-15');
    });

    it('pads single-digit months and days', () => {
      const date = new Date(Date.UTC(2025, 0, 5)); // January 5, 2025
      expect(formatISODate(date)).toBe('2025-01-05');
    });
  });

  describe('isWeekend', () => {
    it('returns true for Saturday', () => {
      // 2025-03-15 is a Saturday
      const saturday = parseISODate('2025-03-15');
      expect(isWeekend(saturday)).toBe(true);
    });

    it('returns true for Sunday', () => {
      // 2025-03-16 is a Sunday
      const sunday = parseISODate('2025-03-16');
      expect(isWeekend(sunday)).toBe(true);
    });

    it('returns false for Monday', () => {
      // 2025-03-17 is a Monday
      const monday = parseISODate('2025-03-17');
      expect(isWeekend(monday)).toBe(false);
    });

    it('returns false for Friday', () => {
      // 2025-03-14 is a Friday
      const friday = parseISODate('2025-03-14');
      expect(isWeekend(friday)).toBe(false);
    });
  });

  describe('isHoliday', () => {
    const holidays = [
      parseISODate('2025-01-01'), // New Year
      parseISODate('2025-12-25'), // Christmas
    ];

    it('returns true for holiday date', () => {
      const newYear = parseISODate('2025-01-01');
      expect(isHoliday(newYear, holidays)).toBe(true);
    });

    it('returns false for non-holiday date', () => {
      const regularDay = parseISODate('2025-03-15');
      expect(isHoliday(regularDay, holidays)).toBe(false);
    });
  });

  describe('calculateBusinessDays', () => {
    describe('basic scenarios', () => {
      it('counts single business day', () => {
        // 2025-03-17 is a Monday
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-17');
        expect(calculateBusinessDays(start, end)).toBe(1);
      });

      it('counts full work week (Mon-Fri)', () => {
        // 2025-03-17 (Mon) to 2025-03-21 (Fri)
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-21');
        expect(calculateBusinessDays(start, end)).toBe(5);
      });

      it('returns 0 for end before start', () => {
        const start = parseISODate('2025-03-21');
        const end = parseISODate('2025-03-17');
        expect(calculateBusinessDays(start, end)).toBe(0);
      });
    });

    describe('multi-day leave spanning weekends', () => {
      it('excludes weekend in week-long leave', () => {
        // 2025-03-17 (Mon) to 2025-03-23 (Sun) = 7 calendar days, 5 business days
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-23');
        expect(calculateBusinessDays(start, end)).toBe(5);
      });

      it('excludes multiple weekends in two-week leave', () => {
        // 2025-03-17 (Mon) to 2025-03-28 (Fri) = 12 calendar days, 10 business days (2 weekends)
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-28');
        expect(calculateBusinessDays(start, end)).toBe(10);
      });

      it('handles leave starting on Saturday', () => {
        // 2025-03-15 (Sat) to 2025-03-21 (Fri) = 7 calendar days, 5 business days
        const start = parseISODate('2025-03-15');
        const end = parseISODate('2025-03-21');
        expect(calculateBusinessDays(start, end)).toBe(5);
      });

      it('handles leave ending on Sunday', () => {
        // 2025-03-17 (Mon) to 2025-03-23 (Sun) = 7 calendar days, 5 business days
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-23');
        expect(calculateBusinessDays(start, end)).toBe(5);
      });
    });

    describe('leave including public holidays', () => {
      const holidays = [
        parseISODate('2025-01-01'), // New Year - Wednesday
        parseISODate('2025-01-29'), // Chinese New Year - Wednesday
        parseISODate('2025-01-30'), // Chinese New Year Day 2 - Thursday
      ];

      it('excludes single holiday in range', () => {
        // 2025-01-01 is Wednesday (New Year)
        // Dec 30 (Mon) to Jan 3 (Fri) = 5 weekdays, minus 1 holiday = 4 business days
        const start = parseISODate('2024-12-30');
        const end = parseISODate('2025-01-03');
        const holidays2025 = [parseISODate('2025-01-01')];
        expect(calculateBusinessDays(start, end, holidays2025)).toBe(4);
      });

      it('excludes multiple consecutive holidays', () => {
        // Jan 27 (Mon) to Jan 31 (Fri) = 5 weekdays
        // Minus Jan 29 & 30 (CNY) = 3 business days
        const start = parseISODate('2025-01-27');
        const end = parseISODate('2025-01-31');
        expect(calculateBusinessDays(start, end, holidays)).toBe(3);
      });

      it('handles holiday on weekend (no double counting)', () => {
        // If a holiday falls on Saturday, it doesn't reduce count further
        // Create a holiday on Saturday March 15
        const holidayOnWeekend = [parseISODate('2025-03-15')]; // Saturday
        // March 14 (Fri) to March 17 (Mon) = 2 weekdays
        const start = parseISODate('2025-03-14');
        const end = parseISODate('2025-03-17');
        expect(calculateBusinessDays(start, end, holidayOnWeekend)).toBe(2);
      });
    });

    describe('weekend-only selections', () => {
      it('returns 0 for Saturday only', () => {
        const saturday = parseISODate('2025-03-15');
        expect(calculateBusinessDays(saturday, saturday)).toBe(0);
      });

      it('returns 0 for Sunday only', () => {
        const sunday = parseISODate('2025-03-16');
        expect(calculateBusinessDays(sunday, sunday)).toBe(0);
      });

      it('returns 0 for full weekend (Sat-Sun)', () => {
        const saturday = parseISODate('2025-03-15');
        const sunday = parseISODate('2025-03-16');
        expect(calculateBusinessDays(saturday, sunday)).toBe(0);
      });
    });

    describe('option to include weekends', () => {
      it('counts all days when excludeWeekends is false', () => {
        // 2025-03-17 (Mon) to 2025-03-23 (Sun) = 7 calendar days
        const start = parseISODate('2025-03-17');
        const end = parseISODate('2025-03-23');
        expect(calculateBusinessDays(start, end, [], false)).toBe(7);
      });

      it('still excludes holidays when excludeWeekends is false', () => {
        const start = parseISODate('2025-01-01'); // Wednesday
        const end = parseISODate('2025-01-03'); // Friday
        const holidays = [parseISODate('2025-01-01')];
        // 3 days minus 1 holiday = 2
        expect(calculateBusinessDays(start, end, holidays, false)).toBe(2);
      });
    });
  });

  describe('calculateBusinessDaysFromStrings', () => {
    it('works with string inputs', () => {
      expect(calculateBusinessDaysFromStrings('2025-03-17', '2025-03-21')).toBe(5);
    });

    it('handles holiday strings', () => {
      const holidayStrings = ['2025-03-19']; // Wednesday
      // Mon to Fri minus 1 holiday = 4
      expect(calculateBusinessDaysFromStrings('2025-03-17', '2025-03-21', holidayStrings)).toBe(4);
    });
  });

  describe('getBusinessDays', () => {
    it('returns array of business day dates', () => {
      // Mon to Fri = 5 business days
      const start = parseISODate('2025-03-17');
      const end = parseISODate('2025-03-21');
      const businessDays = getBusinessDays(start, end);

      expect(businessDays).toHaveLength(5);
      expect(formatISODate(businessDays[0])).toBe('2025-03-17');
      expect(formatISODate(businessDays[4])).toBe('2025-03-21');
    });

    it('excludes holidays from result', () => {
      const start = parseISODate('2025-03-17');
      const end = parseISODate('2025-03-21');
      const holidays = [parseISODate('2025-03-19')]; // Wednesday
      const businessDays = getBusinessDays(start, end, holidays);

      expect(businessDays).toHaveLength(4);
      // Should not include March 19
      const dateStrings = businessDays.map(formatISODate);
      expect(dateStrings).not.toContain('2025-03-19');
    });
  });

  describe('validateDateRange', () => {
    // Note: These tests may fail if run on dates far in the future
    // because they validate against "today"

    it('returns error for past start date', () => {
      const result = validateDateRange('2020-01-01', '2020-01-05');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });

    it('returns error for end before start', () => {
      const futureDate = '2030-03-20';
      const earlierDate = '2030-03-15';
      const result = validateDateRange(futureDate, earlierDate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('after start');
    });

    it('returns error for 0 business days (weekend only)', () => {
      // Find a future weekend
      const futureSaturday = '2030-03-16'; // Saturday
      const futureSunday = '2030-03-17'; // Sunday
      const result = validateDateRange(futureSaturday, futureSunday);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0 business days');
    });

    it('returns valid with total days for valid range', () => {
      // Use far future dates
      const result = validateDateRange('2030-03-18', '2030-03-22');
      expect(result.valid).toBe(true);
      expect(result.totalDays).toBe(5);
    });

    it('excludes holidays from total days calculation', () => {
      // Far future Monday to Friday with one holiday
      const holidays = ['2030-03-20']; // Wednesday
      const result = validateDateRange('2030-03-18', '2030-03-22', holidays);
      expect(result.valid).toBe(true);
      expect(result.totalDays).toBe(4);
    });
  });
});
