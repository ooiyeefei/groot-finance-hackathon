# Implementation Plan: Master Accounting Export Integration

**Branch**: `001-master-accounting-export` | **Date**: 2026-02-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-master-accounting-export/spec.md`

## Summary

Add Master Accounting (MasterITEC) as a new export target in Groot Finance's existing export system. This creates 7 prebuilt templates (4 transaction types + 3 master data types) that generate pipe-delimited `.txt` files matching Master Accounting's import format. Includes a new inline code mapping screen that lets users map Groot Finance categories/vendors to Master Accounting codes, with mappings persisted per business for reuse.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2
**Storage**: Convex (new `export_code_mappings` table), Convex File Storage (export files)
**Testing**: Manual validation against Master Accounting import + unit tests for format generation
**Target Platform**: Web (Next.js), same as existing export feature
**Project Type**: Web application (full-stack Next.js + Convex)
**Performance Goals**: Export and download within 30 seconds for 1,000 records (SC-006)
**Constraints**: Pipe-delimited format must exactly match Master Accounting's import specification. No new AWS infrastructure.
**Scale/Scope**: ~20-100 code mappings per business. Up to 10,000 records per export.

## Constitution Check

*GATE: Constitution file uses default template (no project-specific gates defined). Proceeding with standard best practices.*

- Simplicity: Extending existing export engine rather than rebuilding — minimal new code
- Test coverage: Format output validation for each template type
- Security: Code mapping CRUD scoped to business via existing role-based access (finance_admin/owner)

## Project Structure

### Documentation (this feature)

```text
specs/001-master-accounting-export/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technical research & decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/           # Phase 1: API & template contracts
│   ├── convex-functions.md
│   └── prebuilt-templates.md
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
# New files
convex/functions/exportCodeMappings.ts          # CRUD for export_code_mappings table
src/domains/exports/components/code-mapping-step.tsx  # Inline mapping screen
src/domains/exports/hooks/use-code-mappings.ts  # React hook for code mappings

# Modified files
convex/schema.ts                                # Add export_code_mappings table
src/domains/exports/types/index.ts              # Extend PrebuiltTemplate interface
src/domains/exports/lib/prebuilt-templates.ts   # Add 7 Master Accounting templates
src/domains/exports/lib/export-engine.ts        # Section header + pipe sanitization
src/domains/exports/lib/value-extractor.ts      # Pipe character handling
src/domains/exports/components/exports-page-content.tsx  # Insert mapping step
```

**Structure Decision**: Extends the existing `src/domains/exports/` domain structure. No new domains or top-level directories. New Convex functions follow existing `convex/functions/` pattern.

## Implementation Phases

### Phase 1: Schema, Types & Engine (foundation)

**Goal**: Establish the data layer and format generation capability.

1. **Add `export_code_mappings` table to `convex/schema.ts`**
   - Fields: businessId, targetSystem, mappingType, sourceValue, targetCode, isDefault, createdBy, updatedBy, updatedAt
   - Indexes: by_business_system, by_business_type, by_business_source
   - See [data-model.md](./data-model.md) for full schema

2. **Extend `PrebuiltTemplate` interface in `types/index.ts`**
   - Add: `sectionHeader?: string`, `includeColumnHeaders?: boolean`, `requiresCodeMapping?: boolean`, `codeMappingTypes?: string[]`

3. **Enhance `export-engine.ts`**
   - `generateHierarchicalExport()`: If `sectionHeader` is provided, prepend it as the first line before data rows
   - `generateFlatExport()`: If `includeColumnHeaders` is `false`, skip the header row
   - `generateExport()`: Pass new options from template to formatters

4. **Enhance `value-extractor.ts`**
   - Add pipe character sanitization in `escapeDelimitedValue()` — replace `|` with `-` when delimiter is `|`

5. **Deploy Convex** after schema changes: `npx convex deploy --yes`

### Phase 2: Prebuilt Templates (format definitions)

**Goal**: Define the 7 Master Accounting templates with exact field mappings.

1. **4 Transaction templates** in `prebuilt-templates.ts`:
   - `master-accounting-purchases-bill` (module: expense) — Purchases Book-Bill
   - `master-accounting-cashbook-payment` (module: expense) — Cash Book-Payment
   - `master-accounting-sales-invoice` (module: invoice) — Sales Book-Invoice
   - `master-accounting-journal` (module: accounting) — Journal Book

2. **3 Master Data templates** in `prebuilt-templates.ts`:
   - `master-accounting-chart-of-account` (module: accounting) — Chart of Account
   - `master-accounting-creditor` (module: expense) — Creditor/Supplier
   - `master-accounting-debtor` (module: invoice) — Debtor/Customer

3. **Register templates** in `EXPENSE_TEMPLATES`, `INVOICE_TEMPLATES`, `ACCOUNTING_TEMPLATES` arrays

See [contracts/prebuilt-templates.md](./contracts/prebuilt-templates.md) for exact field definitions.

### Phase 3: Code Mapping Backend (Convex functions)

**Goal**: CRUD operations for persisting code mappings.

1. **Create `convex/functions/exportCodeMappings.ts`**:
   - `getCodeMappings` (query) — fetch all mappings for a business + target system
   - `upsertCodeMapping` (mutation) — create/update single mapping
   - `upsertCodeMappingsBatch` (mutation) — batch save from mapping screen
   - `deleteCodeMapping` (mutation) — remove a mapping

2. **Auth & validation**:
   - All operations require finance_admin or owner role
   - `targetCode` max 20 characters
   - Enforce uniqueness on `businessId + targetSystem + mappingType + sourceValue`
   - Only one `isDefault: true` per `businessId + targetSystem + mappingType`

See [contracts/convex-functions.md](./contracts/convex-functions.md) for full API contracts.

### Phase 4: Code Mapping UI (inline mapping screen)

**Goal**: New step in export flow where users map Groot Finance values to Master Accounting codes.

1. **Create `code-mapping-step.tsx`**:
   - Renders when selected template has `requiresCodeMapping: true`
   - Shows a table grouped by `mappingType`:
     - **Account Codes**: Lists distinct categories from selected records → input for Master Accounting Account Code
     - **Creditor Codes**: Lists distinct vendor names → input for Creditor Code
     - **Debtor Codes**: Lists distinct customer names → input for Debtor Code
   - Auto-fills from saved mappings (fetched via `getCodeMappings`)
   - Default fallback code input at top of each group
   - "Save & Continue" button → batch upserts all mappings, then proceeds to filters step
   - "Skip" option → uses defaults only (warns if no defaults configured)

2. **Create `use-code-mappings.ts`** hook:
   - Fetches existing mappings for the business
   - Provides save/upsert functions
   - Manages local state for the mapping form

3. **Modify `exports-page-content.tsx`**:
   - Insert mapping step (step 2.5) between template selection (step 2) and filters (step 3)
   - Only shown when `requiresCodeMapping` is true on selected template
   - Step numbers: Module → Template → **Code Mapping** → Filters & Preview → Export

### Phase 5: Integration & Testing

**Goal**: Wire everything together and validate.

1. **End-to-end flow**: Select Master Accounting template → mapping screen → filters → preview → export → download .txt file
2. **Format validation**: For each template type, generate a sample file and verify:
   - Section header is first line
   - `M` and `D-Item` prefixes correct
   - Pipe delimiter between all fields
   - Date format DD/MM/YYYY
   - Decimal precision (2 for amounts, 8 for rates)
   - Empty fields as `||`
   - `N` defaults for Cancelled, GST Inclusive
   - `Business Reg. No` default for ID Type
3. **Code mapping persistence**: Verify mappings save, auto-fill on next export, editable
4. **Edge cases**: Pipe in data values, truncation, no line items, unmapped codes with defaults
5. **Build verification**: `npm run build` must pass

## Complexity Tracking

No constitution violations. Feature extends existing patterns without introducing new architectural complexity.
