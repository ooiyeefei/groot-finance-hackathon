/**
 * CSV Generator Utility
 *
 * Generates CSV content from export data using template field mappings.
 * Handles date formatting, number formatting, and proper CSV escaping.
 */

import type { FieldMapping, ExportModule } from "../types";

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format a date value according to the specified format
 */
export function formatDate(
  value: string | number | null | undefined,
  format: string = "YYYY-MM-DD"
): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Handle timestamp (number) or ISO string
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

/**
 * Format a number value with decimal places and thousand separator
 */
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

  // Format with fixed decimal places
  const fixed = num.toFixed(decimalPlaces);

  // Add thousand separators if requested
  if (thousandSeparator === "comma") {
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  return fixed;
}

// ============================================
// CSV ESCAPING
// ============================================

/**
 * Escape a value for CSV format
 * - Wrap in quotes if contains comma, quote, or newline
 * - Escape double quotes by doubling them
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  // Check if escaping is needed
  const needsEscaping =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsEscaping) {
    // Escape double quotes and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

// ============================================
// VALUE EXTRACTION
// ============================================

/**
 * Extract a value from a record using dot notation path
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
// FIELD VALUE FORMATTING
// ============================================

/**
 * Format a field value based on its mapping configuration
 */
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

  switch (fieldType) {
    case "date":
      return formatDate(
        value as string | number,
        mapping.dateFormat || defaultDateFormat || "YYYY-MM-DD"
      );

    case "number":
      return formatNumber(
        value as number,
        mapping.decimalPlaces ?? defaultDecimalPlaces ?? 2,
        mapping.thousandSeparator || defaultThousandSeparator || "none"
      );

    case "text":
    default:
      return String(value);
  }
}

// ============================================
// CSV GENERATION
// ============================================

/**
 * Field type lookup for formatting
 */
const FIELD_TYPES: Record<string, "text" | "number" | "date"> = {
  // Expense fields
  "transactionDate": "date",
  "totalAmount": "number",
  "homeCurrencyAmount": "number",
  "exchangeRate": "number",
  "submittedAt": "date",
  "approvedAt": "date",
  "paidAt": "date",
  // Leave fields
  "startDate": "date",
  "endDate": "date",
  "totalDays": "number",
};

/**
 * Get the type of a field
 */
export function getFieldType(fieldId: string): "text" | "number" | "date" {
  return FIELD_TYPES[fieldId] || "text";
}

/**
 * Generate CSV content from records and field mappings
 */
export function generateCsv(
  records: Record<string, unknown>[],
  fieldMappings: FieldMapping[],
  options?: {
    defaultDateFormat?: string;
    defaultDecimalPlaces?: number;
    defaultThousandSeparator?: "comma" | "none";
  }
): string {
  // Sort mappings by order
  const sortedMappings = [...fieldMappings].sort((a, b) => a.order - b.order);

  // Generate header row
  const headers = sortedMappings.map((m) => escapeCsvValue(m.targetColumn));
  const headerRow = headers.join(",");

  // Generate data rows
  const dataRows = records.map((record) => {
    const values = sortedMappings.map((mapping) => {
      const rawValue = extractValue(record, mapping.sourceField);
      const fieldType = getFieldType(mapping.sourceField);
      const formattedValue = formatFieldValue(
        rawValue,
        mapping,
        fieldType,
        options?.defaultDateFormat,
        options?.defaultDecimalPlaces,
        options?.defaultThousandSeparator
      );
      return escapeCsvValue(formattedValue);
    });
    return values.join(",");
  });

  // Combine header and data rows
  return [headerRow, ...dataRows].join("\n");
}

/**
 * Calculate file size in bytes (for CSV content)
 */
export function calculateFileSize(content: string): number {
  return new Blob([content]).size;
}

/**
 * Generate a filename for the export
 */
export function generateExportFilename(
  module: ExportModule,
  templateName: string,
  startDate?: string,
  endDate?: string
): string {
  const sanitizedTemplate = templateName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const timestamp = new Date().toISOString().split("T")[0];
  const dateRange =
    startDate && endDate ? `_${startDate}_to_${endDate}` : "";

  return `${module}_${sanitizedTemplate}${dateRange}_${timestamp}.csv`;
}
