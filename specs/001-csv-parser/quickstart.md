# Quickstart: CSV Auto-Parser

**Branch**: `001-csv-parser` | **Date**: 2026-03-11

## Prerequisites

- Node.js 20.x
- Existing Groot Finance dev environment (`npm install` + `npx convex dev`)
- Qwen AI endpoint running (Modal)

## New Dependencies

```bash
npm install papaparse xlsx
npm install -D @types/papaparse
```

- `papaparse` — CSV parsing with delimiter auto-detection
- `xlsx` (SheetJS) — Excel file parsing

## Project Structure

```
src/domains/csv-parser/
├── components/
│   ├── csv-import-modal.tsx          # Main entry point (Sheet/drawer)
│   ├── file-upload-step.tsx          # Step 1: File selection + parsing
│   ├── column-mapping-step.tsx       # Step 2: Review/edit AI mappings
│   ├── data-preview-step.tsx         # Step 3: Preview mapped data
│   ├── validation-results.tsx        # Validation error display
│   └── template-manager.tsx          # Template CRUD (P2)
├── hooks/
│   ├── use-csv-parser.ts             # File parsing logic (papaparse/xlsx)
│   ├── use-column-mapping.ts         # AI mapping + manual adjustment state
│   ├── use-import-templates.ts       # Convex template CRUD hooks
│   └── use-import-session.ts         # In-memory session state management
├── lib/
│   ├── parser-engine.ts              # CSV/XLSX parsing, delimiter detection
│   ├── fingerprint.ts                # Header fingerprint generation (SHA-256)
│   ├── sanitizer.ts                  # Formula injection prevention
│   ├── validator.ts                  # Row validation against schema
│   └── schema-definitions.ts         # Sales Statement + Bank Statement field schemas
├── types/
│   └── index.ts                      # All TypeScript interfaces
└── CLAUDE.md                         # Domain documentation

convex/functions/
└── csvImportTemplates.ts             # Convex queries + mutations

src/app/api/v1/csv-parser/
└── suggest-mappings/route.ts         # AI mapping endpoint
```

## How to Use (for consuming features)

```tsx
import { CsvImportModal } from '@/domains/csv-parser/components/csv-import-modal';

function MyFeaturePage() {
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <Button onClick={() => setShowImport(true)}>Import from CSV</Button>
      <CsvImportModal
        open={showImport}
        onOpenChange={setShowImport}
        schemaType="sales_statement"
        onComplete={(result) => {
          console.log(`Imported ${result.validRows} rows`);
          // Do something with result.rows
          setShowImport(false);
        }}
        onCancel={() => setShowImport(false)}
      />
    </>
  );
}
```

## Development Workflow

1. **Schema first**: Add `csv_import_templates` table to `convex/schema.ts`
2. **Deploy schema**: `npx convex deploy --yes`
3. **Pure lib**: Build parser engine, fingerprint, sanitizer, validator (no UI dependency)
4. **Convex functions**: CRUD for templates
5. **AI endpoint**: Column mapping suggestion route
6. **UI components**: Build step-by-step from file upload → mapping → preview
7. **Integration**: Wire everything together in `CsvImportModal`
8. **Build check**: `npm run build` must pass
