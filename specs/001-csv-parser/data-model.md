# Data Model: CSV Auto-Parser

**Branch**: `001-csv-parser` | **Date**: 2026-03-11

## Entities

### 1. CsvImportTemplate (Persisted — Convex table: `csv_import_templates`)

The saved mapping configuration for a specific file format. Enables auto-detection and instant mapping on repeat uploads.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | Reference (businesses) | Yes | Owning business (multi-tenant isolation) |
| name | String | Yes | User-defined name (e.g., "Shopee Monthly Statement") |
| schemaType | Enum: "sales_statement" \| "bank_statement" | Yes | Which standard field schema this template maps to |
| columnMappings | Array of ColumnMapping | Yes | The confirmed source→target field mappings |
| headerFingerprint | String (SHA-256 hash) | Yes | Hash of sorted, lowercased column headers for auto-detection |
| sourceHeaders | Array of String | Yes | Original column headers from the source file (for display/editing) |
| createdBy | Reference (users) | Yes | User who created the template |
| updatedBy | Reference (users) | No | User who last modified the template |
| lastUsedAt | Timestamp | No | When the template was last applied to an upload |

**Indexes**:
- `by_businessId` — list all templates for a business
- `by_businessId_fingerprint` — look up template by fingerprint (auto-detect)
- `by_businessId_schemaType` — filter templates by schema type

**Uniqueness**: `(businessId, headerFingerprint)` — one template per unique column set per business. If a user saves a new template with the same fingerprint, it updates the existing one.

### 2. ColumnMapping (Embedded object — not a separate table)

A single source-to-target field pairing within a template.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sourceHeader | String | Yes | Original column name from the CSV (e.g., "Order Total (MYR)") |
| targetField | String | Yes | Standard field name (e.g., "grossAmount") or "unmapped" |
| confidence | Number (0-1) | No | AI confidence score from initial mapping suggestion |
| order | Number | Yes | Display/processing order |

### 3. ImportSession (Transient — in-memory React state only)

Tracks the state of an in-progress import. Never persisted to database.

| Field | Type | Description |
|-------|------|-------------|
| file | File object | The uploaded file reference |
| fileName | String | Original filename |
| fileSize | Number | Size in bytes |
| fileType | "csv" \| "xlsx" | Detected file type |
| delimiter | String | Detected delimiter (CSV only) |
| headers | Array of String | Extracted column headers |
| sampleRows | Array of Record | First 100 rows of parsed data |
| detectedSchemaType | Enum | AI-suggested schema type |
| columnMappings | Array of ColumnMapping | Current mapping state (AI-suggested or template-applied) |
| matchedTemplateId | String or null | If a saved template was auto-matched |
| validationResults | ValidationResult or null | Row-level validation after mapping confirmation |
| status | Enum | Current step: "parsing" \| "mapping" \| "previewing" \| "validating" \| "complete" |

### 4. ValidationResult (Transient — in-memory)

| Field | Type | Description |
|-------|------|-------------|
| totalRows | Number | Total rows in file |
| validRows | Number | Rows passing all validation rules |
| errors | Array of ValidationError | Row-level error details |

### 5. ValidationError (Transient — in-memory)

| Field | Type | Description |
|-------|------|-------------|
| row | Number | Row number (1-indexed) |
| column | String | Source column header |
| targetField | String | Mapped target field |
| errorType | Enum: "missing_required" \| "type_mismatch" \| "format_error" | Error category |
| message | String | Human-readable error description |
| value | String | The problematic cell value |

## Standard Field Schemas

### Sales Statement Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| orderReference | String | Yes | Order ID, Transaction ID, Ref No |
| orderDate | Date | Yes | Order Date, Transaction Date |
| productName | String | No | Item Name, Product, Description |
| productCode | String | No | SKU, Item Code |
| quantity | Number | No | Qty, Quantity |
| unitPrice | Number | No | Unit Price, Price |
| grossAmount | Number | Yes | Total, Gross, Amount |
| platformFee | Number | No | Commission, Fee, Service Charge |
| netAmount | Number | No | Net, Settlement, Payout |
| currency | String | No | Currency, CCY |
| customerName | String | No | Customer, Buyer |
| paymentMethod | String | No | Payment Type, Method |

### Bank Statement Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| transactionDate | Date | Yes | Transaction Date, Date |
| description | String | Yes | Description, Narrative, Details |
| debitAmount | Number | No | Debit, Withdrawal |
| creditAmount | Number | No | Credit, Deposit |
| balance | Number | No | Balance, Running Balance |
| reference | String | No | Reference, Ref No, Cheque No |
| transactionType | String | No | Type (TRF, ATM, POS, etc.) |

## Relationships

```
Business 1──────────* CsvImportTemplate
User ───────creates──* CsvImportTemplate
CsvImportTemplate 1──* ColumnMapping (embedded)
```

## State Transitions

### Import Session Flow

```
[File Selected] → parsing → mapping → previewing → validating → complete
                     │           │          │            │
                     ▼           ▼          ▼            ▼
                  (error)    (adjust)   (back to     (proceed with
                              mappings)  mapping)     valid rows)
```

- `parsing`: File read, delimiter detected, headers extracted, sample rows parsed
- `mapping`: AI suggests mappings (or template auto-applied). User reviews/adjusts.
- `previewing`: User sees first 5 rows with mapped field names
- `validating`: Full file validated against schema rules
- `complete`: Mapped data returned to consuming feature via `onComplete` callback
