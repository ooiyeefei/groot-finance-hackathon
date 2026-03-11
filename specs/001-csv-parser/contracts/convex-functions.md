# API Contracts: Convex Functions

**Branch**: `001-csv-parser` | **Date**: 2026-03-11

## Table: `csv_import_templates`

Location: `convex/functions/csvImportTemplates.ts`

### Query: `list`

List all import templates for a business, optionally filtered by schema type.

```
Args:
  businessId: string (required)
  schemaType: "sales_statement" | "bank_statement" (optional)

Returns:
  { templates: CsvImportTemplate[] }

Auth: Requires authenticated user with business membership.
```

### Query: `getByFingerprint`

Look up a template by header fingerprint for auto-detection.

```
Args:
  businessId: string (required)
  headerFingerprint: string (required)

Returns:
  CsvImportTemplate | null

Auth: Requires authenticated user with business membership.
```

### Mutation: `create`

Save a new import template from confirmed column mappings.

```
Args:
  businessId: string (required)
  name: string (required)
  schemaType: "sales_statement" | "bank_statement" (required)
  columnMappings: ColumnMapping[] (required)
  headerFingerprint: string (required)
  sourceHeaders: string[] (required)

Returns:
  { templateId: Id<"csv_import_templates"> }

Auth: Requires authenticated user with business membership.
Side effects: If a template with the same (businessId, headerFingerprint) exists, updates it instead of creating a duplicate.
```

### Mutation: `update`

Update an existing template's name or mappings.

```
Args:
  templateId: Id<"csv_import_templates"> (required)
  name: string (optional)
  columnMappings: ColumnMapping[] (optional)
  schemaType: "sales_statement" | "bank_statement" (optional)

Returns:
  { success: true }

Auth: Requires authenticated user with business membership for the template's business.
```

### Mutation: `remove`

Delete a saved template.

```
Args:
  templateId: Id<"csv_import_templates"> (required)

Returns:
  { success: true }

Auth: Requires authenticated user with business membership for the template's business.
```

### Mutation: `touchLastUsed`

Update the lastUsedAt timestamp when a template is applied to an upload.

```
Args:
  templateId: Id<"csv_import_templates"> (required)

Returns:
  { success: true }

Auth: Requires authenticated user with business membership.
```

---

## API Route: AI Column Mapping

Location: `src/app/api/v1/csv-parser/suggest-mappings/route.ts`

### POST `/api/v1/csv-parser/suggest-mappings`

Send column headers and sample data to AI for mapping suggestions.

```
Request Body (JSON):
  headers: string[] (required) — Column headers from the parsed file
  sampleRows: Record<string, string>[] (required) — First 5 rows as key-value pairs
  schemaType: "sales_statement" | "bank_statement" | "auto" (optional, default "auto")

Response (JSON):
  detectedSchemaType: "sales_statement" | "bank_statement"
  schemaConfidence: number (0-1)
  mappings: Array of {
    sourceHeader: string
    targetField: string | "unmapped"
    confidence: number (0-1)
  }

Auth: Clerk session required.
Errors:
  401 — Unauthorized
  400 — Missing headers or sampleRows
  500 — AI service unavailable
```
