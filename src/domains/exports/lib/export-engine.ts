/**
 * Unified Export Engine
 *
 * Replaces csv-generator.ts with support for both flat CSV and
 * hierarchical MASTER/DETAIL formats. Used by all 4 export modules.
 */

import type { FieldMapping, PrebuiltTemplate, ExportModule } from "../types";
import {
  extractValue,
  formatFieldValue,
  getFieldType,
  escapeDelimitedValue,
} from "./value-extractor";

// ============================================
// FORMAT OPTIONS
// ============================================

export interface FormatOptions {
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: "comma" | "none";
}

// ============================================
// FLAT EXPORT (CSV)
// ============================================

/**
 * Generate a flat export: one header row + one data row per record.
 * For records with line items, each line item produces a separate row
 * with header fields repeated.
 */
export function generateFlatExport(
  records: Record<string, unknown>[],
  fieldMappings: FieldMapping[],
  delimiter: string = ",",
  options?: FormatOptions
): string {
  const sortedMappings = [...fieldMappings].sort((a, b) => a.order - b.order);

  // Header row
  const headers = sortedMappings.map((m) =>
    escapeDelimitedValue(m.targetColumn, delimiter)
  );
  const headerRow = headers.join(delimiter);

  // Check if any mappings reference lineItem fields
  const hasLineItemFields = sortedMappings.some((m) =>
    m.sourceField.startsWith("lineItem.")
  );

  const dataRows: string[] = [];

  for (const record of records) {
    if (hasLineItemFields && Array.isArray(record.journalLines)) {
      // Expand: one row per journal line, header fields repeated
      for (const line of record.journalLines as Record<string, unknown>[]) {
        const mergedRecord = { ...record, lineItem: line };
        dataRows.push(formatRow(mergedRecord, sortedMappings, delimiter, options));
      }
    } else if (hasLineItemFields && Array.isArray(record.lineItems)) {
      // Expand: one row per line item
      for (const line of record.lineItems as Record<string, unknown>[]) {
        const mergedRecord = { ...record, lineItem: line };
        dataRows.push(formatRow(mergedRecord, sortedMappings, delimiter, options));
      }
    } else {
      dataRows.push(formatRow(record, sortedMappings, delimiter, options));
    }
  }

  return [headerRow, ...dataRows].join("\n");
}

// ============================================
// HIERARCHICAL EXPORT (MASTER/DETAIL)
// ============================================

/**
 * Generate a hierarchical export: MASTER row + DETAIL rows per record.
 * Used by SQL Accounting GL_JE, AP_PI, AR_IV formats.
 */
export function generateHierarchicalExport(
  records: Record<string, unknown>[],
  masterFields: FieldMapping[],
  detailFields: FieldMapping[],
  delimiter: string = ";",
  options?: FormatOptions
): string {
  const sortedMaster = [...masterFields].sort((a, b) => a.order - b.order);
  const sortedDetail = [...detailFields].sort((a, b) => a.order - b.order);

  const rows: string[] = [];

  for (const record of records) {
    // MASTER row
    rows.push(formatRow(record, sortedMaster, delimiter, options));

    // DETAIL rows — one per journal line or line item
    const lines = (record.journalLines || record.lineItems) as
      | Record<string, unknown>[]
      | undefined;
    if (Array.isArray(lines)) {
      for (const line of lines) {
        const mergedRecord = { ...record, lineItem: line };
        rows.push(formatRow(mergedRecord, sortedDetail, delimiter, options));
      }
    }
  }

  return rows.join("\n");
}

// ============================================
// UNIFIED DISPATCHER
// ============================================

/**
 * Generate export output based on the template's format type.
 * Dispatches to flat or hierarchical formatter.
 */
export function generateExport(
  records: Record<string, unknown>[],
  template: PrebuiltTemplate,
  options?: FormatOptions
): string {
  const mergedOptions: FormatOptions = {
    defaultDateFormat: template.defaultDateFormat || options?.defaultDateFormat,
    defaultDecimalPlaces:
      template.defaultDecimalPlaces ?? options?.defaultDecimalPlaces,
    defaultThousandSeparator: options?.defaultThousandSeparator,
  };

  if (
    template.formatType === "hierarchical" &&
    template.masterFields &&
    template.detailFields
  ) {
    return generateHierarchicalExport(
      records,
      template.masterFields,
      template.detailFields,
      template.delimiter,
      mergedOptions
    );
  }

  return generateFlatExport(
    records,
    template.fieldMappings,
    template.delimiter,
    mergedOptions
  );
}

// ============================================
// FILENAME GENERATION
// ============================================

export function generateExportFilename(
  module: ExportModule,
  templateName: string,
  fileExtension: string = ".csv",
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

  return `${module}_${sanitizedTemplate}${dateRange}_${timestamp}${fileExtension}`;
}

// ============================================
// FILE SIZE CALCULATION
// ============================================

export function calculateFileSize(content: string): number {
  return new Blob([content]).size;
}

// ============================================
// INTERNAL HELPERS
// ============================================

function formatRow(
  record: Record<string, unknown>,
  mappings: FieldMapping[],
  delimiter: string,
  options?: FormatOptions
): string {
  const values = mappings.map((mapping) => {
    // Handle literal values (e.g., "MASTER", "DETAIL", empty string, number 0)
    if (mapping.sourceField.startsWith('"') && mapping.sourceField.endsWith('"')) {
      // Literal string value
      const literal = mapping.sourceField.slice(1, -1);
      return escapeDelimitedValue(literal, delimiter);
    }

    const rawValue = extractValue(record, mapping.sourceField);
    const fieldType = getFieldType(mapping.sourceField);

    // Special handling for boolean → T/F conversion
    if (typeof rawValue === "boolean") {
      return rawValue ? "T" : "F";
    }

    const formattedValue = formatFieldValue(
      rawValue,
      mapping,
      fieldType,
      options?.defaultDateFormat,
      options?.defaultDecimalPlaces,
      options?.defaultThousandSeparator
    );
    return escapeDelimitedValue(formattedValue, delimiter);
  });
  return values.join(delimiter);
}
