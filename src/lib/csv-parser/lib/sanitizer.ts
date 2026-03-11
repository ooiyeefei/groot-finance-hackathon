/**
 * Formula injection prevention.
 * Strips dangerous formula prefixes from cell values to prevent
 * CSV injection attacks (OWASP recommendation).
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@"];

/**
 * Sanitize a single cell value by neutralizing formula prefixes.
 * Prepends a single quote to values starting with =, +, -, or @.
 * The single quote is invisible when consumed programmatically.
 */
export function sanitizeCellValue(value: string): string {
  if (!value || value.length === 0) return value;

  const trimmed = value.trim();
  if (trimmed.length === 0) return value;

  // Check if first character is a formula prefix
  if (FORMULA_PREFIXES.includes(trimmed[0])) {
    // Don't sanitize if it's a negative number (starts with - followed by digit)
    if (trimmed[0] === "-" && trimmed.length > 1 && /\d/.test(trimmed[1])) {
      return value;
    }
    // Don't sanitize if it's a positive number shorthand (starts with + followed by digit)
    if (trimmed[0] === "+" && trimmed.length > 1 && /\d/.test(trimmed[1])) {
      return value;
    }
    return "'" + value;
  }

  return value;
}

/**
 * Check if a file is a macro-enabled Excel file (.xlsm).
 * These are rejected entirely as a security measure.
 */
export function isMacroEnabledFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xlsm");
}
