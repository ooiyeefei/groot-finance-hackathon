# Tasks: Leave Management P1 Enhancements

**Input**: Design documents from `/specs/034-leave-enhance/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema Changes)

**Purpose**: Schema modifications and shared utilities that all stories depend on

- [x] T001 Add `leaveYearStartMonth: v.optional(v.number())` to businesses table in `convex/schema.ts`
- [x] T002 Add `importSource: v.optional(...)` and `importedAt: v.optional(v.number())` to leave_balances table in `convex/schema.ts`
- [x] T003 Create leave year utility module at `src/domains/leave-management/lib/leave-year-utils.ts` with `getLeaveYearBoundaries()`, `getCurrentLeaveYear()`, `formatLeaveYearLabel()` functions per contracts/leave-year-config.md
- [ ] T004 Deploy Convex schema changes: `npx convex deploy --yes` *(DEFERRED — deploy from main after merge)*

**Checkpoint**: Schema deployed, leave year utilities available for all stories

---

## Phase 2: Foundational (Leave Year Config — US5 foundation)

**Purpose**: Leave year configuration UI that also serves as foundation for reports and balance queries

- [x] T005 Add `businesses.updateLeaveYearStartMonth` mutation to `convex/functions/businesses.ts` — validate 1-12, admin/owner only
- [x] T006 Add leave year start month config section (dropdown + confirmation warning dialog) to `src/domains/leave-management/components/leave-management-settings.tsx`
- [x] T007 Update `leaveBalances.getMyBalances()` in `convex/functions/leaveBalances.ts` to use `getCurrentLeaveYear(startMonth)` instead of `new Date().getFullYear()` when computing default year
- [x] T008 Update `leaveBalances.getBalance()` and `leaveBalances.getTeamBalances()` in `convex/functions/leaveBalances.ts` to respect leave year start month from business config

**Checkpoint**: Leave year configuration working, balance queries respect configured year boundary

---

## Phase 3: User Story 1 — Team Overlap Conflict Warnings (Priority: P1) 🎯 MVP

**Goal**: Managers see a warning dialog with team overlap details before approving leave that conflicts with other team members' approved or submitted leave.

**Independent Test**: Create two overlapping leave requests for the same team, approve the second — verify warning dialog appears with correct overlap details.

### Implementation for User Story 1

- [x] T009 [US1] Add `checkOverlapsForApproval` query to `convex/functions/leaveRequests.ts` — accepts businessId + leaveRequestId, queries leave_requests with status in (approved, submitted) for same manager's direct reports, computes per-person overlap dates, returns `{ hasOverlaps, overlappingMembers[], totalOverlapDays }` per contracts/overlap-check.md
- [x] T010 [US1] Create `src/domains/leave-management/components/overlap-warning-dialog.tsx` — AlertDialog showing overlap count headline, table of conflicting members (name, leave type, status badge, overlapping dates), "Approve Anyway" primary button and "Cancel" secondary button
- [x] T011 [US1] Integrate overlap warning into `src/domains/leave-management/components/leave-approvals-content.tsx` — intercept approve button click, call `checkOverlapsForApproval`, show warning dialog if `hasOverlaps=true`, proceed to existing approve mutation only on "Approve Anyway" confirmation, skip dialog if no overlaps

**Checkpoint**: Overlap warnings working end-to-end. Manager sees warning when approving conflicting leave, can proceed or cancel.

---

## Phase 4: User Story 2 — Mobile Push Notifications (Priority: P1)

**Goal**: Managers receive push notifications when leave is submitted; employees receive push notifications when leave is approved/rejected. Tapping opens the relevant page.

**Independent Test**: Submit a leave request, verify manager's device receives push notification within 30 seconds.

### Implementation for User Story 2

- [x] T012 [P] [US2] Create push notification Lambda at `src/lambda/push-notification/index.ts` — read APNs P8 key + FCM service account from SSM, send to APNs HTTP/2 API for iOS tokens, send to FCM HTTP v1 API for Android tokens, return `{ success, sent, failed, errors[] }` per contracts/push-notification.md
- [x] T013 [P] [US2] Create CDK stack at `infra/lib/push-notification-stack.ts` — Lambda function `finanseal-push-notification` (Node.js 20, ARM_64, 256MB, 30s timeout), IAM permissions for SSM read + Convex HTTP query, SSM parameter `/finanseal/prod/fcm-service-account` placeholder
- [x] T014 [US2] Add push Lambda to `infra/bin/push-notification.ts` stack entry point
- [x] T015 [US2] Extend `src/app/api/v1/leave-management/notifications/route.ts` — after sending email, if `recipientUserId` provided, invoke push Lambda via IAM-authenticated Lambda invocation (using Vercel OIDC role), pass title/body/deepLink based on notification type
- [x] T016 [US2] Update leave approval/rejection/submission handlers in `src/domains/leave-management/components/leave-approvals-content.tsx` and `src/domains/leave-management/hooks/use-leave-requests.ts` to pass `recipientUserId` and `leaveRequestId` to the notification API call
- [ ] T017 [US2] Add Capacitor push notification registration *(DEFERRED — mobile-side, requires Capacitor project)* to mobile app initialization — call `convex/functions/pushSubscriptions.register` mutation on app start with platform + deviceToken, handle deep link routing on notification tap to `/en/leave-management?tab=approvals&id=xxx` or `/en/leave-management?tab=my-leave&id=xxx`

**Checkpoint**: Push notifications delivered on submit/approve/reject. Deep links open correct page.

---

## Phase 5: User Story 3 — Bulk Import Leave Balances (Priority: P2)

**Goal**: Admins can upload a CSV/XLSX file to create or update leave balances for multiple employees in one operation.

**Independent Test**: Prepare CSV with 10 rows (employee emails, leave types, year, entitled days), upload in settings, verify balances created/updated correctly.

### Implementation for User Story 3

- [x] T018 [P] [US3] Add `LEAVE_BALANCE_FIELDS` schema definition to `src/lib/csv-parser/lib/schema-definitions.ts` — 7 fields (employeeEmail, leaveTypeCode, year, entitled, used, carryover, adjustments) with aliases per contracts/leave-balance-import.md, register in `getSchemaFields()` switch for type `"leave_balance"`
- [x] T019 [P] [US3] Add `leaveBalances.importFromCsv` action and `leaveBalances.bulkUpsert` internal mutation to `convex/functions/leaveBalances.ts` — action validates admin role, resolves emails→userIds and codes→leaveTypeIds, collects errors for invalid rows, calls bulkUpsert for valid rows, returns `{ created, updated, skipped, errors[] }` per contracts/leave-balance-import.md
- [x] T020 [US3] Add "Import Balances" button and `<CsvImportModal schemaType="leave_balance" />` integration to `src/domains/leave-management/components/leave-management-settings.tsx` — on import complete, call `leaveBalances.importFromCsv` action with mapped rows, show toast with created/updated/skipped counts, offer downloadable error report for skipped rows

**Checkpoint**: CSV import working end-to-end. Balances created/updated with correct values, invalid rows reported clearly.

---

## Phase 6: User Story 4 — Leave Reports & Export (Priority: P2)

**Goal**: Admins and managers can generate leave balance summary, utilization, and absence trends reports with CSV and PDF export.

**Independent Test**: Navigate to reports tab, generate Balance Summary report, verify data matches known balances, export as CSV and PDF.

### Implementation for User Story 4

- [x] T021 [P] [US4] Create `convex/functions/leaveReports.ts` with three actions: `balanceSummary`, `utilization`, `absenceTrends` — each uses internalQuery for DB reads (NOT reactive query per bandwidth rules), respects role-based filtering (admin sees all, manager sees direct reports), returns structured data per contracts/leave-reports.md, uses `getCurrentLeaveYear()` for default year
- [x] T022 [P] [US4] Create `src/domains/leave-management/hooks/use-leave-reports.ts` — hook wrapping `useAction` calls for all 3 report types, manages loading/error state, caches results in React state
- [x] T023 [US4] Create `src/domains/leave-management/components/leave-reports-content.tsx` — Tabs component with 3 report views: Balance Summary (data table with employee rows, leave type columns), Utilization (bar chart by team using Recharts + summary table), Absence Trends (line chart by month using Recharts + stacked bars by leave type), year selector dropdown, empty state for no data
- [x] T024 [P] [US4] Create `src/domains/leave-management/components/leave-report-pdf-document.tsx` — @react-pdf/renderer Document component with business name header, report title, date range, data table matching on-screen report, follows use-invoice-pdf.ts pattern
- [x] T025 [P] [US4] Create `src/domains/leave-management/hooks/use-leave-report-pdf.ts` — hook with dynamic import of @react-pdf/renderer + pdf document component, `generatePdf(reportType, data)` → blob → download, `isGenerating` state
- [x] T026 [US4] Add CSV export function to `src/domains/leave-management/hooks/use-leave-reports.ts` — `exportCsv(reportType, data)` converts report data to CSV string using papaparse `unparse()`, triggers browser download
- [x] T027 [US4] Add reports tab to leave management page — add "Reports" tab alongside existing tabs in the leave management page (accessible to admin and manager roles only), renders `<LeaveReportsContent />`

**Checkpoint**: All 3 report types generating correctly with role-based filtering, CSV and PDF exports working.

---

## Phase 7: User Story 5 — Leave Year Configuration (Priority: P3)

**Goal**: Leave year start month config affects all balance calculations, carryover, and reports correctly.

**Independent Test**: Set business leave year to April, verify balance display shows Apr-Mar period, reports default to configured year boundary.

### Implementation for User Story 5

- [x] T028 [US5] Wire leave year config into carryover logic in `convex/functions/leaveBalances.ts` — `carryover()` function uses business `leaveYearStartMonth` to determine when carryover triggers (e.g., April for Apr-Mar year)
- [x] T029 [US5] Wire leave year config into leave reports in `convex/functions/leaveReports.ts` — all 3 report actions use `getLeaveYearBoundaries()` for date range filtering, yearLabel for display
- [x] T030 [US5] Update leave balance widget in `src/domains/leave-management/components/leave-balance-widget.tsx` to show leave year label (e.g., "Apr 2026 - Mar 2027") when non-January start month configured
- [x] T031 [US5] Add mid-year change warning in settings page — when admin changes leave year start month and current date is within an active leave year, show confirmation dialog explaining existing balances may need manual adjustment per FR-026

**Checkpoint**: Leave year configuration fully integrated — balances, reports, carryover, and UI all respect the configured boundary.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, deployment, and validation

- [ ] T032 Run `npm run build` — fix any TypeScript errors until build passes *(DEFERRED — requires node_modules, run after merge)*
- [ ] T033 Deploy Convex to production: `npx convex deploy --yes` *(DEFERRED — deploy from main after merge)*
- [ ] T034 Deploy CDK push notification stack: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` *(DEFERRED — deploy after merge)*
- [x] T035 Update `src/domains/leave-management/CLAUDE.md` with new features: overlap warnings, push notifications, bulk import, reports, leave year config
- [ ] T036 Add "How It Works" info drawer to reports tab *(DEFERRED — polish task, low priority)* in `src/domains/leave-management/components/leave-reports-content.tsx` per Feature Info Drawer Pattern

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (schema deployed)
- **Phase 3 (US1 Overlap Warnings)**: Depends on Phase 2
- **Phase 4 (US2 Push Notifications)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US3 Bulk Import)**: Depends on Phase 1 (schema) — can run in parallel with Phases 3-4
- **Phase 6 (US4 Reports)**: Depends on Phase 2 (leave year utils) — can run in parallel with Phases 3-5
- **Phase 7 (US5 Leave Year)**: Depends on Phases 2 + 6 (leave year config + reports exist)
- **Phase 8 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Overlap Warnings)**: Independent — only needs schema + leave year foundation
- **US2 (Push Notifications)**: Independent — only needs schema
- **US3 (Bulk Import)**: Independent — only needs schema
- **US4 (Reports)**: Independent — only needs schema + leave year utils
- **US5 (Leave Year Config)**: Depends on US4 (reports must exist to wire year config into them)

### Parallel Opportunities

Within Phase 4 (US2): T012 (Lambda) and T013 (CDK stack) can run in parallel
Within Phase 5 (US3): T018 (schema def) and T019 (Convex mutation) can run in parallel
Within Phase 6 (US4): T021 (backend), T022 (hook), T024 (PDF doc), T025 (PDF hook) can run in parallel
Across phases: US1, US2, US3, US4 can all run in parallel after Phase 2

---

## Parallel Example: Phase 6 (Reports)

```bash
# Launch backend + hooks + PDF components together:
Task: "Create convex/functions/leaveReports.ts (3 report actions)"
Task: "Create use-leave-reports.ts hook"
Task: "Create leave-report-pdf-document.tsx"
Task: "Create use-leave-report-pdf.ts hook"

# Then sequentially:
Task: "Create leave-reports-content.tsx (depends on hook + report data shape)"
Task: "Add CSV export to use-leave-reports.ts"
Task: "Add reports tab to page"
```

---

## Implementation Strategy

### MVP First (User Story 1: Overlap Warnings)

1. Complete Phase 1: Schema changes + deploy
2. Complete Phase 2: Leave year foundation
3. Complete Phase 3: Overlap warnings (3 tasks)
4. **STOP and VALIDATE**: Test overlap warnings with admin + manager accounts
5. Deploy if ready — immediate value for managers

### Incremental Delivery

1. Setup + Foundation → Schema deployed, leave year utils available
2. Add US1 (Overlap Warnings) → Test → Deploy (MVP!)
3. Add US2 (Push Notifications) → Test → Deploy CDK stack
4. Add US3 (Bulk Import) → Test → Deploy
5. Add US4 (Reports) → Test → Deploy
6. Add US5 (Leave Year Config) → Test → Deploy
7. Polish → Final deploy

---

## Notes

- All Convex functions MUST use `action` + `internalQuery` for report aggregations (bandwidth budget)
- Push notification Lambda uses IAM-native SSM access — no credentials in Convex
- CSV import uses existing `src/lib/csv-parser/` shared capability — domain handles persistence
- PDF export follows `use-invoice-pdf.ts` pattern — dynamic import + blob + download
- Reports tab only visible to admin and manager roles
- All UI follows design system: `bg-primary` for actions, `bg-destructive` for destructive, semantic tokens only
