# CSV Auto-Parser (Shared Capability)

Shared library for CSV/XLSX parsing, column mapping (alias + Gemini AI fallback), and reusable templates.

**Location**: `src/lib/csv-parser/` — NOT a business domain. No standalone page or sidebar entry.
**Consumed by**: Any business domain that needs file import (e.g., `src/domains/sales-invoices/` for AR Reconciliation #271).

## Architecture

```
src/lib/csv-parser/
├── components/
│   ├── csv-import-modal.tsx    # Main orchestrator (Sheet drawer, 4-step flow)
│   ├── file-upload-step.tsx    # Drag-and-drop file zone
│   ├── column-mapping-step.tsx # Source → target field mapping table
│   ├── data-preview-step.tsx   # Preview first 5 mapped rows
│   ├── validation-results.tsx  # Error summary + proceed/back actions
│   └── template-manager.tsx    # CRUD for saved templates
├── hooks/
│   ├── use-csv-parser.ts       # Wraps parser-engine (File → ParsedFileInfo)
│   ├── use-import-session.ts   # Multi-step session state management
│   ├── use-column-mapping.ts   # AI suggestion fetch via API route
│   └── use-import-templates.ts # Convex query/mutation hooks for templates
├── lib/
│   ├── parser-engine.ts        # CSV (papaparse) + XLSX (SheetJS) parsing
│   ├── alias-matcher.ts        # Deterministic alias-based column matching (instant)
│   ├── sanitizer.ts            # Formula injection prevention
│   ├── fingerprint.ts          # SHA-256 header fingerprinting
│   ├── schema-definitions.ts   # Sales/Bank statement field definitions
│   └── validator.ts            # Row-level validation against schema
└── types/
    └── index.ts                # All TypeScript interfaces
```

## Integration

Embed `<CsvImportModal>` in any consuming feature:

```tsx
import { CsvImportModal } from "@/lib/csv-parser/components/csv-import-modal";

<CsvImportModal
  open={showImport}
  onOpenChange={setShowImport}
  schemaType="auto"           // or "sales_statement" | "bank_statement"
  onComplete={(result) => {
    // result.rows: MappedRow[] — standardized field names
    // result.schemaType: "sales_statement" | "bank_statement"
    // result.totalRows, validRows, skippedRows
  }}
  onCancel={() => setShowImport(false)}
  businessId={businessId}     // optional, falls back to useActiveBusiness
/>
```

## Data Flow

1. **Upload** → parser-engine detects file type, extracts headers + sample rows, sanitizes values
2. **Map** → check template fingerprint match → if none, AI suggests mappings via `/api/v1/csv-parser/suggest-mappings`
3. **Preview** → show first 5 rows with standard field names
4. **Validate** → full-file parse + schema validation → show errors or complete
5. **Complete** → `onComplete(CsvImportResult)` with mapped rows; optionally save template

## Convex

- Table: `csv_import_templates` (businessId, name, schemaType, columnMappings, headerFingerprint, sourceHeaders)
- Functions: `convex/functions/csvImportTemplates.ts` (list, getByFingerprint, create, update, remove, touchLastUsed)

## Column Mapping (Hybrid)

**Step 1 — Alias matching (instant, free, deterministic)**:
- `lib/alias-matcher.ts` normalizes headers and scores against known aliases in `schema-definitions.ts`
- Greedy assignment: best score pairs first, no double-mapping
- "Sufficient" = all required fields matched with confidence >= 0.6 AND >= 50% total coverage
- If sufficient → returns immediately, no API call

**Step 2 — Gemini AI fallback (only when alias matching is insufficient)**:
- Endpoint: `POST /api/v1/csv-parser/suggest-mappings`
- Model: `gemini-3.1-flash-lite-preview` ($0.25/$1.50 per M tokens)
- Env: `GEMINI_API_KEY` (already configured in `.env.local`)
- Falls back to alias-only results if API key missing or API errors
- Response includes `source: "alias" | "gemini" | "alias_only" | "alias_fallback"` for observability

## Schemas

- **Sales Statement**: date, orderNumber, productName, quantity, unitPrice, totalAmount, status, customer, platform, category, paymentMethod, fees (12 fields)
- **Bank Statement**: date, description, debit, credit, balance, reference, category (7 fields)

## Limits

- Max file size: 25 MB
- Max rows: 100,000
- Sample rows for AI: 100
- .xlsm files rejected (macro security)
