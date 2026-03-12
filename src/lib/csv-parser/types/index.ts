// CSV Auto-Parser Type Definitions

export type SchemaType = "sales_statement" | "bank_statement" | "purchase_order" | "goods_received_note";

export type ImportSessionStatus =
  | "parsing"
  | "mapping"
  | "previewing"
  | "validating"
  | "complete";

export type MappingStatus = "suggested" | "confirmed" | "unmapped";

export interface ColumnMapping {
  sourceHeader: string;
  targetField: string; // standard field name or "unmapped"
  confidence: number; // 0-1
  order: number;
}

export interface CsvImportResult {
  rows: MappedRow[];
  schemaType: SchemaType;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  templateId: string | null;
  sourceFileName: string;
}

export type MappedRow = Record<string, string | number | null>;

export interface ParsedFileInfo {
  fileName: string;
  fileSize: number;
  fileType: "csv" | "xlsx";
  delimiter?: string; // CSV only
  headers: string[];
  sampleRows: Record<string, string>[];
  sheetNames?: string[]; // XLSX only
  totalRowCount: number;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errors: ValidationError[];
}

export interface ValidationError {
  row: number;
  column: string;
  targetField: string;
  errorType: "missing_required" | "type_mismatch" | "format_error";
  message: string;
  value: string;
}

export interface AiMappingSuggestion {
  detectedSchemaType: SchemaType;
  schemaConfidence: number;
  mappings: Array<{
    sourceHeader: string;
    targetField: string;
    confidence: number;
  }>;
}

export interface ImportSession {
  file: File | null;
  fileInfo: ParsedFileInfo | null;
  detectedSchemaType: SchemaType | null;
  columnMappings: ColumnMapping[];
  matchedTemplateId: string | null;
  matchedTemplateName: string | null;
  validationResult: ValidationResult | null;
  status: ImportSessionStatus;
  selectedSheet?: string;
}

export interface SchemaField {
  name: string;
  label: string;
  type: "string" | "number" | "date";
  required: boolean;
  aliases: string[]; // common column name variations for AI prompt
}

export interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaType?: SchemaType | "auto";
  onComplete: (result: CsvImportResult) => void;
  onCancel: () => void;
  businessId?: string;
}
