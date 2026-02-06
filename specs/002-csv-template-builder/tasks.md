# Tasks: CSV Template Builder

**Input**: Design documents from `/specs/002-csv-template-builder/`
**Prerequisites**: plan.md (✓), spec.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓)

**Tests**: Not explicitly requested in specification - omitting test tasks.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and domain structure

- [ ] T001 Create exports domain directory structure at `src/domains/exports/{components,hooks,lib,types}`
- [ ] T002 [P] Create TypeScript types in `src/domains/exports/types/index.ts` per data-model.md
- [ ] T003 [P] Add export validators to `convex/lib/validators.ts` (exportModuleValidator, exportFrequencyValidator, etc.)
- [ ] T004 [P] Create field definitions in `src/domains/exports/lib/field-definitions.ts` (EXPENSE_FIELDS, LEAVE_FIELDS)
- [ ] T005 [P] Create pre-built template definitions in `src/domains/exports/lib/prebuilt-templates.ts` (SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Add `export_templates` table to `convex/schema.ts` per data-model.md
- [ ] T007 Add `export_schedules` table to `convex/schema.ts` per data-model.md
- [ ] T008 Add `export_history` table to `convex/schema.ts` per data-model.md
- [ ] T009 Run `npx convex dev` to sync schema changes
- [ ] T010 Create CSV generation utility in `src/domains/exports/lib/csv-generator.ts`
- [ ] T011 Create role-based data access helper in `src/domains/exports/lib/data-access-filter.ts`
- [ ] T012 Create page route at `src/app/[locale]/reporting/page.tsx`
- [ ] T013 Add "Reporting & Exports" sidebar navigation link (between Team Calendar and AI Assistant)

**Checkpoint**: Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - Quick Export with Pre-built Template (Priority: P1) 🎯 MVP

**Goal**: Finance admins can export data using pre-built templates (SQL Payroll, Xero, etc.) in under 1 minute

**Independent Test**: Select pre-built template → Apply date filter → Preview → Export CSV → Verify columns match target system format

**Requirements**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-022, FR-023

### Convex Backend for US1

- [ ] T014 [P] [US1] Create template list query in `convex/functions/exportTemplates.ts` (list pre-built + custom)
- [ ] T015 [P] [US1] Create template get query in `convex/functions/exportTemplates.ts` (get single template)
- [ ] T016 [P] [US1] Create preview query in `convex/functions/exportJobs.ts` (preview with role-based filtering)
- [ ] T017 [P] [US1] Create execute mutation in `convex/functions/exportJobs.ts` (trigger export)
- [ ] T018 [US1] Create generateCsv action in `convex/functions/exportJobs.ts` (server-side CSV generation)
- [ ] T019 [US1] Create getDownloadUrl action in `convex/functions/exportJobs.ts` (signed URL generation)
- [ ] T020 [US1] Create export_history record mutation in `convex/functions/exportHistory.ts`

### React Hooks for US1

- [ ] T021 [P] [US1] Create `useExportTemplates` hook in `src/domains/exports/hooks/use-export-templates.ts`
- [ ] T022 [P] [US1] Create `useExportPreview` hook in `src/domains/exports/hooks/use-export-execution.ts`
- [ ] T023 [P] [US1] Create `useExecuteExport` hook in `src/domains/exports/hooks/use-export-execution.ts`
- [ ] T024 [US1] Create hooks index export in `src/domains/exports/hooks/index.ts`

### UI Components for US1

- [ ] T025 [P] [US1] Create `ModuleSelector` component in `src/domains/exports/components/module-selector.tsx`
- [ ] T026 [P] [US1] Create `TemplateList` component in `src/domains/exports/components/template-list.tsx`
- [ ] T027 [P] [US1] Create `ExportFilters` component in `src/domains/exports/components/export-filters.tsx`
- [ ] T028 [US1] Create `ExportPreview` component in `src/domains/exports/components/export-preview.tsx`
- [ ] T029 [US1] Create `ExportsPageContent` main component in `src/domains/exports/components/exports-page-content.tsx`
- [ ] T030 [US1] Create components index export in `src/domains/exports/components/index.ts`

### Integration for US1

- [ ] T031 [US1] Wire up `ExportsPageContent` in `src/app/[locale]/reporting/page.tsx`
- [ ] T032 [US1] Add role-based access check (finance_admin, owner, manager, employee)
- [ ] T033 [US1] Implement export download flow (execute → poll status → download)

**Checkpoint**: US1 complete - users can export with pre-built templates

---

## Phase 4: User Story 2 - Build Custom Template (Priority: P2)

**Goal**: Business owners can create custom export templates with field mapping, custom column names, and format configuration

**Independent Test**: Create new template → Drag fields → Set custom names → Configure date format → Preview → Verify output matches configuration

**Requirements**: FR-006, FR-007, FR-008, FR-009, FR-010

### Convex Backend for US2

- [ ] T034 [P] [US2] Create template create mutation in `convex/functions/exportTemplates.ts`
- [ ] T035 [P] [US2] Create getAvailableFields query in `convex/functions/exportJobs.ts`
- [ ] T036 [US2] Add field validation logic in `convex/functions/exportTemplates.ts`

### React Hooks for US2

- [ ] T037 [US2] Add `useCreateTemplate` to `src/domains/exports/hooks/use-export-templates.ts`
- [ ] T038 [US2] Add `useAvailableFields` to `src/domains/exports/hooks/use-export-templates.ts`

### UI Components for US2

- [ ] T039 [P] [US2] Create `FieldMapper` component in `src/domains/exports/components/field-mapper.tsx` (drag-and-drop)
- [ ] T040 [P] [US2] Create `FormatConfigPanel` component in `src/domains/exports/components/format-config-panel.tsx` (date/number formats)
- [ ] T041 [US2] Create `TemplateBuilder` component in `src/domains/exports/components/template-builder.tsx`
- [ ] T042 [US2] Add "Create Template" button and modal to `TemplateList` component

**Checkpoint**: US2 complete - users can build custom templates

---

## Phase 5: User Story 3 - Save and Reuse Custom Templates (Priority: P2)

**Goal**: Users can save, edit, and delete custom templates for future use

**Independent Test**: Save template → Log out → Log in → Find template in list → Edit → Delete → Verify removal

**Requirements**: FR-011, FR-012, FR-012a, FR-013

### Convex Backend for US3

- [ ] T043 [P] [US3] Create template update mutation in `convex/functions/exportTemplates.ts`
- [ ] T044 [P] [US3] Create template delete mutation in `convex/functions/exportTemplates.ts`
- [ ] T045 [US3] Create clonePrebuilt mutation in `convex/functions/exportTemplates.ts`

### React Hooks for US3

- [ ] T046 [US3] Add `useUpdateTemplate`, `useDeleteTemplate` to `src/domains/exports/hooks/use-export-templates.ts`
- [ ] T047 [US3] Add `useCloneTemplate` to `src/domains/exports/hooks/use-export-templates.ts`

### UI Components for US3

- [ ] T048 [P] [US3] Create `TemplateCard` component in `src/domains/exports/components/template-card.tsx` (edit/delete actions)
- [ ] T049 [P] [US3] Create `DeleteTemplateDialog` component in `src/domains/exports/components/delete-template-dialog.tsx`
- [ ] T050 [US3] Add "Clone" button to pre-built template cards in `TemplateList`
- [ ] T051 [US3] Add "Edit" mode to `TemplateBuilder` for existing templates

**Checkpoint**: US3 complete - users can manage custom templates

---

## Phase 6: User Story 4 - Schedule Automated Exports (Priority: P3)

**Goal**: Finance managers can schedule daily/weekly/monthly exports with automatic notifications

**Independent Test**: Create schedule → Wait for scheduled time → Verify export generated → Check notification received

**Requirements**: FR-014, FR-015, FR-016, FR-017

### Convex Backend for US4

- [ ] T052 [P] [US4] Create schedule CRUD functions in `convex/functions/exportSchedules.ts` (create, list, get, update, setEnabled, remove)
- [ ] T053 [P] [US4] Create internal runScheduledExports handler in `convex/functions/exportJobs.ts`
- [ ] T054 [US4] Add hourly cron job for export-scheduler in `convex/crons.ts`
- [ ] T055 [US4] Add retry logic for failed exports (1 hour delay) in `convex/functions/exportJobs.ts`
- [ ] T056 [US4] Create notification trigger in `convex/functions/exportJobs.ts` (success/failure)

### React Hooks for US4

- [ ] T057 [US4] Create `useExportSchedules` hook in `src/domains/exports/hooks/use-export-schedules.ts`
- [ ] T058 [US4] Add hooks export to `src/domains/exports/hooks/index.ts`

### UI Components for US4

- [ ] T059 [P] [US4] Create `ScheduleList` component in `src/domains/exports/components/schedule-list.tsx`
- [ ] T060 [P] [US4] Create `ScheduleManager` component in `src/domains/exports/components/schedule-manager.tsx` (create/edit form)
- [ ] T061 [US4] Add "Schedules" tab to `ExportsPageContent`
- [ ] T062 [US4] Add enable/disable toggle to schedule cards

**Checkpoint**: US4 complete - users can schedule automated exports

---

## Phase 7: User Story 5 - Export History and Re-download (Priority: P3)

**Goal**: Users can view export history, re-download past exports, and request regeneration for archived exports

**Independent Test**: Run export → Navigate to history → Filter by date → Re-download file → Verify same content

**Requirements**: FR-018, FR-019, FR-020, FR-021

### Convex Backend for US5

- [ ] T063 [P] [US5] Create history list query in `convex/functions/exportHistory.ts` (with pagination)
- [ ] T064 [P] [US5] Create history get query in `convex/functions/exportHistory.ts`
- [ ] T065 [US5] Create requestRegeneration mutation in `convex/functions/exportHistory.ts`
- [ ] T066 [US5] Create archiveExpired internal mutation in `convex/functions/exportHistory.ts`
- [ ] T067 [US5] Add daily cleanup cron job in `convex/crons.ts` (archive files > 90 days)

### React Hooks for US5

- [ ] T068 [US5] Create `useExportHistory` hook in `src/domains/exports/hooks/use-export-history.ts`
- [ ] T069 [US5] Add hooks export to `src/domains/exports/hooks/index.ts`

### UI Components for US5

- [ ] T070 [P] [US5] Create `ExportHistoryList` component in `src/domains/exports/components/export-history-list.tsx`
- [ ] T071 [P] [US5] Create `HistoryFilters` component in `src/domains/exports/components/history-filters.tsx`
- [ ] T072 [US5] Add "History" tab to `ExportsPageContent`
- [ ] T073 [US5] Add re-download and regeneration actions to history items

**Checkpoint**: US5 complete - users can manage export history

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Refinements that affect multiple user stories

- [ ] T074 [P] Verify role-based access control across all components (FR-022, FR-023)
- [ ] T075 [P] Add empty state handling for all lists (no templates, no history, no schedules)
- [ ] T076 [P] Add loading states and error handling across all components
- [ ] T077 Add "No records found" message handling for empty exports
- [ ] T078 Add file size limit handling (split large exports)
- [ ] T079 Move existing Management Reports from Manager Approvals to Reporting page
- [ ] T080 Run `npm run build` and fix any TypeScript errors
- [ ] T081 Deploy to Convex prod: `npx convex deploy --yes`
- [ ] T082 Manual validation per quickstart.md testing checklist

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)           → No dependencies
Phase 2 (Foundational)    → Depends on Phase 1
Phase 3 (US1 - P1)        → Depends on Phase 2 ← MVP
Phase 4 (US2 - P2)        → Depends on Phase 2
Phase 5 (US3 - P2)        → Depends on Phase 4 (needs template builder)
Phase 6 (US4 - P3)        → Depends on Phase 2
Phase 7 (US5 - P3)        → Depends on Phase 3 (needs export execution)
Phase 8 (Polish)          → Depends on all desired user stories
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (P1) | Foundational only | Phase 2 complete |
| US2 (P2) | Foundational only | Phase 2 complete |
| US3 (P2) | US2 (template builder) | Phase 4 complete |
| US4 (P3) | Foundational only | Phase 2 complete |
| US5 (P3) | US1 (export execution) | Phase 3 complete |

### Parallel Opportunities

**After Phase 2 completes**, these can run in parallel:
- US1 (Pre-built templates)
- US2 (Custom template builder)
- US4 (Scheduled exports)

**After Phase 3 completes**, add:
- US5 (Export history)

**After Phase 4 completes**, add:
- US3 (Save/reuse templates)

---

## Parallel Example: Phase 3 (US1)

```bash
# Launch Convex backend tasks in parallel:
Task T014: "Create template list query in convex/functions/exportTemplates.ts"
Task T015: "Create template get query in convex/functions/exportTemplates.ts"
Task T016: "Create preview query in convex/functions/exportJobs.ts"
Task T017: "Create execute mutation in convex/functions/exportJobs.ts"

# Launch hooks in parallel:
Task T021: "Create useExportTemplates hook"
Task T022: "Create useExportPreview hook"
Task T023: "Create useExecuteExport hook"

# Launch UI components in parallel:
Task T025: "Create ModuleSelector component"
Task T026: "Create TemplateList component"
Task T027: "Create ExportFilters component"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Pre-built Templates)
4. **STOP and VALIDATE**: Test pre-built exports with SQL Payroll template
5. Deploy/demo if ready

### Incremental Delivery

| Increment | Delivers | Value |
|-----------|----------|-------|
| MVP | US1 | Users can export with 5 pre-built templates |
| +1 | US2 + US3 | Users can create and save custom templates |
| +2 | US4 | Users can schedule automated exports |
| +3 | US5 | Users can view history and re-download |

### Suggested Order (Sequential)

1. Phase 1 + 2 (Setup + Foundational)
2. Phase 3 (US1 - MVP) → **Deploy**
3. Phase 4 + 5 (US2 + US3 - Custom Templates) → **Deploy**
4. Phase 6 (US4 - Scheduling) → **Deploy**
5. Phase 7 (US5 - History) → **Deploy**
6. Phase 8 (Polish)

---

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 82 |
| Setup Tasks | 5 |
| Foundational Tasks | 8 |
| US1 Tasks (P1 - MVP) | 20 |
| US2 Tasks (P2) | 9 |
| US3 Tasks (P2) | 9 |
| US4 Tasks (P3) | 11 |
| US5 Tasks (P3) | 11 |
| Polish Tasks | 9 |
| Parallelizable Tasks | 38 (46%) |

---

## Notes

- [P] tasks can run in parallel (different files, no dependencies)
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 delivers immediate value as MVP
