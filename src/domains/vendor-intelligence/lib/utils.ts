/**
 * Utility Functions: Smart Vendor Intelligence
 *
 * This file provides helper functions for data formatting and manipulation.
 * Re-exports commonly used utilities from the global lib for convenience.
 *
 * Date: 2026-03-16
 * Feature: 001-smart-vendor-intelligence (#320)
 */

// Re-export date formatting from global utils
export { formatBusinessDate } from "@/lib/utils";

// Re-export number and currency formatting from global utils
export { formatNumber, formatCurrency, formatCompactNumber } from "@/lib/utils/format-number";

/**
 * Calculate coefficient of variation for price stability score
 * @param prices - Array of price values
 * @returns Coefficient of variation (0-100+), where lower = more stable
 */
export function calculateCoefficientOfVariation(prices: number[]): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return 0; // Single price = perfectly stable

  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  if (mean === 0) return 0; // Avoid division by zero

  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return (stdDev / mean) * 100; // Return as percentage
}

/**
 * Calculate mean (average) of an array of numbers
 * @param values - Array of numeric values
 * @returns Mean value, or 0 if array is empty
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate days between two dates (for payment cycle calculation)
 * @param startDate - Start date (ISO string or Convex timestamp)
 * @param endDate - End date (ISO string or Convex timestamp)
 * @returns Number of days between dates
 */
export function daysBetween(
  startDate: string | number,
  endDate: string | number
): number {
  const start = typeof startDate === "string" ? new Date(startDate) : new Date(startDate);
  const end = typeof endDate === "string" ? new Date(endDate) : new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.warn(`[daysBetween] Invalid dates: ${startDate}, ${endDate}`);
    return 0;
  }

  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)); // Convert ms to days
}

/**
 * Generate item identifier from item code or description
 * @param itemCode - Optional item code
 * @param itemDescription - Item description
 * @returns Unique item identifier (item code or description hash)
 */
export function generateItemIdentifier(
  itemCode: string | undefined,
  itemDescription: string
): string {
  if (itemCode && itemCode.trim().length > 0) {
    return itemCode.trim().toUpperCase();
  }

  // No item code - use hash of normalized description
  return hashDescription(itemDescription);
}

/**
 * Hash a description for use as item identifier
 * @param description - Item description
 * @returns Hashed description (lowercase, normalized)
 */
export function hashDescription(description: string): string {
  // Normalize: lowercase, remove extra whitespace, remove special chars
  return description
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")          // Collapse multiple spaces
    .replace(/[^a-z0-9\s-]/g, "")  // Remove special chars except hyphen
    .substring(0, 100);            // Limit length
}

/**
 * Calculate percentage change between two values
 * @param oldValue - Previous value
 * @param newValue - Current value
 * @returns Percentage change (positive = increase, negative = decrease)
 */
export function percentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Format percentage for display
 * @param percentage - Percentage value (e.g., 15.5 for 15.5%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "+15.5%" or "-3.2%")
 */
export function formatPercentage(percentage: number, decimals: number = 1): string {
  const sign = percentage >= 0 ? "+" : "";
  return `${sign}${percentage.toFixed(decimals)}%`;
}

/**
 * Check if a date is older than N years
 * @param dateString - ISO date string (YYYY-MM-DD)
 * @param years - Number of years threshold
 * @returns True if date is older than threshold
 */
export function isOlderThan(dateString: string, years: number): boolean {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  const yearsDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  return yearsDiff > years;
}

/**
 * Sanitize filename for safe file download
 * @param filename - Original filename
 * @returns Sanitized filename safe for all OS
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_\-\.]/gi, "_") // Replace unsafe chars with underscore
    .replace(/_+/g, "_")               // Collapse multiple underscores
    .substring(0, 100);                 // Limit length
}

/**
 * Get fiscal year start date for a business
 * @param businessId - Business ID (for future DB lookup)
 * @returns ISO date string for fiscal year start (default: Jan 1 current year)
 */
export function getFiscalYearStart(businessId: string): string {
  // TODO: Look up business settings to get custom fiscal year start
  // For now, default to calendar year (January 1)
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}
