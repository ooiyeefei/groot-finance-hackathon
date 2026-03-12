import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedFileInfo } from "../types";
import { sanitizeCellValue } from "./sanitizer";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_ROW_COUNT = 100_000;
const SAMPLE_ROW_COUNT = 100;

export interface ParseOptions {
  selectedSheet?: string;
  maxSampleRows?: number;
}

export function detectFileType(
  file: File
): "csv" | "xlsx" | "xlsm" | "unknown" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt"))
    return "csv";
  if (name.endsWith(".xlsm")) return "xlsm";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  return "unknown";
}

export function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File exceeds the 25 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB). Please use a smaller file.`;
  }
  return null;
}

export async function parseFile(
  file: File,
  options: ParseOptions = {}
): Promise<ParsedFileInfo> {
  const fileType = detectFileType(file);

  if (fileType === "xlsm") {
    throw new Error(
      "Macro-enabled Excel files (.xlsm) are not supported. Please re-save as .xlsx without macros."
    );
  }

  if (fileType === "unknown") {
    throw new Error(
      "Unsupported file format. Please upload a .csv or .xlsx file."
    );
  }

  const sizeError = validateFileSize(file);
  if (sizeError) throw new Error(sizeError);

  if (fileType === "csv") {
    return parseCsvFile(file, options);
  }
  return parseXlsxFile(file, options);
}

async function parseCsvFile(
  file: File,
  options: ParseOptions
): Promise<ParsedFileInfo> {
  const text = await file.text();
  const maxSample = options.maxSampleRows ?? SAMPLE_ROW_COUNT;

  let result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    preview: maxSample,
    delimiter: "", // Auto-detect (empty string triggers auto-detection)
    delimitersToGuess: [',', '\t', '|', ';'], // Try these delimiters in order
  });

  // Debug: Log detected delimiter and field count
  console.log('[CSV Parser] Detected delimiter:', result.meta.delimiter);
  console.log('[CSV Parser] Field count:', result.meta.fields?.length);
  console.log('[CSV Parser] Fields:', result.meta.fields);

  if (!result.meta.fields || result.meta.fields.length === 0) {
    throw new Error(
      "Could not detect column headers. The file may be empty or incorrectly formatted."
    );
  }

  // If only 1 field detected but it contains commas, try to recover
  if (result.meta.fields.length === 1 && result.meta.fields[0].includes(',')) {
    const firstField = result.meta.fields[0];
    const commaCount = (firstField.match(/,/g) || []).length;

    // If there are many commas, this might be Google Sheets copy/paste issue
    // Try forcing comma delimiter
    if (commaCount > 5) {
      console.log('[CSV Parser] Detected single column with many commas, trying to force comma delimiter...');

      const retryResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        preview: maxSample,
        delimiter: ',', // Force comma delimiter
        quoteChar: '"',
        escapeChar: '"',
      });

      // If retry gives us more columns, use it
      if (retryResult.meta.fields && retryResult.meta.fields.length > 1) {
        console.log('[CSV Parser] Retry successful! Field count:', retryResult.meta.fields.length);
        result = retryResult; // Use the retry result
      } else {
        throw new Error(
          `CSV format error: All data appears in one column (${commaCount} commas detected). ` +
          `This usually happens when copy/pasting CSV text into Google Sheets. ` +
          `To fix: In Google Sheets, use "File > Import > Upload" instead of copy/paste, ` +
          `or download the original CSV file directly without modifying it.`
        );
      }
    } else {
      throw new Error(
        "Delimiter detection failed. The file appears to have comma-separated values but they were not parsed correctly. Please ensure the file is a valid CSV with comma delimiters."
      );
    }
  }

  // Count total rows (parse without preview for count only)
  const countResult = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  });
  // Subtract 1 for header row
  const totalRowCount = Math.max(0, countResult.data.length - 1);

  if (totalRowCount > MAX_ROW_COUNT) {
    throw new Error(
      `File exceeds the 100,000 row limit (${totalRowCount.toLocaleString()} rows). Please split the file.`
    );
  }

  if (totalRowCount === 0) {
    throw new Error("File contains no data rows.");
  }

  const headers = result.meta.fields || [];

  // Final validation (should never happen due to earlier checks, but TypeScript needs this)
  if (headers.length === 0) {
    throw new Error("No column headers found in CSV file.");
  }

  const sampleRows = (result.data as Record<string, string>[]).map((row) => {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCellValue(String(value ?? ""));
    }
    return sanitized;
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: "csv",
    delimiter: result.meta.delimiter,
    headers,
    sampleRows,
    totalRowCount,
  };
}

async function parseXlsxFile(
  file: File,
  options: ParseOptions
): Promise<ParsedFileInfo> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("Excel file contains no sheets.");
  }

  const selectedSheet = options.selectedSheet ?? sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheet}" not found in the Excel file.`);
  }

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    worksheet,
    { defval: "" }
  );

  if (jsonData.length === 0) {
    throw new Error("File contains no data rows.");
  }

  if (jsonData.length > MAX_ROW_COUNT) {
    throw new Error(
      `File exceeds the 100,000 row limit (${jsonData.length.toLocaleString()} rows). Please split the file.`
    );
  }

  const headers = Object.keys(jsonData[0]);
  if (headers.length === 0) {
    throw new Error("Could not detect column headers in the selected sheet.");
  }

  const maxSample = options.maxSampleRows ?? SAMPLE_ROW_COUNT;
  const sampleRows = jsonData.slice(0, maxSample).map((row) => {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCellValue(String(value ?? ""));
    }
    return sanitized;
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: "xlsx",
    headers,
    sampleRows,
    sheetNames: sheetNames.length > 1 ? sheetNames : undefined,
    totalRowCount: jsonData.length,
  };
}

/**
 * Parse all rows from a file (used after mapping confirmation for full validation/import).
 * Returns all data rows as key-value records with sanitized values.
 */
export async function parseAllRows(
  file: File,
  options: ParseOptions = {}
): Promise<Record<string, string>[]> {
  const fileType = detectFileType(file);

  if (fileType === "csv") {
    const text = await file.text();
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });
    return (result.data as Record<string, string>[]).map((row) => {
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        sanitized[key] = sanitizeCellValue(String(value ?? ""));
      }
      return sanitized;
    });
  }

  // xlsx
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet = options.selectedSheet ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    worksheet,
    { defval: "" }
  );

  return jsonData.map((row) => {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCellValue(String(value ?? ""));
    }
    return sanitized;
  });
}
