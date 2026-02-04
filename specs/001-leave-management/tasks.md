# Tasks: Leave & Time-Off Management

**Input**: Design documents from `/specs/001-leave-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Test tasks included as specified in spec.md testing section (Vitest unit + Playwright E2E).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Role Access Summary

Based on existing expense claims RBAC patterns:

| Role | Access |
|------|--------|
| **Employee** | Leave Apply page (sidebar), My Leave Requests list, Leave Balance widget, Team Calendar (view only) |
| **Manager** | All employee access + Manager Approvals page with new "Leave Requests" tab alongside expense claims |
| **Admin/Owner** | All manager access + Business Settings with new "Leave Management" tab (leave types, holidays, accrual rules) |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US9)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and domain structure

- [x] T001 Create domain directory structure at `src/domains/leave-management/` with types/, hooks/, lib/, components/ subdirectories
- [x] T002 [P] Create `convex/functions/` placeholder files for leave module (leaveRequests.ts, leaveBalances.ts, leaveTypes.ts, publicHolidays.ts)
- [x] T003 [P] Create `src/lib/data/public-holidays/` directory for static holiday JSON files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Schema & Types

- [ ] T004 Add leave tables to `convex/schema.ts`: leave_requests, leave_balances, leave_types, public_holidays with all indexes per data-model.md
- [ ] T005 [P] Create type definitions in `src/domains/leave-management/types/index.ts`: LeaveRequest, LeaveBalance, LeaveType, PublicHoliday, LeaveRequestStatus enum
- [ ] T006 [P] Add leave status constants to `src/lib/constants/statuses.ts`: DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED

### Seed Data

- [ ] T007 [P] Create public holiday JSON files in `src/lib/data/public-holidays/`: my-2026.json, sg-2026.json, id-2026.json, ph-2026.json, th-2026.json, vn-2026.json
- [ ] T008 [P] Create `convex/migrations/leaveManagement.ts` seed functions: seedLeaveTypes (4 default types), seedPublicHolidays (from JSON files)

### Core Utilities

- [ ] T009 Implement business day calculator in `src/domains/leave-management/lib/day-calculator.ts`: calculateBusinessDays(startDate, endDate, holidays, excludeWeekends)
- [ ] T010 [P] Create leave workflow state machine in `src/domains/leave-management/lib/leave-workflow.ts`: canTransition(), getAvailableTransitions(), validateTransition()

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Employee Submits Leave Request (Priority: P1) 🎯 MVP

**Goal**: Employee can submit a leave request with date validation and business day calculation. Request auto-routes to assigned manager (via managerId in business_memberships).

**Role Access**: Employee (all authenticated users)

**Independent Test**: Employee opens Leave Apply page → selects dates and leave type → sees calculated days → submits → status becomes "submitted" → routes to assigned manager

### Tests for User Story 1

- [ ] T011 [P] [US1] Unit test for day calculator in `src/domains/leave-management/__tests__/day-calculator.test.ts`
- [ ] T012 [P] [US1] Unit test for leave workflow state machine in `src/domains/leave-management/__tests__/leave-workflow.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implement `convex/functions/leaveRequests.ts`: create, update, submit, list, getById mutations/queries with validation (auto-set approverId from user's managerId)
- [ ] T014 [P] [US1] Implement `convex/functions/publicHolidays.ts`: getByCountry, getForBusiness queries
- [ ] T015 [US1] Create `src/domains/leave-management/hooks/use-leave-requests.ts`: useCreateLeaveRequest, useSubmitLeaveRequest, useMyLeaveRequests hooks
- [ ] T016 [US1] Create `src/domains/leave-management/lib/data-access.ts`: Convex query wrappers for leave operations
- [ ] T017 [US1] Create `src/domains/leave-management/components/leave-request-form.tsx`: date picker, leave type selector, notes field, business day preview, submit button
- [ ] T018 [US1] Add overlap detection validation in create mutation: check for existing approved/submitted requests in date range
- [ ] T019 [US1] Create `src/domains/leave-management/components/my-leave-requests.tsx`: list employee's own requests with status badges
- [ ] T020 [US1] Create employee Leave Apply page at `src/app/[locale]/leave/page.tsx`: server-side auth, sidebar, leave request form + my requests list
- [ ] T021 [US1] Add "Leave" item to sidebar navigation in `src/components/ui/sidebar.tsx` (visible to all authenticated users)

**Checkpoint**: Employee can submit leave requests with validation, routes to assigned manager

---

## Phase 4: User Story 2 - Manager Approves/Rejects Leave Request (Priority: P1) 🎯 MVP

**Goal**: Manager can view pending leave requests in a new tab alongside expense claims, and approve/reject with notes. Balance auto-updates on approval.

**Role Access**: Manager, Finance Admin, Owner

**Independent Test**: Manager opens Manager Approvals → clicks "Leave Requests" tab → sees pending requests for their direct reports → clicks approve → request status changes → employee balance updates

### Tests for User Story 2

- [ ] T022 [P] [US2] Unit test for balance update logic in `src/domains/leave-management/__tests__/balance-update.test.ts`

### Implementation for User Story 2

- [ ] T023 [US2] Implement approve/reject mutations in `convex/functions/leaveRequests.ts`: approve (with balance update), reject (with required reason), getPendingForManager query (returns requests where approverId matches user)
- [ ] T024 [US2] Implement `convex/functions/leaveBalances.ts`: getByUser, update (deduct on approve, restore on cancel), initializeBalance
- [ ] T025 [US2] Create `src/domains/leave-management/components/leave-approval-list.tsx`: pending leave requests list with approve/reject actions for manager
- [ ] T026 [US2] Create `src/domains/leave-management/components/leave-approval-card.tsx`: individual leave request card with employee info, dates, days, notes, approve/reject buttons
- [ ] T027 [US2] Extend existing Manager Approvals dashboard at `src/domains/expense-claims/components/expense-approval-dashboard.tsx`: add new "Leave Requests" tab alongside existing tabs (Overview, Pending Approvals, Analytics, Reports)
- [ ] T028 [US2] Update page title at `src/app/[locale]/manager/approvals/page.tsx`: change from "Expense Approvals" to "Manager Approvals" to reflect unified queue

**Checkpoint**: Manager can approve/reject leave requests from unified approval dashboard, balances update automatically

---

## Phase 5: User Story 3 - Employee Views Balance (Priority: P1) 🎯 MVP

**Goal**: Employee sees real-time leave balance with entitled, used, remaining breakdown on the Leave page

**Role Access**: Employee (all authenticated users)

**Independent Test**: Employee opens Leave page → sees balance widget at top → values match database → updates in real-time after manager approval

### Implementation for User Story 3

- [ ] T029 [US3] Create `src/domains/leave-management/hooks/use-leave-balances.ts`: useMyBalances, useBalanceByType hooks with Convex subscriptions
- [ ] T030 [US3] Create `src/domains/leave-management/components/leave-balance-widget.tsx`: cards showing entitled, used, adjustments, carryover, remaining per leave type
- [ ] T031 [US3] Integrate balance widget into Leave page at `src/app/[locale]/leave/page.tsx` (above request form/list)

**Checkpoint**: Employee can view real-time balance - MVP complete (US1 + US2 + US3)

---

## Phase 6: User Story 4 - All Users View Team Calendar (Priority: P2)

**Goal**: All users can see team availability on calendar with approved/pending leave and holidays

**Role Access**: All authenticated users (employee view shows team, manager view shows direct reports with filter options)

**Independent Test**: User opens Team Calendar → sees team members' leave as colored blocks → can filter by leave type → holidays displayed

### Implementation for User Story 4

- [ ] T032 [US4] Implement `convex/functions/teamCalendar.ts`: getEvents query returning CalendarResponse (leave events + holidays + conflicts), filtered by business
- [ ] T033 [US4] Create `src/domains/leave-management/hooks/use-team-calendar.ts`: useTeamCalendar hook with date range params
- [ ] T034 [US4] Create `src/domains/leave-management/components/team-calendar.tsx`: calendar grid with leave blocks, holiday markers, conflict indicators (using existing calendar patterns if available or react-big-calendar)
- [ ] T035 [P] [US4] Add calendar filtering controls: by leave type, by team member, by status
- [ ] T036 [US4] Create Team Calendar page at `src/app/[locale]/team-calendar/page.tsx`: server-side auth (all roles), sidebar, calendar component
- [ ] T037 [US4] Add "Team Calendar" item to sidebar navigation in `src/components/ui/sidebar.tsx` (visible to all authenticated users)

**Checkpoint**: All users can view team calendar with leave and holidays

---

## Phase 7: User Story 5 - Admin Configures Leave Types (Priority: P2)

**Goal**: Admin can create/edit leave types with custom settings per organization in Business Settings → Leave Management tab

**Role Access**: Admin/Owner only

**Independent Test**: Admin opens Business Settings → clicks "Leave Management" tab → creates new leave type → sets days/approval/deduct flags → type appears in employee form

### Implementation for User Story 5

- [ ] T038 [US5] Implement `convex/functions/leaveTypes.ts`: list, create, update, toggleActive mutations with validation (unique code per business)
- [ ] T039 [US5] Create `src/domains/leave-management/components/leave-type-settings.tsx`: CRUD table for leave types with inline editing (name, code, defaultDays, requiresApproval, deductsBalance, color, isActive)
- [ ] T040 [US5] Create `src/domains/leave-management/components/leave-settings-client.tsx`: wrapper component with tabs (Leave Types, Public Holidays, Accrual Rules)
- [ ] T041 [US5] Extend Business Settings at `src/domains/account-management/components/tabbed-business-settings.tsx`: add new "Leave Management" tab (owner/admin only) that renders leave-settings-client.tsx

**Checkpoint**: Admin can customize leave types in Business Settings

---

## Phase 8: User Story 6 - System Shows Public Holidays (Priority: P2)

**Goal**: Business day calculation automatically excludes public holidays for employee's country

**Role Access**: System behavior (affects all users' leave calculations)

**Independent Test**: Employee in SG → selects dates spanning SG public holiday → business days exclude holiday → shown in form preview

### Implementation for User Story 6

- [ ] T042 [US6] Integrate holiday lookup in leave request form: fetch holidays for business country and year
- [ ] T043 [US6] Display holiday indicators in date picker component (marked or tooltip showing holiday name)
- [ ] T044 [US6] Update day calculator call to include fetched holidays array

**Checkpoint**: Holidays automatically excluded from business day calculation

---

## Phase 9: User Story 7 - Employee Cancels Request (Priority: P2)

**Goal**: Employee can cancel submitted or approved (future only) requests with balance restoration

**Role Access**: Employee (own requests only)

**Independent Test**: Employee cancels approved future request → status changes to cancelled → balance restored → shows in manager's view

### Implementation for User Story 7

- [ ] T045 [US7] Implement cancel mutation in `convex/functions/leaveRequests.ts`: validate cancellation rules (future dates only for approved), restore balance if was approved
- [ ] T046 [US7] Add cancel button/action to my-leave-requests.tsx component (show only for cancellable requests)
- [ ] T047 [P] [US7] Add cancellation confirmation dialog with optional reason field

**Checkpoint**: Employee can cancel requests with proper balance restoration

---

## Phase 10: User Story 8 - Admin Manages Custom Holidays (Priority: P3)

**Goal**: Admin can add company-specific holidays and set country calendar in Business Settings → Leave Management tab

**Role Access**: Admin/Owner only

**Independent Test**: Admin adds "Company Retreat Day" → appears in all employee calendars → excluded from business day calculations

### Implementation for User Story 8

- [ ] T048 [US8] Implement addCustom, removeCustom mutations in `convex/functions/publicHolidays.ts`: create/delete business-specific holidays
- [ ] T049 [US8] Create `src/domains/leave-management/components/holiday-settings.tsx`: country selector, system holidays display, custom holiday add/remove UI
- [ ] T050 [US8] Integrate holiday-settings.tsx into leave-settings-client.tsx (Public Holidays tab)
- [ ] T051 [US8] Update holiday queries to merge system (by country) + custom (by business) holidays

**Checkpoint**: Admin can manage custom company holidays and set country calendar

---

## Phase 11: User Story 9 - System Applies Accrual Rules (Priority: P3)

**Goal**: Balance automatically adjusts based on accrual rules (carryover, annual reset)

**Role Access**: Admin configures rules, System applies automatically

**Independent Test**: New year begins → carryover applied per policy → new entitled days added → employee sees updated balance

### Implementation for User Story 9

- [ ] T052 [US9] Add accrual fields to leave_types schema: carryoverCap, carryoverPolicy, prorationEnabled
- [ ] T053 [US9] Implement balance initialization for new year in `convex/functions/leaveBalances.ts`: applyAccrualRules, initializeYearBalance (scheduled job or on-demand)
- [ ] T054 [US9] Create `src/domains/leave-management/components/accrual-settings.tsx`: carryover cap input, policy selector (none, cap, unlimited)
- [ ] T055 [US9] Integrate accrual-settings.tsx into leave-settings-client.tsx (Accrual Rules tab)

**Checkpoint**: Accrual rules automatically maintain balances

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T056 [P] E2E test for employee leave request journey in `tests/e2e/leave-management.spec.ts`
- [ ] T057 [P] E2E test for manager approval journey in `tests/e2e/leave-management.spec.ts`
- [ ] T058 Add leave-specific notification templates (submit, approve, reject, cancel) to existing notification system
- [ ] T059 [P] Add audit event logging for all leave actions (uses existing audit_events table with new eventTypes)
- [ ] T060 Mobile responsiveness review for all leave components
- [ ] T061 Run `npm run build` verification
- [ ] T062 Run quickstart.md validation (manual walkthrough)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-11)**: All depend on Foundational phase completion
  - P1 stories (US1, US2, US3) should complete first for MVP
  - P2 stories (US4, US5, US6, US7) can proceed in parallel after P1
  - P3 stories (US8, US9) proceed after P2
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundation only - independent
- **US2 (P1)**: Foundation + US1 (needs requests to approve)
- **US3 (P1)**: Foundation + US2 (needs balance updates from approval)
- **US4 (P2)**: Foundation + US1 (needs leave data to display)
- **US5 (P2)**: Foundation only - independent (admin settings)
- **US6 (P2)**: Foundation + US1 (integrates with request form)
- **US7 (P2)**: Foundation + US1 + US2 (needs approval flow for cancel)
- **US8 (P3)**: Foundation + US6 (extends holiday management)
- **US9 (P3)**: Foundation + US3 + US5 (extends balance management with leave type config)

### Parallel Opportunities

- All Setup tasks can run in parallel
- Foundational tasks marked [P] can run in parallel
- US1 tests (T011, T012) can run in parallel
- US4 tasks (T035) can run parallel with T034
- US7 tasks (T046, T047) can run in parallel
- All E2E and polish tasks marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (P1 Stories: US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 - Employee submits leave (Leave page, sidebar nav)
4. Complete Phase 4: US2 - Manager approves/rejects (Leave Requests tab in Manager Approvals)
5. Complete Phase 5: US3 - Employee views balance (Balance widget on Leave page)
6. **STOP and VALIDATE**: Test full submit→approve→balance flow
7. Deploy MVP

### Incremental Delivery

1. MVP (US1-US3) → Core leave functionality with role-based access
2. Add US4-US7 (P2) → Team calendar, admin settings, holidays, cancellation
3. Add US8-US9 (P3) → Custom holidays, accrual rules
4. Polish → Production ready

### Critical Path

```
Setup → Foundation → US1 → US2 → US3 → [MVP]
                      ↓
                 US4 (calendar), US5 (admin settings), US6 (holidays), US7 (cancel)
                      ↓
                 US8 (custom holidays), US9 (accrual)
                      ↓
                    Polish
```

---

## Role Access Implementation Summary

### Sidebar Navigation Changes (`src/components/ui/sidebar.tsx`)

```
// All users see:
- Leave (new) → /leave
- Team Calendar (new) → /team-calendar

// Managers/Admins see:
- Manager Approvals (existing) → /manager/approvals (now has Leave Requests tab)

// Admins only see:
- Business Settings (existing) → /business-settings (now has Leave Management tab)
```

### Manager Approvals Page Changes

Add "Leave Requests" tab to existing `expense-approval-dashboard.tsx`:
- Tab 1: Overview (existing)
- Tab 2: Pending Approvals (existing - expense claims)
- Tab 3: **Leave Requests (new)**
- Tab 4: Analytics (existing)
- Tab 5: Reports (existing)

### Business Settings Page Changes

Add "Leave Management" tab to existing `tabbed-business-settings.tsx`:
- Tab 1: Business Profile (existing)
- Tab 2: Categories (existing)
- Tab 3: Team Management (existing, owner only)
- Tab 4: API Keys (existing, owner only)
- Tab 5: **Leave Management (new, owner/admin only)**
  - Sub-tab: Leave Types
  - Sub-tab: Public Holidays
  - Sub-tab: Accrual Rules

---

## Notes

- [P] tasks = different files, no dependencies
- [US#] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Convex schema changes require `npx convex dev` (auto-sync) or `npx convex deploy --yes` (prod)
- Run `npm run build` before marking phase complete
- Follow existing RBAC patterns: server-side `requirePermission()` + client-side `useUserRole()`
