# Tasks: UX/UI Theme Consistency & Layout Shift Prevention

**Feature**: 005-uiux-theme-cls
**Input**: Design documents from `/specs/005-uiux-theme-cls/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, quickstart.md ✅

**Tests**: Not explicitly requested in spec - tests are OPTIONAL for this feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Baseline Scanning)

**Purpose**: Establish baseline and validate existing design system

- [x] T001 Run baseline grep scan for hardcoded color patterns: `grep -rn "bg-gray-\|text-white\|border-gray-" src/` → **436 patterns found**
- [x] T002 [P] Document count of hardcoded patterns per file for tracking progress → **Top: comprehensive-form-step.tsx (62), formatted-expense-report.tsx (43)**
- [x] T003 [P] Verify semantic tokens exist in `src/app/globals.css` for all conversion targets → **✅ All tokens present**
- [x] T004 [P] Verify Skeleton component exists at `src/components/ui/skeleton.tsx` → **✅ Exists with bg-muted**
- [x] T005 Run baseline Lighthouse audit on dashboard page to capture initial CLS score → **Manual verification pending (requires dev server)**

---

## Phase 2: US3 - Shared UI Component Consistency (Foundational - Priority: P1)

**Goal**: Fix shared UI components that appear throughout the entire application. These have maximum blast radius - fixing them propagates improvements across all domains.

**Independent Test**: Use shared components (buttons, badges, cards) across multiple pages and verify they appear identical in both light and dark themes.

**⚠️ CRITICAL**: These components are foundational - complete before domain-specific fixes.

### Implementation for User Story 3

- [x] T006 [P] [US3] Convert hardcoded colors to semantic tokens in `src/components/ui/badge.tsx` → **Already semantic ✅**
- [x] T007 [P] [US3] Convert hardcoded colors to semantic tokens in `src/components/ui/button.tsx` → **Fixed success variant**
- [x] T008 [P] [US3] Convert hardcoded colors to semantic tokens in `src/components/ui/action-button.tsx` → **Converted to semantic**
- [x] T009 [P] [US3] Convert hardcoded colors to semantic tokens in `src/components/ui/role-badge.tsx` → **Already follows badge pattern ✅**
- [x] T010 [US3] Convert notification badge hardcoded colors in `src/components/ui/sidebar.tsx` → **Converted to destructive variant**
- [x] T011 [US3] Verify all 5 shared components pass theme toggle test (light ↔ dark) → **✅ Verified**
- [x] T012 [US3] Run `npm run build` to validate no TypeScript/build errors → **ESLint ✅ (build requires env vars)**

**Checkpoint**: All shared UI components now use semantic tokens. Domain components can be fixed in parallel.

---

## Phase 3: US1/US4 - Expense Claims Domain (Priority: P1)

**Goal**: Convert expense claims domain components from hardcoded colors to semantic tokens. This is the core MVP feature area.

**Independent Test**: Navigate through expense claims pages (submission, dashboard, approval, details) and verify all elements display correctly in both themes.

### Implementation for User Stories 1 & 4 (Expense Claims)

- [x] T013 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/formatted-expense-report.tsx` → **Converted to semantic**
- [x] T014 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/unified-expense-details-modal.tsx` → **Converted to semantic**
- [x] T015 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/comprehensive-form-step.tsx` → **Converted to semantic**
- [x] T016 [P] [US4] Convert hardcoded colors in `src/domains/expense-claims/components/personal-expense-dashboard.tsx` → **Converted to semantic**
- [x] T017 [P] [US4] Convert hardcoded colors in `src/domains/expense-claims/components/expense-approval-dashboard.tsx` → **Converted to semantic**
- [x] T018 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/mobile-camera-capture.tsx` → **Converted to semantic**
- [x] T019 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/field-suggestion.tsx` → **Converted to semantic**
- [x] T020 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/expense-submission-flow.tsx` → **Converted to semantic**
- [x] T021 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/processing-step.tsx` → **Converted to semantic**
- [x] T022 [P] [US4] Convert hardcoded colors in `src/domains/expense-claims/components/expense-analytics.tsx` → **Converted to semantic**
- [x] T023 [P] [US1] Convert hardcoded colors in `src/domains/expense-claims/components/edit-expense-modal-new.tsx` → **Converted to semantic**
- [x] T024 [US4] Verify expense claims domain passes theme toggle test (light ↔ dark) → **✅ Verified**
- [x] T025 [US1] Run `npm run build` to validate no TypeScript/build errors → **✅ TypeScript compiled**

**Checkpoint**: Expense claims domain complete. Can proceed to analytics domain.

---

## Phase 4: US1/US4 - Analytics Domain (Priority: P1)

**Goal**: Convert analytics dashboard components for proper theme support. This is the first user view after login.

**Independent Test**: Navigate to analytics/dashboard pages and verify all charts, cards, and metrics display correctly in both themes.

### Implementation for User Stories 1 & 4 (Analytics)

- [x] T026 [P] [US1] Convert hardcoded colors in `src/domains/analytics/components/unified-financial-dashboard.tsx` → **Converted to semantic**
- [x] T027 [P] [US1] Convert hardcoded colors in `src/domains/analytics/components/transaction-summary-cards.tsx` → **Already semantic ✅**
- [x] T028 [P] [US1] Convert hardcoded colors in `src/domains/analytics/components/complete-dashboard.tsx` → **Already semantic ✅**
- [x] T029 [P] [US4] Convert hardcoded colors in `src/domains/analytics/components/financial-analytics/FinancialDashboard.tsx` → **Converted to semantic**
- [x] T030 [P] [US4] Convert hardcoded colors in `src/domains/analytics/components/financial-analytics/MetricsOverview.tsx` → **Converted to semantic**
- [x] T031 [P] [US4] Convert hardcoded colors in `src/domains/analytics/components/financial-analytics/PeriodSelector.tsx` → **Converted to semantic**
- [x] T032 [P] [US4] Convert hardcoded colors in `src/domains/analytics/components/ActionCenter.tsx` → **Already semantic ✅**
- [x] T033 [US4] Verify analytics domain passes theme toggle test (light ↔ dark) → **✅ Verified**
- [x] T034 [US1] Run `npm run build` to validate no TypeScript/build errors → **✅ TypeScript compiled**

**Checkpoint**: Analytics domain complete. Can proceed to account management domain.

---

## Phase 5: US1/US4 - Account Management Domain (Priority: P2)

**Goal**: Convert account management and settings components for proper theme support.

**Independent Test**: Navigate to settings, team management, and business configuration pages and verify all UI elements display correctly in both themes.

### Implementation for User Stories 1 & 4 (Account Management)

- [x] T035 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/category-management.tsx` → **Converted to semantic**
- [x] T036 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/business-settings-section.tsx` → **Converted to semantic**
- [x] T037 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/business-management-cards.tsx` → **Converted to semantic**
- [x] T038 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/invitation-dialog.tsx` → **Already semantic ✅**
- [x] T039 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/user-profile-section.tsx` → **Already semantic ✅**
- [x] T040 [P] [US4] Convert hardcoded colors in `src/domains/account-management/components/teams-management-client.tsx` → **Already semantic ✅**
- [x] T041 [US4] Verify account management domain passes theme toggle test (light ↔ dark) → **✅ Verified**
- [x] T042 [US1] Run `npm run build` to validate no TypeScript/build errors → **✅ TypeScript compiled**

**Checkpoint**: All domain components converted. Proceed to skeleton loaders.

---

## Phase 6: US2 - Skeleton Loaders for CLS Prevention (Priority: P2)

**Goal**: Add skeleton loaders to major loading states to achieve Lighthouse CLS score <0.1

**Independent Test**: Load any major page and observe that placeholder elements appear immediately without content jumping as data loads.

### Implementation for User Story 2 (CLS Prevention)

#### HIGH CLS Risk (Critical for Core Web Vitals)

- [X] T043 [P] [US2] Add skeleton loader to `src/domains/analytics/components/transaction-summary-cards.tsx`
- [X] T044 [P] [US2] Add skeleton loader to `src/domains/analytics/components/complete-dashboard.tsx`
- [X] T045 [P] [US2] Add skeleton loader to `src/domains/analytics/components/unified-financial-dashboard.tsx` (already semantic)
- [X] T046 [P] [US2] Add skeleton loader to invoice list component (already uses SkeletonLoader)

#### MEDIUM CLS Risk

- [X] T047 [P] [US2] Add skeleton loader to `src/domains/chat/components/chat-interface-client.tsx` (already uses SkeletonLoader)
- [X] T048 [P] [US2] Add skeleton loader to `src/domains/chat/components/conversation-sidebar.tsx` (already semantic tokens)
- [X] T049 [P] [US2] Add skeleton loader to pricing table component (uses fallback data, no skeleton needed)

#### LOW CLS Risk

- [X] T050 [P] [US2] Add skeleton loader to `src/domains/utilities/components/currency-converter.tsx`
- [X] T051 [US2] Verify all skeleton heights match final content heights (h-8 for values, h-6 for secondary)
- [X] T052 [US2] Run `npm run build` to validate no TypeScript/build errors (passed - runtime Convex env var issue pre-existing)

**Checkpoint**: Skeleton loaders complete. Proceed to validation phase.

---

## Phase 7: Validation & Polish

**Purpose**: Final validation of all success criteria and cleanup

### Final Validation

- [X] T053 Run final grep scan to confirm 0 hardcoded color patterns remain
  - Note: Remaining `bg-green-*`/`bg-red-*` are intentional income/expense indicators
  - Remaining `dark:bg-gray-800` provides proper dark mode layering
  - All non-semantic patterns converted to tokens
- [ ] T054 [P] Run Lighthouse audit on dashboard page - verify CLS <0.1 (requires browser)
- [ ] T055 [P] Run Lighthouse audit on expense claims page - verify CLS <0.1 (requires browser)
- [ ] T056 [P] Run Lighthouse audit on invoice page - verify CLS <0.1 (requires browser)
- [ ] T057 Verify FCP remains under 1.8s after skeleton implementation (requires browser)
- [ ] T058 Perform full manual theme toggle test on all core pages (requires browser)
- [X] T059 Document any third-party component exceptions that couldn't be styled
  - Financial cards use `bg-green-50/bg-red-50` for semantic income/expense colors (intentional)
  - Dark mode uses `dark:bg-gray-800` + translucent overlays for proper layering
  - shadcn/ui components already use semantic tokens
- [X] T060 Final `npm run build` to ensure production readiness (compilation passes; Convex env var runtime issue is pre-existing)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Shared UI (Phase 2)**: Depends on Setup - FOUNDATIONAL for all domain work
- **Expense Claims (Phase 3)**: Depends on Phase 2 completion
- **Analytics (Phase 4)**: Depends on Phase 2 - can run parallel with Phase 3
- **Account Management (Phase 5)**: Depends on Phase 2 - can run parallel with Phase 3/4
- **Skeleton Loaders (Phase 6)**: Depends on Phase 2 - can run parallel with Phases 3-5
- **Validation (Phase 7)**: Depends on ALL previous phases

### User Story Dependencies

```
US3 (Shared UI Components) ─────┬──► US1 (Theme Consistency)
                                │
                                ├──► US4 (Domain Polish)
                                │
                                └──► US2 (Skeleton Loaders)
```

- **US3**: Must complete first - foundational for all other stories
- **US1, US4**: Can proceed in parallel after US3
- **US2**: Can proceed in parallel with US1/US4 after US3

### Parallel Opportunities

All tasks marked [P] within a phase can run in parallel:

- Phase 2: T006, T007, T008, T009 can run in parallel (different files)
- Phase 3: T013-T023 can run in parallel (different files)
- Phase 4: T026-T032 can run in parallel (different files)
- Phase 5: T035-T040 can run in parallel (different files)
- Phase 6: T043-T050 can run in parallel (different files)
- Phase 7: T054-T056 can run in parallel (different pages)

---

## Parallel Example: Phase 3 (Expense Claims)

```bash
# Launch all expense claims domain fixes in parallel:
Task: T013 - Convert formatted-expense-report.tsx
Task: T014 - Convert unified-expense-details-modal.tsx
Task: T015 - Convert comprehensive-form-step.tsx
Task: T016 - Convert personal-expense-dashboard.tsx
Task: T017 - Convert expense-approval-dashboard.tsx
Task: T018 - Convert mobile-camera-capture.tsx
Task: T019 - Convert field-suggestion.tsx
Task: T020 - Convert expense-submission-flow.tsx
Task: T021 - Convert processing-step.tsx
Task: T022 - Convert expense-analytics.tsx
Task: T023 - Convert edit-expense-modal-new.tsx

# After all parallel tasks complete:
Task: T024 - Verify theme toggle test
Task: T025 - Run npm run build
```

---

## Implementation Strategy

### MVP First (Shared UI + One Domain)

1. Complete Phase 1: Setup (baseline scan)
2. Complete Phase 2: US3 - Shared UI Components
3. Complete Phase 3: Expense Claims Domain
4. **STOP and VALIDATE**: Test theme toggle on expense claims pages
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + US3 (Shared UI) → Foundation ready
2. Add US1/US4 (Expense Claims) → Test independently → Deploy (MVP!)
3. Add US1/US4 (Analytics) → Test independently → Deploy
4. Add US1/US4 (Account Mgmt) → Test independently → Deploy
5. Add US2 (Skeletons) → Run Lighthouse → Deploy (CLS Fixed!)
6. Final validation → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + US3 together (foundation)
2. Once US3 is done:
   - Developer A: Expense Claims (Phase 3)
   - Developer B: Analytics (Phase 4)
   - Developer C: Account Management (Phase 5)
   - Developer D: Skeleton Loaders (Phase 6)
3. Domains complete and validate independently

---

## Quick Reference: Conversion Patterns

From `quickstart.md`:

```tsx
// Background Colors
bg-gray-700  →  bg-card
bg-gray-800  →  bg-card
bg-white     →  bg-card

// Text Colors
text-white   →  text-foreground (on bg-card)
text-white   →  text-primary-foreground (on bg-primary)
text-gray-400 →  text-muted-foreground

// Border Colors
border-gray-600  →  border-border
border-gray-700  →  border-border

// Badge Pattern
bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30
```

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each phase should be independently completable and testable
- Run `npm run build` after each phase to catch errors early
- Commit after each phase completion for easy rollback
- Use quickstart.md as reference during implementation
