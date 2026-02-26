/**
 * Value Extractor & Formatter Utilities
 *
 * Pure functions for extracting values from records (dot-notation paths)
 * and formatting them (dates, numbers, text, CSV escaping).
 * Factored out from csv-generator.ts for reuse by the unified export engine.
 */

import type { FieldMapping } from "../types";

// ============================================
// DATE FORMATTING
// ============================================

export function formatDate(
  value: string | number | null | undefined,
  format: string = "YYYY-MM-DD"
): string {
  if (value === null || value === undefined) {
    return "";
  }

  const date =
    typeof value === "number" ? new Date(value) : new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  switch (format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "DD-MM-YYYY":
      return `${day}-${month}-${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
    default:
      return `${year}-${month}-${day}`;
  }
}

// ============================================
// NUMBER FORMATTING
// ============================================

export function formatNumber(
  value: number | null | undefined,
  decimalPlaces: number = 2,
  thousandSeparator: "comma" | "none" = "none"
): string {
  if (value === null || value === undefined) {
    return "";
  }

  const num = Number(value);
  if (isNaN(num)) {
    return String(value);
  }

  const fixed = num.toFixed(decimalPlaces);

  if (thousandSeparator === "comma") {
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  return fixed;
}

// ============================================
// VALUE ESCAPING
// ============================================

/**
 * Escape a value for delimited output (CSV/semicolon).
 * Wraps in quotes if the value contains the delimiter, quotes, or newlines.
 */
export function escapeDelimitedValue(
  value: unknown,
  delimiter: string = ","
): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);

  // For pipe-delimited formats (Master Accounting), replace pipe chars in data
  // to prevent delimiter corruption. Pipe format doesn't support quoting.
  if (delimiter === "|") {
    str = str.replace(/\|/g, "-");
    return str;
  }

  const needsEscaping =
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsEscaping) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

// ============================================
// VALUE EXTRACTION
// ============================================

/**
 * Extract a value from a record using dot notation path.
 * e.g., "employee.name" extracts record.employee.name
 */
export function extractValue(
  record: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split(".");
  let current: unknown = record;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// ============================================
// FIELD TYPE REGISTRY
// ============================================

const FIELD_TYPES: Record<string, "text" | "number" | "date"> = {
  // Expense fields
  transactionDate: "date",
  totalAmount: "number",
  homeCurrencyAmount: "number",
  exchangeRate: "number",
  submittedAt: "date",
  approvedAt: "date",
  paidAt: "date",
  // Leave fields
  startDate: "date",
  endDate: "date",
  totalDays: "number",
  // Accounting fields
  documentDate: "date",
  postDate: "date",
  originalAmount: "number",
  "lineItem.quantity": "number",
  "lineItem.unitPrice": "number",
  "lineItem.totalAmount": "number",
  "lineItem.taxAmount": "number",
  "lineItem.taxRate": "number",
  "lineItem.debitAmount": "number",
  "lineItem.creditAmount": "number",
  "lineItem.debitLocal": "number",
  "lineItem.creditLocal": "number",
  // Invoice fields
  invoiceDate: "date",
  dueDate: "date",
  subtotal: "number",
  totalTax: "number",
  sentAt: "date",
  paymentDate: "date",
};

export function getFieldType(fieldId: string): "text" | "number" | "date" {
  return FIELD_TYPES[fieldId] || "text";
}

// ============================================
// FIELD VALUE FORMATTING
// ============================================

// Master Accounting field length limits by column name pattern
const MASTER_ACCOUNTING_MAX_LENGTHS: Record<string, number> = {
  Code: 20,
  Description: 200,
  ReferenceNo: 50,
  RegisterNo: 30,
  Name: 200,
  Remark: 200,
  Address: 200,
  Phone: 30,
  Fax: 30,
  Email: 200,
  TIN: 30,
};

function truncateForMasterAccounting(
  value: string,
  targetColumn: string
): string {
  for (const [pattern, maxLen] of Object.entries(
    MASTER_ACCOUNTING_MAX_LENGTHS
  )) {
    if (targetColumn.includes(pattern)) {
      return value.length > maxLen ? value.slice(0, maxLen) : value;
    }
  }
  return value;
}

export function formatFieldValue(
  value: unknown,
  mapping: FieldMapping,
  fieldType: "text" | "number" | "date",
  defaultDateFormat?: string,
  defaultDecimalPlaces?: number,
  defaultThousandSeparator?: "comma" | "none"
): string {
  if (value === null || value === undefined) {
    return "";
  }

  let result: string;

  switch (fieldType) {
    case "date":
      result = formatDate(
        value as string | number,
        mapping.dateFormat || defaultDateFormat || "YYYY-MM-DD"
      );
      break;

    case "number":
      result = formatNumber(
        value as number,
        mapping.decimalPlaces ?? defaultDecimalPlaces ?? 2,
        mapping.thousandSeparator || defaultThousandSeparator || "none"
      );
      break;

    case "text":
    default:
      result = String(value);
      break;
  }

  // Apply Master Accounting truncation for text fields
  if (fieldType === "text") {
    result = truncateForMasterAccounting(result, mapping.targetColumn);
  }

  return result;
}
