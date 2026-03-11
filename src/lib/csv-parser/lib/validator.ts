import type {
  ColumnMapping,
  MappedRow,
  SchemaType,
  ValidationError,
  ValidationResult,
} from "../types";
import { getSchemaFields } from "./schema-definitions";

/**
 * Validate all mapped rows against the schema field definitions.
 * Returns a ValidationResult with row-level errors.
 */
export function validateMappedData(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  schemaType: SchemaType
): ValidationResult {
  const fields = getSchemaFields(schemaType);
  const errors: ValidationError[] = [];

  // Build reverse lookup: targetField → sourceHeader
  const targetToSource = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.targetField !== "unmapped") {
      targetToSource.set(mapping.targetField, mapping.sourceHeader);
    }
  }

  // Check required fields are mapped
  const requiredFields = fields.filter((f) => f.required);
  const unmappedRequired = requiredFields.filter(
    (f) => !targetToSource.has(f.name)
  );

  // If required fields aren't even mapped, every row fails
  for (const field of unmappedRequired) {
    errors.push({
      row: 0,
      column: "(unmapped)",
      targetField: field.name,
      errorType: "missing_required",
      message: `Required field "${field.label}" is not mapped to any column.`,
      value: "",
    });
  }

  // Validate each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-indexed for display

    for (const field of fields) {
      const sourceHeader = targetToSource.get(field.name);
      if (!sourceHeader) continue; // unmapped field — skip (already caught above for required)

      const value = row[sourceHeader] ?? "";
      const trimmed = String(value).trim();

      // Check required fields have values
      if (field.required && trimmed === "") {
        errors.push({
          row: rowNumber,
          column: sourceHeader,
          targetField: field.name,
          errorType: "missing_required",
          message: `Required field "${field.label}" is empty.`,
          value: trimmed,
        });
        continue;
      }

      // Skip type validation for empty optional fields
      if (trimmed === "") continue;

      // Type validation
      if (field.type === "number" && !isValidNumber(trimmed)) {
        errors.push({
          row: rowNumber,
          column: sourceHeader,
          targetField: field.name,
          errorType: "type_mismatch",
          message: `"${field.label}" expects a number but got "${trimmed}".`,
          value: trimmed,
        });
      }

      if (field.type === "date" && !isValidDate(trimmed)) {
        errors.push({
          row: rowNumber,
          column: sourceHeader,
          targetField: field.name,
          errorType: "format_error",
          message: `"${field.label}" expects a date but got "${trimmed}".`,
          value: trimmed,
        });
      }
    }
  }

  const rowsWithErrors = new Set(errors.filter((e) => e.row > 0).map((e) => e.row));
  const validRows = rows.length - rowsWithErrors.size;

  return {
    totalRows: rows.length,
    validRows,
    errors,
  };
}

/**
 * Apply confirmed mappings to raw rows, producing MappedRow[] with standard field names as keys.
 * Optionally filter out invalid rows based on validation result.
 */
export function applyMappings(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  validationResult?: ValidationResult
): MappedRow[] {
  const invalidRows = validationResult
    ? new Set(validationResult.errors.filter((e) => e.row > 0).map((e) => e.row))
    : new Set<number>();

  const activeMappings = mappings.filter((m) => m.targetField !== "unmapped");

  return rows
    .map((row, index) => {
      const rowNumber = index + 1;
      if (invalidRows.has(rowNumber)) return null;

      const mapped: MappedRow = {};
      for (const mapping of activeMappings) {
        const rawValue = row[mapping.sourceHeader] ?? "";
        mapped[mapping.targetField] = parseFieldValue(rawValue.trim());
      }
      return mapped;
    })
    .filter((row): row is MappedRow => row !== null);
}

function parseFieldValue(value: string): string | number | null {
  if (value === "") return null;

  // Try to parse as number (remove commas for thousand separators)
  const cleaned = value.replace(/,/g, "");
  const num = Number(cleaned);
  if (!isNaN(num) && cleaned !== "") return num;

  return value;
}

function isValidNumber(value: string): boolean {
  // Remove common thousand separators and currency symbols
  const cleaned = value.replace(/[,\s$£€¥₹RM]/g, "").trim();
  if (cleaned === "") return false;
  return !isNaN(Number(cleaned));
}

function isValidDate(value: string): boolean {
  // Accept common date formats
  // ISO: 2025-01-31
  // US: 01/31/2025, 1/31/2025
  // EU: 31/01/2025, 31.01.2025
  // Text: Jan 31, 2025 / 31 Jan 2025
  const date = new Date(value);
  if (!isNaN(date.getTime())) return true;

  // Try DD/MM/YYYY pattern (common in SEA)
  const ddmmyyyy = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
  if (ddmmyyyy.test(value.trim())) return true;

  return false;
}
