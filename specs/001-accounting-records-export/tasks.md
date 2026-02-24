# Tasks: Export System v2 — Accounting Records, Invoices & Unified Rebuild

**Input**: Design documents from `/specs/001-accounting-records-export/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/convex-functions.md, quickstart.md

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US7)
- Exact file paths included in all descriptions

---

## Phase 1: Setup

**Purpose**: Schema changes and shared type definitions needed before any module work.

- [x] T001 Expand `exportModuleValidator` in `convex/schema.ts` to add `"invoice"` and `"accounting"` to the union type alongside existing `"expense"` and `"leave"`
- [x] T002 [P] Add `ExportFormatType` type (`"flat" | "hierarchical"`) and `ExportFormatConfig` interface (`formatType`, `delimiter`, `fileExtension`) to `src/domains/exports/lib/prebuilt-templates.ts` — extend the `PrebuiltTemplate` interface with `formatType`, `delimiter`, `fileExtension`, `masterFields?`, `detailFields?` fields
- [x] T003 [P] Add `ExportModule` type update in `src/domains/exports/components/module-selector.tsx` — change the type from `"expense" | "leave"` to `"expense" | "invoice" | "leave" | "accounting"` and add the 2 new module cards (Invoices with `FileText` icon, Accounting Records with `BookOpen` icon) to the `MODULES` array

**Checkpoint**: Schema expanded, types ready — foundational engine work can begin.

---

## Phase 2: Foundational (Unified Export Engine)

**Purpose**: Build the unified export engine that ALL user stories depend on. Replaces `csv-generator.ts`.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Create `src/domains/exports/lib/value-extractor.ts` — extract `extractValue()` (dot-notation path resolver), `formatDate()` (DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD), `formatNumber()` (decimal places, thousand separator), `formatFieldValue()` (routes to date/number/text formatter), `escapeCsvValue()` (quote-wrapping for commas/quotes/newlines), and `getFieldType()` from the existing `csv-generator.ts`. These are pure functions with no framework dependencies.
- [x] T005 Create `src/domains/exports/lib/export-engine.ts` — implement the unified export engine with: (1) `generateFlatExport()` function: takes records array, field mappings sorted by order, format options; produces comma-delimited CSV with header row + one data row per record/line-item using `value-extractor` functions; (2) `generateHierarchicalExport()` function: takes records array, master field mappings, detail field mappings, delimiter (`;`), format options; produces MASTER row followed by DETAIL rows per record; (3) `generateExport()` dispatcher: reads template `formatType` and delegates to flat or hierarchical; (4) `generateExportFilename()` (module, template, dates) supporting `.csv` and `.txt` extensions; (5) `calculateFileSize()` utility. Import all formatting from `value-extractor.ts`.
- [x] T006 Add accounting record field definitions to `src/domains/exports/lib/field-definitions.ts` — create `ACCOUNTING_FIELDS: FieldDefinition[]` array with ~28 fields per `data-model.md`: header fields (`documentNumber`, `transactionDate`, `description`, `transactionType`, `sourceType`, `vendorName`, `category`, `subcategory`, `originalAmount`, `originalCurrency`, `homeCurrencyAmount`, `exchangeRate`, `status`, `dueDate`, `paymentDate`, `paymentMethod`, `notes`, `employee.name`) and line-item fields (`lineItem.description`, `lineItem.quantity`, `lineItem.unitPrice`, `lineItem.totalAmount`, `lineItem.taxAmount`, `lineItem.taxRate`, `lineItem.itemCode`, `lineItem.debitAmount`, `lineItem.creditAmount`, `lineItem.debitLocal`, `lineItem.creditLocal`). Update `getFieldsByModule()` to handle `"accounting"`.
- [x] T007 [P] Add invoice field definitions to `src/domains/exports/lib/field-definitions.ts` — create `INVOICE_FIELDS: FieldDefinition[]` array with ~20 fields per `data-model.md`: `invoiceType`, `invoiceNumber`, `invoiceDate`, `dueDate`, `entityName`, `entityCode`, `description`, `subtotal`, `totalTax`, `totalAmount`, `currency`, `exchangeRate`, `status`, `lineItem.description`, `lineItem.quantity`, `lineItem.unitPrice`, `lineItem.totalAmount`, `lineItem.taxRate`, `lineItem.taxAmount`, `lineItem.itemCode`. Update `getFieldsByModule()` to handle `"invoice"`.
- [x] T008 Update `src/domains/exports/lib/data-access-filter.ts` — extend `getDataAccessScope()` to accept the new module types (`"invoice"` and `"accounting"`) and apply the same role-based filtering pattern (owner/admin: all records, manager: team + own, employee: own only)

**Checkpoint**: Unified export engine ready — flat and hierarchical formatters working, all field definitions in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Export Accounting Records Using SQL Accounting Template (Priority: P1) MVP

**Goal**: Full end-to-end export of accounting records using SQL Accounting GL_JE MASTER/DETAIL format.

**Independent Test**: Create accounting entries, select Accounting Records module → SQL Accounting template → preview → export → import `.txt` file into SQL Accounting Text Import tool (GL_JE). Debits = Credits per entry.

### Implementation for User Story 1

- [x] T009 [US1] Implement `getAccountingRecords()` helper in `convex/functions/exportJobs.ts` — query `accounting_entries` by `businessId` (index: `by_businessId`), exclude `deletedAt !== undefined`, apply role-based filtering per `data-access-filter.ts` pattern, apply date range filter on `transactionDate`, apply `statusFilter` array, apply `transactionTypeFilter` on `sourceDocumentType` field (`"expense_claim"`, `"invoice"`, `"sales_invoice"`, or `"all"`), cap at 10,000 records
- [x] T010 [US1] Implement `enrichAccountingRecords()` helper in `convex/functions/exportJobs.ts` — for each accounting entry: (1) fetch user by `userId` → `employee.name`; (2) fetch vendor by `vendorId` if present → vendor details; (3) derive journal lines from `lineItems` array using transaction type: for `Expense`/`Cost of Goods Sold` entries, each line item becomes a DEBIT line (DR=totalAmount, CR=0), generate one balancing CREDIT line (DR=0, CR=sum of all line totals); for `Income` entries, reverse (line items are CREDIT, balancing is DEBIT); (4) calculate `debitLocal`/`creditLocal` using `exchangeRate || 1.0`; (5) skip entries with empty `lineItems` array, count skipped entries for warning
- [x] T011 [US1] Update `preview` query in `convex/functions/exportJobs.ts` — add `"accounting"` to the module switch statement, call `getAccountingRecords()` then `enrichAccountingRecords()`, return records with `totalCount` and `previewCount`. Add `transactionTypeFilter` to the filters arg validator.
- [x] T012 [US1] Update `execute` mutation in `convex/functions/exportJobs.ts` — add `"accounting"` to the module switch, create `export_history` record with `module: "accounting"`. Add `transactionTypeFilter` to the filters arg validator.
- [x] T013 [US1] Define `sql-accounting-gl-je` pre-built template in `src/domains/exports/lib/prebuilt-templates.ts` — `formatType: "hierarchical"`, `delimiter: ";"`, `fileExtension: ".txt"`, `defaultDateFormat: "DD/MM/YYYY"`, `defaultDecimalPlaces: 2`. MASTER fields: (1) literal "MASTER", (2) documentNumber→DOCNO, (3) transactionDate→DOCDATE, (4) transactionDate→POSTDATE, (5) description→DESCRIPTION, (6) cancelled→CANCELLED. DETAIL fields: (1) literal "DETAIL", (2) documentNumber→DOCNO, (3) lineItem.itemCode→CODE, (4) lineItem.description→DESCRIPTION, (5) referenceNumber→REF, (6) ""→PROJECT, (7) lineItem.debitAmount→DR, (8) lineItem.debitLocal→LOCALDR, (9) lineItem.creditAmount→CR, (10) lineItem.creditLocal→LOCALCR, (11) ""→TAX, (12) lineItem.taxAmount→TAXAMT, (13) 0→TAXINCLUSIVE, (14) lineItem.taxRate→TAXRATE. Per `data-model.md` SQL Accounting GL_JE specification.
- [x] T014 [US1] Define `generic-accounting` pre-built template in `src/domains/exports/lib/prebuilt-templates.ts` — `formatType: "flat"`, `delimiter: ","`, `fileExtension: ".csv"`. Map ~12 common fields: DocumentNumber, Date, Description, TransactionType, AccountCode, LineDescription, DebitAmount, CreditAmount, Currency, ExchangeRate, TaxAmount, VendorName.
- [x] T015 [US1] Update `getPrebuiltTemplatesByModule()` in `src/domains/exports/lib/prebuilt-templates.ts` to return accounting templates when `module === "accounting"`
- [x] T016 [US1] Add accounting records filter options to `src/domains/exports/components/export-filters.tsx` — when module is `"accounting"`, show a transaction type dropdown (All, Expense Claims, Invoices) that maps to `transactionTypeFilter` in the filters object. Reuse existing date range and status filter components.
- [x] T017 [US1] Update `src/domains/exports/components/export-preview.tsx` — when the selected template has `formatType: "hierarchical"`, render MASTER rows with bold text and a subtle background color (`bg-muted`) to visually distinguish them from DETAIL rows. Show a legend above the preview explaining the MASTER/DETAIL structure.
- [x] T018 [US1] Update `src/domains/exports/hooks/use-export-execution.ts` — import and use `generateExport()` from the new `export-engine.ts` instead of the old `generateCsv()`. Handle `formatType` to determine file extension (`.txt` for hierarchical, `.csv` for flat) and pass the correct template config to the engine. Keep backward compatibility for expense/leave modules using the old engine until Phase 6.

**Checkpoint**: Accounting Records module with SQL Accounting GL_JE export is fully functional. Users can select module → filter → preview (with MASTER/DETAIL styling) → download `.txt` file. This is the MVP.

---

## Phase 4: User Story 2 — Export Accounting Records Using AutoCount Template (Priority: P2)

**Goal**: Add AutoCount flat CSV template for accounting records export.

**Independent Test**: Export accounting records with AutoCount template → open CSV → verify columns (DocNo, DocDate, Description, CurrencyCode, AccNo, etc.) match AutoCount import spec, DR/CR are mutually exclusive per row, no negative values.

### Implementation for User Story 2

- [x] T019 [P] [US2] Define `autocount-journal` pre-built template in `src/domains/exports/lib/prebuilt-templates.ts` — `formatType: "flat"`, `delimiter: ","`, `fileExtension: ".csv"`, `defaultDateFormat: "DD/MM/YYYY"`, `defaultDecimalPlaces: 2`. Field mappings per `data-model.md` AutoCount specification: (1) documentNumber→DocNo, (2) transactionDate→DocDate, (3) description→Description, (4) originalCurrency→CurrencyCode, (5) exchangeRate→CurrencyRate, (6) lineItem.itemCode→AccNo, (7) lineItem.description→LineDescription, (8) lineItem.debitAmount→DR, (9) lineItem.creditAmount→CR, (10) ""→TaxCode. Ensure column headers are case-sensitive exact matches.
- [x] T020 [US2] Add AutoCount-specific formatting logic to `src/domains/exports/lib/export-engine.ts` — ensure flat export for accounting records expands line items into separate rows with repeated header fields (DocNo, DocDate, Description, CurrencyCode, CurrencyRate repeated on each line-item row). Validate no negative values in DR/CR columns (convert negative debit to credit and vice versa).

**Checkpoint**: Both SQL Accounting (hierarchical) and AutoCount (flat) templates work for accounting records. Export engine handles both format types.

---

## Phase 5: User Story 3 — Export Invoices with AP/AR Filtering (Priority: P2)

**Goal**: Add Invoices export module with AP/AR filter, sourcing from both `invoices` (AP) and `sales_invoices` (AR) tables, with SQL Accounting AP_PI/AR_IV and AutoCount templates.

**Independent Test**: Create AP and AR invoices at various stages → select Invoices module → filter by AP → export with SQL Accounting template → verify AP_PI format. Filter by AR → verify AR_IV format. Filter "All" → verify both document types in one file.

### Implementation for User Story 3

- [x] T021 [US3] Implement `getInvoiceRecords()` helper in `convex/functions/exportJobs.ts` — based on `invoiceType` filter: "AP" queries `invoices` table only (by `businessId`, exclude `deletedAt`), "AR" queries `sales_invoices` table only (by `businessId`, exclude `deletedAt`), "All" queries both and merges. Apply role-based filtering, date range filter (on `processedAt` for AP or `invoiceDate` for AR), and status filter. Cap at 10,000 records.
- [x] T022 [US3] Implement `enrichInvoiceRecords()` helper in `convex/functions/exportJobs.ts` — normalize AP records: map `extractedData.invoiceNumber` → `invoiceNumber`, `extractedData.invoiceDate` → `invoiceDate`, vendor name from `extractedData.vendorName` or lookup via `accounting_entries.vendorId` → `entityName`, status, line items from `extractedData.lineItems`. Normalize AR records: map `invoiceNumber` → `invoiceNumber`, `invoiceDate` → `invoiceDate`, `customerSnapshot.businessName` → `entityName`, `lineItems` array directly. Add `invoiceType: "AP" | "AR"` marker to each record.
- [x] T023 [US3] Update `preview` and `execute` in `convex/functions/exportJobs.ts` — add `"invoice"` to the module switch, call `getInvoiceRecords()` then `enrichInvoiceRecords()`. Add `invoiceType` to the filters arg validator.
- [x] T024 [P] [US3] Define `sql-accounting-ap-pi` pre-built template in `src/domains/exports/lib/prebuilt-templates.ts` — `formatType: "hierarchical"`, `delimiter: ";"`, `fileExtension: ".txt"`. MASTER fields per SQL Accounting AP_PI spec: DOCNO, DOCNOEX, DOCDATE, POSTDATE, CODE (supplier code), COMPANYNAME, DESCRIPTION, CANCELLED, DOCAMT. DETAIL fields: DOCNO, ITEMCODE, DESCRIPTION, QTY, UOM, UNITPRICE, AMOUNT, ACCOUNT, TAX, TAXAMT, TAXINCLUSIVE, TAXRATE.
- [x] T025 [P] [US3] Define `sql-accounting-ar-iv` pre-built template in `src/domains/exports/lib/prebuilt-templates.ts` — `formatType: "hierarchical"`, `delimiter: ";"`, `fileExtension: ".txt"`. MASTER fields per SQL Accounting AR_IV spec: DOCNO, DOCDATE, POSTDATE, CODE (customer code), COMPANYNAME, DESCRIPTION, CANCELLED, DOCAMT. DETAIL fields: DOCNO, ITEMCODE, DESCRIPTION, QTY, UOM, UNITPRICE, AMOUNT, ACCOUNT, TAX, TAXAMT, TAXINCLUSIVE, TAXRATE.
- [x] T026 [P] [US3] Define `autocount-invoice` and `generic-invoice` pre-built templates in `src/domains/exports/lib/prebuilt-templates.ts` — AutoCount: flat CSV with InvoiceNo, InvoiceDate, DueDate, EntityName, EntityCode, Description, Qty, UnitPrice, Amount, TaxCode, TaxAmount, Currency. Generic: flat CSV with common invoice fields.
- [x] T027 [US3] Add invoice type filter to `src/domains/exports/components/export-filters.tsx` — when module is `"invoice"`, show an invoice type segmented control or dropdown (AP / AR / All). Default to "All". Pass the selected value as `invoiceType` in the filters object.
- [x] T028 [US3] Implement SQL Accounting template auto-selection logic in `src/domains/exports/hooks/use-export-execution.ts` — when module is `"invoice"` and a SQL Accounting template is selected: if `invoiceType` is "AP", use `sql-accounting-ap-pi`; if "AR", use `sql-accounting-ar-iv`; if "All", generate both document type sections in sequence within one file (AP_PI entries first, then AR_IV entries, per spec edge case).
- [x] T029 [US3] Update `getPrebuiltTemplatesByModule()` in `src/domains/exports/lib/prebuilt-templates.ts` to return invoice templates when `module === "invoice"`. For SQL Accounting, show a single "SQL Accounting" entry that internally resolves to AP_PI or AR_IV based on the invoice type filter.

**Checkpoint**: Invoices module fully functional with AP/AR filtering and all 4 templates (SQL Accounting AP_PI, AR_IV, AutoCount, Generic).

---

## Phase 6: User Story 4 — Rebuilt Expense Claims Export (Priority: P2)

**Goal**: Port all 6 existing expense claim templates to the unified export engine. Verify output parity.

**Independent Test**: Export expense claims using each of the 6 templates (SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan, Generic). Compare output with v1 — column headers, date formats, number formatting, and field values must match exactly.

### Implementation for User Story 4

- [x] T030 [US4] Rebuild all 6 expense claim pre-built templates in `src/domains/exports/lib/prebuilt-templates.ts` using the new `PrebuiltTemplate` interface — add `formatType: "flat"`, `delimiter: ","`, `fileExtension: ".csv"` to each. Preserve exact `targetColumn` names, `sourceField` mappings, `dateFormat`, and `decimalPlaces` from the current templates. Templates: `sql-payroll-expense`, `xero-expense`, `quickbooks-expense`, `briohr-expense`, `kakitangan-expense`, `generic-expense`.
- [x] T031 [US4] Refactor `getExpenseRecords()` in `convex/functions/exportJobs.ts` to use the same shared patterns as `getAccountingRecords()` — extract common role-based filtering, date range filtering, and status filtering into reusable helper functions. Ensure the function still queries `expense_claims` with the same indexes and returns the same data shape.
- [x] T032 [US4] Refactor `enrichRecords()` for expense module in `convex/functions/exportJobs.ts` to use shared enrichment patterns — employee lookup, approver lookup should use the same helper as accounting records enrichment. Ensure the enriched record shape (with `employee.name`, `employee.email`, `employee.employeeId`, `employee.department`, `approver.name`) remains identical to v1.
- [x] T033 [US4] Switch expense export execution path in `src/domains/exports/hooks/use-export-execution.ts` from old `generateCsv()` to new `generateExport()` from `export-engine.ts`. Ensure flat formatter produces identical output to v1 for all 6 expense templates.

**Checkpoint**: All 6 expense claim templates produce identical output on the new engine. Old csv-generator.ts is no longer used for expenses.

---

## Phase 7: User Story 5 — Rebuilt Leave Records Export (Priority: P3)

**Goal**: Port all 4 existing leave record templates to the unified export engine. Verify output parity.

**Independent Test**: Export leave records using each of the 4 templates (SQL Payroll, BrioHR, Kakitangan, Generic). Compare output with v1.

### Implementation for User Story 5

- [x] T034 [P] [US5] Rebuild all 4 leave record pre-built templates in `src/domains/exports/lib/prebuilt-templates.ts` using the new interface — add `formatType: "flat"`, `delimiter: ","`, `fileExtension: ".csv"`. Preserve exact `targetColumn` names, `sourceField` mappings, formats. Templates: `sql-payroll-leave`, `briohr-leave`, `kakitangan-leave`, `generic-leave`.
- [x] T035 [US5] Refactor `getLeaveRecords()` in `convex/functions/exportJobs.ts` to use shared helper patterns — same role-based filtering, date range, status filtering. Ensure it still queries `leave_requests` with the same indexes and includes `leaveType` enrichment via `leaveTypeId` lookup.
- [x] T036 [US5] Switch leave export execution path in `src/domains/exports/hooks/use-export-execution.ts` from old `generateCsv()` to new `generateExport()`. Verify all 4 leave templates produce identical output.
- [x] T037 [US5] Remove `src/domains/exports/lib/csv-generator.ts` — all references should now point to `export-engine.ts` and `value-extractor.ts`. Search codebase for any remaining imports of `csv-generator` and update them.

**Checkpoint**: All 4 leave templates on new engine. csv-generator.ts removed. All 4 modules (expense, invoice, leave, accounting) use the unified export engine.

---

## Phase 8: User Story 6 — Custom Templates and Template Builder (Priority: P3)

**Goal**: Update Template Builder to support all 4 modules with module-specific field selection. Expand Convex template CRUD for new modules.

**Independent Test**: Create a custom template for "Accounting Records" module in Template Builder → select fields → save → use it to export → verify CSV output matches configured columns. Repeat for "Invoices" module.

### Implementation for User Story 6

- [x] T038 [US6] Update Template Builder module selector in `src/domains/exports/components/template-builder.tsx` — replace the 2-option module selector (expense/leave) with a 4-option selector (expense, invoice, leave, accounting). When module changes, reload the available fields list from `field-definitions.ts` using `getFieldsByModule()`.
- [x] T039 [US6] Update `convex/functions/exportTemplates.ts` — expand the `module` arg validator in `create`, `list`, `get`, `update`, `remove`, and `clonePrebuilt` mutations/queries to accept `"invoice"` and `"accounting"`. Update `PREBUILT_TEMPLATE_IDS` registry to include all new template IDs per `contracts/convex-functions.md`.
- [x] T040 [US6] Update `convex/functions/exportTemplates.ts` `clonePrebuilt` mutation — when cloning a hierarchical pre-built template (SQL Accounting), the cloned custom template should default to `formatType: "flat"` since custom templates always produce flat CSV. Add a note in the clone confirmation UI that the cloned template will use CSV format, not the original's hierarchical format.
- [x] T041 [US6] Add line-item field handling to `src/domains/exports/components/template-builder.tsx` — for Accounting Records and Invoices modules, the field list includes `lineItem.*` fields. When a line-item field is selected, explain in the UI that the export will produce one row per line item (flat format) with header fields repeated.

**Checkpoint**: Template Builder supports all 4 modules. Custom templates can be created, saved, and used for export across all modules.

---

## Phase 9: User Story 7 — Scheduling and History for All Modules (Priority: P3)

**Goal**: Ensure export scheduling and history work for all 4 modules.

**Independent Test**: Create a weekly schedule for accounting records export → verify it appears in Schedules tab. Perform manual exports for all 4 modules → verify all appear in History tab with correct module labels.

### Implementation for User Story 7

- [x] T042 [US7] Update `convex/functions/exportSchedules.ts` — ensure schedule creation, listing, and execution support the new module types. The schedule's template reference (either `templateId` or `prebuiltTemplateId`) determines the module. Verify the `dateRangeType` filter works correctly for accounting and invoice modules (map "previous_week" to correct date range logic).
- [x] T043 [US7] Update `convex/functions/exportHistory.ts` — ensure history listing and queries filter correctly by the new module types. The history list page should show module-specific labels ("Accounting Records", "Invoices") in the module column.
- [x] T044 [US7] Update `src/domains/exports/components/exports-page-content.tsx` — ensure the Schedules tab and History tab correctly display the new module types. Update any module-to-label mapping to include `"accounting"` → "Accounting Records" and `"invoice"` → "Invoices". Update the page subtitle from "Export expense claims and leave records to CSV" to "Export expense claims, invoices, leave records, and accounting records".

**Checkpoint**: All export features (scheduling, history, role-based access) work consistently across all 4 modules.

---

## Phase 10: Polish & Deploy

**Purpose**: Final integration, deployment, and validation.

- [x] T045 Run `npx convex deploy --yes` to deploy schema changes (expanded `exportModuleValidator`) and all updated Convex functions to production
- [x] T046 Run `npm run build` and fix any TypeScript compilation errors — ensure clean build with no warnings related to export module changes
- [x] T047 Verify existing custom templates still load and function correctly after schema expansion — query `export_templates` table, confirm all existing `module: "expense"` and `module: "leave"` templates are accessible and produce expected output
- [x] T048 [P] Verify role-based access control across all 4 modules — test as owner (sees all records), manager (sees team + own), employee (sees own only) for each module
- [x] T049 [P] Verify export history displays all 4 module types correctly with proper labels, record counts, file sizes, and download links
- [x] T050 Set git author to `grootdev-ai <dev@hellogroot.com>` per CLAUDE.md requirements before committing

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──────────────► Phase 2 (Foundational Engine)
                                        │
                                        ├──► Phase 3 (US1: SQL Acct GL_JE) ← MVP
                                        │
                                        ├──► Phase 4 (US2: AutoCount Journal)
                                        │
                                        ├──► Phase 5 (US3: Invoices AP/AR)
                                        │
                                        ├──► Phase 6 (US4: Expense Claims Rebuild)
                                        │
                                        └──► Phase 7 (US5: Leave Records Rebuild)
                                                        │
                    Phases 3-7 all complete ────────────►├──► Phase 8 (US6: Template Builder)
                                                        │
                                                        ├──► Phase 9 (US7: Scheduling/History)
                                                        │
                                                        └──► Phase 10 (Deploy & Validate)
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — **no dependencies on other stories**. This is the MVP.
- **US2 (P2)**: Depends on Phase 2 only — can run in parallel with US1 (different template file, same engine).
- **US3 (P2)**: Depends on Phase 2 only — independent module with separate data source tables.
- **US4 (P2)**: Depends on Phase 2 only — rebuilds existing functionality on new engine.
- **US5 (P3)**: Depends on Phase 2 only — rebuilds existing functionality. T037 (remove csv-generator) should run after US4 is also complete.
- **US6 (P3)**: Depends on US1–US5 being complete (Template Builder needs all 4 modules' field definitions and templates registered).
- **US7 (P3)**: Depends on US1–US5 being complete (scheduling and history need all modules working).

### Parallel Opportunities

After Phase 2 completes, **US1 through US5 can all run in parallel** since they operate on different files:

```
US1: convex/functions/exportJobs.ts (accounting section) + prebuilt-templates.ts (accounting templates)
US2: prebuilt-templates.ts (autocount-journal template) + export-engine.ts (flat accounting logic)
US3: convex/functions/exportJobs.ts (invoice section) + prebuilt-templates.ts (invoice templates) + export-filters.tsx
US4: prebuilt-templates.ts (expense templates rebuild) + exportJobs.ts (expense refactor)
US5: prebuilt-templates.ts (leave templates rebuild) + exportJobs.ts (leave refactor)
```

Note: `exportJobs.ts` and `prebuilt-templates.ts` are shared files, so true parallel execution requires careful coordination of different sections within these files.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, launch US1 tasks:

# Sequential within US1 (data retrieval must exist before templates can be tested):
Task: T009 "Implement getAccountingRecords() in convex/functions/exportJobs.ts"
Task: T010 "Implement enrichAccountingRecords() with DR/CR derivation in convex/functions/exportJobs.ts"
Task: T011 "Update preview query for accounting module in convex/functions/exportJobs.ts"
Task: T012 "Update execute mutation for accounting module in convex/functions/exportJobs.ts"

# Then templates and UI (can be parallel):
Task: T013 "Define sql-accounting-gl-je template in prebuilt-templates.ts"  [P]
Task: T014 "Define generic-accounting template in prebuilt-templates.ts"    [P]
Task: T016 "Add accounting filters to export-filters.tsx"                   [P]
Task: T017 "Add hierarchical preview to export-preview.tsx"                 [P]

# Then integration:
Task: T015 "Update getPrebuiltTemplatesByModule() for accounting"
Task: T018 "Update use-export-execution.ts for new engine"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational Engine (T004–T008)
3. Complete Phase 3: User Story 1 — SQL Accounting GL_JE (T009–T018)
4. **STOP and VALIDATE**: Test export → import into SQL Accounting
5. Deploy if ready — accounting records export with SQL Accounting is immediately valuable

### Incremental Delivery

1. Setup + Foundational → Engine ready
2. **US1** → SQL Accounting GL_JE export → **Deploy (MVP!)**
3. **US2** → AutoCount template → Deploy
4. **US3** → Invoices module → Deploy
5. **US4** → Rebuilt Expense Claims → Deploy
6. **US5** → Rebuilt Leave Records + remove old code → Deploy
7. **US6** → Template Builder update → Deploy
8. **US7** → Scheduling/History update → Deploy
9. Phase 10 → Final validation → **Production release**

Each increment adds value without breaking previous stories.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps tasks to specific user story for traceability
- Convex deployment (`npx convex deploy --yes`) MUST happen after schema changes (Phase 10)
- Build verification (`npm run build`) MUST pass before task completion
- Git author MUST be `grootdev-ai <dev@hellogroot.com>` per CLAUDE.md
- Pre-built templates for expense/leave modules (US4/US5) must preserve exact column names for backward compatibility
- Master Accounting template is explicitly DEFERRED — not included in any task
- Total tasks: 50
