/**
 * Validation Library: Double-Entry Accounting System
 *
 * Provides validation functions for journal entries, account codes,
 * fiscal periods, and entry numbers.
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { ConvexError } from "convex/values";

/**
 * Validate journal entry balance (debits = credits)
 *
 * @param lines - Array of journal entry lines with debit and credit amounts
 * @returns Object with totals and balance status
 * @throws ConvexError if entry is unbalanced (difference > 0.01)
 *
 * @example
 * ```typescript
 * const lines = [
 *   { debitAmount: 100, creditAmount: 0 },
 *   { debitAmount: 0, creditAmount: 100 },
 * ];
 * const result = validateBalance(lines);
 * // result.balanced === true
 * ```
 */
export function validateBalance(
  lines: Array<{ debitAmount: number; creditAmount: number }>
): { totalDebits: number; totalCredits: number; balanced: true } {
  const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);

  // Allow 0.01 rounding tolerance for floating point precision
  const diff = Math.abs(totalDebits - totalCredits);

  if (diff > 0.01) {
    throw new ConvexError({
      message: `Unbalanced entry: Debits=${totalDebits.toFixed(2)}, Credits=${totalCredits.toFixed(2)}, Diff=${diff.toFixed(2)}`,
      code: "UNBALANCED_ENTRY",
      totalDebits,
      totalCredits,
      difference: diff,
    });
  }

  return { totalDebits, totalCredits, balanced: true };
}

/**
 * Validate line mutual exclusivity (debit XOR credit)
 *
 * Ensures each journal entry line has either a debit OR credit amount, not both.
 *
 * @param line - Journal entry line with debit and credit amounts
 * @returns true if validation passes
 * @throws ConvexError if line has both debit and credit, or neither
 *
 * @example
 * ```typescript
 * validateLine({ debitAmount: 100, creditAmount: 0 }); // OK
 * validateLine({ debitAmount: 0, creditAmount: 100 }); // OK
 * validateLine({ debitAmount: 100, creditAmount: 100 }); // ERROR
 * validateLine({ debitAmount: 0, creditAmount: 0 }); // ERROR
 * ```
 */
export function validateLine(line: {
  debitAmount: number;
  creditAmount: number;
}): true {
  // Check for both debit and credit (not allowed)
  if (line.debitAmount > 0 && line.creditAmount > 0) {
    throw new ConvexError({
      message: "Line cannot have both debit and credit amounts",
      code: "INVALID_LINE_AMOUNTS",
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
    });
  }

  // Check for neither debit nor credit (not allowed)
  if (line.debitAmount === 0 && line.creditAmount === 0) {
    throw new ConvexError({
      message: "Line must have either debit or credit amount (cannot be zero)",
      code: "ZERO_LINE_AMOUNT",
    });
  }

  return true;
}

/**
 * Validate account code format and range
 *
 * Ensures account codes fall within the standard chart of accounts ranges:
 * - Assets: 1000-1999
 * - Liabilities: 2000-2999
 * - Equity: 3000-3999
 * - Revenue: 4000-4999
 * - Expense: 5000-5999
 *
 * @param code - Account code (e.g., "1000", "4100")
 * @param type - Account type (Asset, Liability, Equity, Revenue, Expense)
 * @returns true if code matches type's range
 * @throws ConvexError if code is invalid or doesn't match type
 *
 * @example
 * ```typescript
 * validateAccountCode("1000", "Asset"); // OK
 * validateAccountCode("4100", "Revenue"); // OK
 * validateAccountCode("1000", "Revenue"); // ERROR: Asset code for Revenue type
 * ```
 */
export function validateAccountCode(code: string, type: string): boolean {
  const num = parseInt(code, 10);

  if (isNaN(num)) {
    throw new ConvexError({
      message: `Invalid account code format: ${code}`,
      code: "INVALID_ACCOUNT_CODE_FORMAT",
      accountCode: code,
    });
  }

  const ranges: Record<string, [number, number]> = {
    Asset: [1000, 1999],
    Liability: [2000, 2999],
    Equity: [3000, 3999],
    Revenue: [4000, 4999],
    Expense: [5000, 5999],
  };

  const range = ranges[type];

  if (!range) {
    throw new ConvexError({
      message: `Invalid account type: ${type}`,
      code: "INVALID_ACCOUNT_TYPE",
      accountType: type,
      validTypes: Object.keys(ranges),
    });
  }

  const [min, max] = range;

  if (num < min || num > max) {
    throw new ConvexError({
      message: `Account code ${code} is outside the valid range for ${type} accounts (${min}-${max})`,
      code: "ACCOUNT_CODE_OUT_OF_RANGE",
      accountCode: code,
      accountType: type,
      validRange: [min, max],
      actualValue: num,
    });
  }

  return true;
}

/**
 * Calculate fiscal period from transaction date
 *
 * Converts a date string (YYYY-MM-DD) to fiscal year and period code.
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns Object with fiscalYear and fiscalPeriod (YYYY-MM)
 *
 * @example
 * ```typescript
 * calculateFiscalPeriod("2026-03-15");
 * // Returns: { fiscalYear: 2026, fiscalPeriod: "2026-03" }
 * ```
 */
export function calculateFiscalPeriod(date: string): {
  fiscalYear: number;
  fiscalPeriod: string;
} {
  if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new ConvexError({
      message: `Invalid date format: ${date}. Expected YYYY-MM-DD`,
      code: "INVALID_DATE_FORMAT",
      date,
    });
  }

  const [year, month] = date.split("-").map(Number);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new ConvexError({
      message: `Invalid date components: year=${year}, month=${month}`,
      code: "INVALID_DATE_COMPONENTS",
      year,
      month,
    });
  }

  return {
    fiscalYear: year,
    fiscalPeriod: `${year}-${String(month).padStart(2, "0")}`,
  };
}

/**
 * Generate next journal entry number
 *
 * Formats entry numbers as JE-YYYY-NNNNN (e.g., JE-2026-00001).
 *
 * @param year - Fiscal year
 * @param sequenceNumber - Sequential number within the year
 * @returns Formatted entry number
 *
 * @example
 * ```typescript
 * generateEntryNumber(2026, 1); // "JE-2026-00001"
 * generateEntryNumber(2026, 123); // "JE-2026-00123"
 * generateEntryNumber(2026, 99999); // "JE-2026-99999"
 * ```
 */
export function generateEntryNumber(
  year: number,
  sequenceNumber: number
): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ConvexError({
      message: `Invalid year: ${year}`,
      code: "INVALID_YEAR",
      year,
    });
  }

  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new ConvexError({
      message: `Invalid sequence number: ${sequenceNumber}`,
      code: "INVALID_SEQUENCE_NUMBER",
      sequenceNumber,
    });
  }

  return `JE-${year}-${String(sequenceNumber).padStart(5, "0")}`;
}

/**
 * Validate period date range
 *
 * Ensures period dates are valid and start date is before end date.
 *
 * @param startDate - Period start date (YYYY-MM-DD)
 * @param endDate - Period end date (YYYY-MM-DD)
 * @returns true if validation passes
 * @throws ConvexError if dates are invalid or out of order
 */
export function validatePeriodDates(
  startDate: string,
  endDate: string
): boolean {
  if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new ConvexError({
      message: `Invalid start date format: ${startDate}`,
      code: "INVALID_START_DATE_FORMAT",
      startDate,
    });
  }

  if (!endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new ConvexError({
      message: `Invalid end date format: ${endDate}`,
      code: "INVALID_END_DATE_FORMAT",
      endDate,
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start >= end) {
    throw new ConvexError({
      message: `Start date (${startDate}) must be before end date (${endDate})`,
      code: "INVALID_DATE_RANGE",
      startDate,
      endDate,
    });
  }

  return true;
}

/**
 * Validate currency code format
 *
 * Ensures currency codes are 3-letter uppercase ISO 4217 codes.
 *
 * @param currencyCode - Currency code (e.g., "USD", "MYR", "SGD")
 * @returns true if validation passes
 * @throws ConvexError if currency code is invalid
 */
export function validateCurrencyCode(currencyCode: string): boolean {
  if (!currencyCode || !currencyCode.match(/^[A-Z]{3}$/)) {
    throw new ConvexError({
      message: `Invalid currency code: ${currencyCode}. Expected 3-letter ISO 4217 code (e.g., USD, MYR, SGD)`,
      code: "INVALID_CURRENCY_CODE",
      currencyCode,
    });
  }

  return true;
}

/**
 * Validate exchange rate
 *
 * Ensures exchange rate is a positive number with reasonable bounds.
 *
 * @param rate - Exchange rate value
 * @returns true if validation passes
 * @throws ConvexError if rate is invalid
 */
export function validateExchangeRate(rate: number): boolean {
  if (typeof rate !== "number" || isNaN(rate) || rate <= 0) {
    throw new ConvexError({
      message: `Invalid exchange rate: ${rate}. Must be a positive number`,
      code: "INVALID_EXCHANGE_RATE",
      rate,
    });
  }

  // Sanity check: exchange rates are typically between 0.001 and 10000
  if (rate < 0.001 || rate > 10000) {
    throw new ConvexError({
      message: `Exchange rate ${rate} is outside reasonable bounds (0.001 - 10000)`,
      code: "EXCHANGE_RATE_OUT_OF_BOUNDS",
      rate,
    });
  }

  return true;
}
