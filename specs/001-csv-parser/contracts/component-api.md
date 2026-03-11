# API Contracts: React Component Interface

**Branch**: `001-csv-parser` | **Date**: 2026-03-11

## Primary Component: `<CsvImportModal>`

The main entry point for consuming features. Renders as a Sheet (drawer) overlay.

```
Props:
  open: boolean — Controls visibility
  onOpenChange: (open: boolean) => void — Callback when modal opens/closes
  schemaType: "sales_statement" | "bank_statement" | "auto" — Which schema to map against (default: "auto")
  onComplete: (result: CsvImportResult) => void — Called when user confirms import with mapped data
  onCancel: () => void — Called when user dismisses the modal

Usage:
  <CsvImportModal
    open={showImport}
    onOpenChange={setShowImport}
    schemaType="sales_statement"
    onComplete={(result) => {
      // result.rows contains mapped data
      // result.schemaType tells which schema was used
      // result.templateId if a saved template was used
    }}
    onCancel={() => setShowImport(false)}
  />
```

## Output Type: `CsvImportResult`

The data structure returned to consuming features via `onComplete`.

```
CsvImportResult:
  rows: MappedRow[] — All valid rows with data mapped to standard field names
  schemaType: "sales_statement" | "bank_statement" — The confirmed schema type
  totalRows: number — Total rows in source file
  validRows: number — Rows that passed validation
  skippedRows: number — Rows skipped due to validation errors
  templateId: string | null — ID of the template used (if any)
  sourceFileName: string — Original filename for reference

MappedRow:
  Record<string, string | number | null> — Keys are standard field names, values are parsed cell data
  Example: { orderReference: "ORD-001", orderDate: "2025-10-31", grossAmount: 150.00, currency: "MYR" }
```

## Hook: `useCsvImportTemplates`

Convenience hook for consuming features that want to show template info.

```
Args:
  businessId: string | undefined
  schemaType: "sales_statement" | "bank_statement" (optional)

Returns:
  templates: CsvImportTemplate[]
  isLoading: boolean
```
