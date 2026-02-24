# Quickstart: Export System v2

**Branch**: `001-accounting-records-export` | **Date**: 2026-02-24

## Overview

Rebuild all 4 export modules (Expense Claims, Invoices, Leave Records, Accounting Records) with a unified export engine that supports both flat CSV and hierarchical MASTER/DETAIL formats.

## Implementation Phases

### Phase 1: Unified Export Engine Core
**Goal**: Build the format-agnostic export engine that replaces the current `csv-generator.ts`.

**Files to create/modify**:
- `src/domains/exports/lib/export-engine.ts` — New unified engine with `FlatFormatter` and `HierarchicalFormatter`
- `src/domains/exports/lib/field-definitions.ts` — Add accounting and invoice field definitions
- `src/domains/exports/lib/value-extractor.ts` — Extract and format values (factored out from csv-generator)

**Key design**:
```
ExportEngine
├── ValueExtractor (shared)  — dot-notation extraction, date/number formatting
├── FlatFormatter            — one row per record, comma-delimited
└── HierarchicalFormatter    — MASTER/DETAIL rows, configurable delimiter
```

**Verify**: Unit tests for both formatters with mock data.

### Phase 2: Accounting Records Module (SQL Accounting + AutoCount)
**Goal**: Add "Accounting Records" module with GL_JE and journal entry templates.

**Files to create/modify**:
- `convex/schema.ts` — Expand `exportModuleValidator` to include `"accounting"` and `"invoice"`
- `convex/functions/exportJobs.ts` — Add `getAccountingRecords()`, `enrichAccountingRecords()`, journal line derivation
- `src/domains/exports/lib/prebuilt-templates.ts` — Add `sql-accounting-gl-je`, `autocount-journal`, `generic-accounting`
- `src/domains/exports/components/module-selector.tsx` — Add "Accounting Records" module card

**Key design**: Journal line DR/CR derivation from transaction type + line item amounts. Balancing entry auto-generated.

**Verify**: Export accounting entries → import into SQL Accounting Text Import tool (GL_JE). Debits = Credits per entry.

### Phase 3: Invoices Module (AP/AR with Filtering)
**Goal**: Add "Invoices" module with AP/AR filter and SQL Accounting invoice templates.

**Files to create/modify**:
- `convex/functions/exportJobs.ts` — Add `getInvoiceRecords()`, `enrichInvoiceRecords()`, normalize AP+AR
- `src/domains/exports/lib/prebuilt-templates.ts` — Add `sql-accounting-ap-pi`, `sql-accounting-ar-iv`, `autocount-invoice`, `generic-invoice`
- `src/domains/exports/components/export-filters.tsx` — Add invoice type filter (AP/AR/All)
- `src/domains/exports/components/module-selector.tsx` — Add "Invoices" module card

**Key design**: Two source tables (`invoices` for AP, `sales_invoices` for AR) normalized into common export shape. SQL Accounting template auto-selects AP_PI or AR_IV based on filter.

**Verify**: Export AP invoices → import into SQL Accounting (AP_PI). Export AR invoices → SQL Accounting (AR_IV).

### Phase 4: Rebuild Expense Claims + Leave Records
**Goal**: Port existing templates to the unified engine. Verify output parity.

**Files to create/modify**:
- `src/domains/exports/lib/prebuilt-templates.ts` — Rebuild existing 10 templates using new engine interface
- `convex/functions/exportJobs.ts` — Refactor `getExpenseRecords()`, `getLeaveRecords()` to use shared patterns from Phase 2/3
- `src/domains/exports/lib/csv-generator.ts` — Replace with calls to new export engine (or remove entirely)

**Key design**: Same target column names and formats. The only change is the underlying engine.

**Verify**: Compare v1 and v2 output for identical input data. All 10 templates must produce byte-identical CSV (excluding whitespace).

### Phase 5: Template Builder, Filters, Preview, History
**Goal**: Update all supporting UI and backend for 4 modules.

**Files to create/modify**:
- `src/domains/exports/components/template-builder.tsx` — Module selector for all 4 modules, new field lists
- `src/domains/exports/components/export-filters.tsx` — Module-specific filters (invoice type, transaction type)
- `src/domains/exports/components/export-preview.tsx` — Support hierarchical preview with MASTER/DETAIL styling
- `convex/functions/exportTemplates.ts` — Expand module validator, update prebuilt registry
- `convex/functions/exportSchedules.ts` — Support new modules
- `convex/functions/exportHistory.ts` — Support new modules
- `src/domains/exports/hooks/use-export-execution.ts` — Handle hierarchical format output

**Verify**: Full end-to-end flow for each module: select → filter → preview → export → history entry created.

### Phase 6: Convex Deployment + Validation
**Goal**: Deploy schema changes and verify production.

**Steps**:
1. `npx convex deploy --yes` (schema + function changes)
2. Verify existing custom templates still load and work
3. Run each pre-built template against production data
4. Verify export history displays all module types correctly

## Key Files Summary

| File | Action | Phase |
|------|--------|-------|
| `src/domains/exports/lib/export-engine.ts` | Create | 1 |
| `src/domains/exports/lib/value-extractor.ts` | Create | 1 |
| `src/domains/exports/lib/field-definitions.ts` | Modify | 1 |
| `convex/schema.ts` | Modify (validator) | 2 |
| `convex/functions/exportJobs.ts` | Major rewrite | 2-4 |
| `src/domains/exports/lib/prebuilt-templates.ts` | Major rewrite | 2-4 |
| `src/domains/exports/components/module-selector.tsx` | Modify | 2-3 |
| `src/domains/exports/components/export-filters.tsx` | Modify | 3, 5 |
| `src/domains/exports/components/export-preview.tsx` | Modify | 5 |
| `src/domains/exports/components/template-builder.tsx` | Modify | 5 |
| `convex/functions/exportTemplates.ts` | Modify | 5 |
| `convex/functions/exportSchedules.ts` | Minor modify | 5 |
| `convex/functions/exportHistory.ts` | Minor modify | 5 |
| `src/domains/exports/hooks/use-export-execution.ts` | Modify | 5 |
| `src/domains/exports/lib/csv-generator.ts` | Remove/replace | 4 |

## Dependencies

- Phase 2 depends on Phase 1 (export engine must exist)
- Phase 3 depends on Phase 1 (same engine)
- Phase 4 depends on Phase 1 (same engine)
- Phases 2, 3, 4 can be parallelized after Phase 1
- Phase 5 depends on Phases 2-4 (all modules must exist)
- Phase 6 depends on Phase 5 (all code must be ready)

## Risk Areas

1. **Journal line DR/CR derivation** — Accounting entries with no line items or unstructured amounts may produce incorrect journal entries. Edge case handling is critical.
2. **SQL Accounting format compliance** — The MASTER/DETAIL semicolon format must match exactly. One wrong field order or missing trailing semicolon breaks the import.
3. **Two-table invoice normalization** — AP (`invoices`) and AR (`sales_invoices`) have very different schemas. The normalization logic must handle missing fields gracefully.
4. **Output parity for rebuilt templates** — Existing users depend on exact column names. Any deviation breaks their import workflows in SQL Payroll, Xero, etc.
