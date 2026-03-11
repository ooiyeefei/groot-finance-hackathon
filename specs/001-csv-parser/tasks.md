# Tasks: CSV Auto-Parser with Intelligent Column Mapping

**Input**: Design documents from `/specs/001-csv-parser/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Validation via `npm run build` and manual UAT.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Project initialization, dependencies, and domain structure

- [x] T001 Install papaparse and xlsx dependencies: `npm install papaparse xlsx && npm install -D @types/papaparse`
- [x] T002 Create domain directory structure: `src/domains/csv-parser/{components,hooks,lib,types}/`
- [x] T003 [P] Create TypeScript type definitions in `src/domains/csv-parser/types/index.ts` (CsvImportResult, ColumnMapping, ImportSession, ValidationResult, ValidationError, MappedRow, SchemaType)
- [x] T004 [P] Create standard field schema definitions in `src/domains/csv-parser/lib/schema-definitions.ts` (SalesStatementFields, BankStatementFields with field names, types, required flags, and common aliases for AI prompt)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure — pure library functions and Convex data layer that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Implement parser engine in `src/domains/csv-parser/lib/parser-engine.ts` — CSV parsing with papaparse (delimiter auto-detection, header extraction, sample row parsing), XLSX parsing with SheetJS (sheet enumeration, header detection), file type detection, 25MB/100K row limit enforcement
- [x] T006 [P] Implement formula sanitizer in `src/domains/csv-parser/lib/sanitizer.ts` — strip formula prefixes (`=`, `+`, `-`, `@`) from cell values, reject .xlsm files
- [x] T007 [P] Implement header fingerprint generator in `src/domains/csv-parser/lib/fingerprint.ts` — sort headers alphabetically, lowercase, join with `|`, SHA-256 hash
- [x] T008 [P] Implement row validator in `src/domains/csv-parser/lib/validator.ts` — validate mapped rows against schema (required fields, numeric/date/string type checks), return ValidationResult with row-level errors
- [x] T009 Add `csv_import_templates` table to `convex/schema.ts` with fields: businessId, name, schemaType, columnMappings (array), headerFingerprint, sourceHeaders (array), createdBy, updatedBy, lastUsedAt. Indexes: by_businessId, by_businessId_fingerprint, by_businessId_schemaType
- [x] T010 Run `npx convex deploy --yes` to deploy schema changes
- [x] T011 Implement Convex functions in `convex/functions/csvImportTemplates.ts` — queries: list (by businessId + optional schemaType), getByFingerprint (by businessId + fingerprint). Mutations: create (upsert by fingerprint), update, remove, touchLastUsed. All with auth check + business membership verification following `exportTemplates.ts` pattern

**Checkpoint**: Pure library functions and data layer ready — user story implementation can begin

---

## Phase 3: User Story 1 — First-Time CSV Upload with AI Mapping (Priority: P1) MVP

**Goal**: User uploads a CSV file, AI suggests column mappings, user reviews and confirms, sees preview of mapped data.

**Independent Test**: Upload any CSV → see AI-suggested mappings → adjust → see preview with mapped field names.

### Implementation for User Story 1

- [x] T012 [US1] Create AI mapping API route in `src/app/api/v1/csv-parser/suggest-mappings/route.ts` — POST endpoint accepting headers + sampleRows + optional schemaType, calls Qwen via existing AI config with structured prompt including schema field definitions and aliases, returns detectedSchemaType + mappings with confidence scores. Clerk auth required.
- [x] T013 [US1] Create import session state hook in `src/domains/csv-parser/hooks/use-import-session.ts` — React state management for the multi-step flow (parsing → mapping → previewing → validating → complete), tracks file, headers, sampleRows, mappings, validationResults, status
- [x] T014 [US1] Create CSV parser hook in `src/domains/csv-parser/hooks/use-csv-parser.ts` — wraps parser-engine.ts, handles File input, calls sanitizer, returns parsed headers + sample rows + file metadata. Handles errors (empty file, too large, wrong format)
- [x] T015 [US1] Create column mapping hook in `src/domains/csv-parser/hooks/use-column-mapping.ts` — fetches AI suggestions via `/api/v1/csv-parser/suggest-mappings`, manages mapping state (AI-suggested, user-adjusted), provides updateMapping(sourceHeader, targetField) for manual overrides
- [x] T016 [P] [US1] Create file upload step component in `src/domains/csv-parser/components/file-upload-step.tsx` — drag-and-drop file zone accepting .csv/.xlsx (reject .xlsm with message), shows file info after selection, triggers parsing. Use semantic design tokens (bg-card, text-foreground)
- [x] T017 [P] [US1] Create column mapping step component in `src/domains/csv-parser/components/column-mapping-step.tsx` — table showing source column → target field dropdown per row, confidence badge per mapping, schema type indicator (auto-detected) with override option. Dropdown options from schema-definitions.ts + "unmapped"
- [x] T018 [P] [US1] Create data preview step component in `src/domains/csv-parser/components/data-preview-step.tsx` — table showing first 5 mapped rows with standard field names as column headers, validation warnings inline
- [x] T019 [US1] Create main CsvImportModal component in `src/domains/csv-parser/components/csv-import-modal.tsx` — Sheet (drawer) component orchestrating the 3-step flow (upload → mapping → preview), props: open, onOpenChange, schemaType, onComplete, onCancel. Wire up all hooks and step components. Action button: bg-primary hover:bg-primary/90 text-primary-foreground

**Checkpoint**: User Story 1 fully functional — upload CSV, see AI mappings, adjust, preview. No template saving yet.

---

## Phase 4: User Story 2 — Save and Reuse Mapping Templates (Priority: P1)

**Goal**: Save confirmed mappings as named template. Auto-detect and apply template on repeat uploads.

**Independent Test**: Save template after first upload → upload same format again → template auto-applied with zero configuration.

### Implementation for User Story 2

- [x] T020 [US2] Create import templates hook in `src/domains/csv-parser/hooks/use-import-templates.ts` — Convex query hooks for list, getByFingerprint. Mutation hooks for create, update, remove, touchLastUsed. Follows useExportTemplates pattern.
- [x] T021 [US2] Add template save flow to `src/domains/csv-parser/components/csv-import-modal.tsx` — after mapping confirmation, prompt user to save as template with name input. Call fingerprint.ts to generate hash, call create mutation. Show toast on success.
- [x] T022 [US2] Add template auto-detection to `src/domains/csv-parser/hooks/use-import-session.ts` — after file parsing, compute fingerprint from headers, query getByFingerprint. If match found: auto-apply template mappings, show notification with template name, provide "Edit mappings" override option. If multiple matches: show selection prompt.
- [x] T023 [US2] Update `src/domains/csv-parser/components/column-mapping-step.tsx` — show "Template applied: [name]" banner when auto-detected, add "Edit mappings" button to override, add "Update template" option when user modifies an applied template's mappings

**Checkpoint**: User Stories 1 + 2 complete — full import flow with template save and reuse.

---

## Phase 5: User Story 3 — Template Management (Priority: P2)

**Goal**: CRUD interface for saved templates — list, edit, rename, delete.

**Independent Test**: Navigate to template management, see list of templates, edit/rename/delete one.

### Implementation for User Story 3

- [x] T024 [US3] Create template manager component in `src/domains/csv-parser/components/template-manager.tsx` — list view showing template name, schema type, column count, last used date. Edit (rename + remap columns), delete with confirmation dialog. Accessible from within CsvImportModal via "Manage Templates" link.
- [x] T025 [US3] Add template management entry point to `src/domains/csv-parser/components/csv-import-modal.tsx` — "Manage Templates" link/button in the file upload step, opens template-manager as a sub-view within the modal

**Checkpoint**: Template CRUD complete and accessible from import flow.

---

## Phase 6: User Story 4 — Excel (.xlsx) File Support (Priority: P2)

**Goal**: Upload .xlsx files with same mapping flow as CSV. Handle multi-sheet files.

**Independent Test**: Upload .xlsx file → headers detected → AI mapping works → template save/reuse works.

### Implementation for User Story 4

- [x] T026 [US4] Add sheet selection UI to `src/domains/csv-parser/components/file-upload-step.tsx` — when xlsx has multiple sheets, show sheet selector (list of sheet names) before proceeding to parsing. Single-sheet files skip this step.
- [x] T027 [US4] Update `src/domains/csv-parser/hooks/use-csv-parser.ts` — add selectedSheet state, pass to parser-engine for xlsx parsing, re-parse when sheet selection changes

**Checkpoint**: CSV + XLSX both work end-to-end through the full import flow.

---

## Phase 7: User Story 5 — Data Validation and Error Handling (Priority: P2)

**Goal**: Full row-level validation after mapping confirmed. Error summary with option to proceed with valid rows only.

**Independent Test**: Upload CSV with known errors (missing required fields, text in numeric columns) → see validation results → proceed with valid rows.

### Implementation for User Story 5

- [x] T028 [US5] Create validation results component in `src/domains/csv-parser/components/validation-results.tsx` — table showing row number, column, error type, problematic value. Summary: "X of Y rows valid". Buttons: "Import valid rows only" (bg-primary) and "Back to mapping" (bg-secondary). Download error report option.
- [x] T029 [US5] Add validation step to `src/domains/csv-parser/components/csv-import-modal.tsx` — after preview confirmation, run full-file validation using validator.ts. Show validation-results if errors found. Wire "Import valid rows only" to onComplete callback with filtered rows.
- [x] T030 [US5] Update `src/domains/csv-parser/hooks/use-import-session.ts` — add validation step to session flow, full-file parsing from browser memory (headers + all rows through sanitizer + validator), filter valid rows for onComplete output

**Checkpoint**: All 5 user stories complete — full validation pipeline working.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, documentation, edge case handling

- [x] T031 [P] Create domain documentation in `src/domains/csv-parser/CLAUDE.md` — document architecture, component API, integration guide for consuming features
- [x] T032 [P] Add edge case handling across components — empty file message, ragged CSV padding/truncation, no-header-row prompt, all-low-confidence AI fallback to manual mapping, file-too-large rejection message
- [x] T033 Run `npm run build` — fix any TypeScript or build errors until build passes cleanly
- [x] T034 Manual UAT — test with sample Shopee CSV, Lazada CSV, bank statement CSV, and an .xlsx file. Verify AI mappings, template save/reuse, validation errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T004)
- **User Story 1 (Phase 3)**: Depends on Foundational (T005-T011)
- **User Story 2 (Phase 4)**: Depends on US1 (needs CsvImportModal to exist)
- **User Story 3 (Phase 5)**: Depends on US2 (needs templates to exist)
- **User Story 4 (Phase 6)**: Depends on US1 (extends file-upload-step and parser hook)
- **User Story 5 (Phase 7)**: Depends on US1 (extends import modal with validation step)
- **Polish (Phase 8)**: Depends on all user stories

### Parallel Opportunities

**Within Phase 1**: T003 and T004 are independent files — can run in parallel
**Within Phase 2**: T005, T006, T007, T008 are all independent pure library files — can run in parallel
**Within Phase 3**: T016, T017, T018 are independent component files — can run in parallel
**Across Phases 5-7**: US3, US4, US5 are independent of each other — can run in parallel after US2

### User Story Independence

- **US1 (P1)**: Standalone — core import flow works without templates
- **US2 (P1)**: Extends US1 — adds template save/reuse to existing flow
- **US3 (P2)**: Extends US2 — adds CRUD for templates
- **US4 (P2)**: Extends US1 — adds xlsx file type support
- **US5 (P2)**: Extends US1 — adds validation pipeline

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T011)
3. Complete Phase 3: User Story 1 (T012-T019) → **Test: upload CSV, see AI mappings, preview**
4. Complete Phase 4: User Story 2 (T020-T023) → **Test: save template, reuse on repeat upload**
5. **STOP and VALIDATE**: MVP complete — deploy/demo

### Incremental Delivery

6. Phase 5: US3 (template management) — nice-to-have CRUD
7. Phase 6: US4 (xlsx support) — format universality
8. Phase 7: US5 (validation) — data quality
9. Phase 8: Polish — edge cases, docs, build verify

---

## Notes

- Total tasks: **34**
- Tasks per story: US1=8, US2=4, US3=2, US4=2, US5=3
- Parallel opportunities: 11 tasks marked [P]
- MVP scope: Phases 1-4 (Setup + Foundational + US1 + US2) = 23 tasks
- All Convex changes require `npx convex deploy --yes` (T010)
- Build must pass before completion (T033)
