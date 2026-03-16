# Tasks: Surface Automation Rate Metric

**Feature**: 001-surface-automation-rate
**Input**: Design documents from `/specs/001-surface-automation-rate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Manual UAT testing only (no automated test implementation requested in spec)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Convex**: `convex/functions/`, `convex/schema.ts`, `convex/crons.ts`
- **React Components**: `src/domains/[domain]/components/`
- **React Hooks**: `src/domains/[domain]/hooks/`
- **Utilities**: `src/lib/utils/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema initialization and Git configuration

- [X] T001 Verify Git author configuration is set to `grootdev-ai` with email `dev@hellogroot.com`
- [X] T002 Add `automationMilestones` optional field to `businesses` table in `convex/schema.ts`
- [X] T003 Deploy schema changes to Convex with `npx convex deploy --yes`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Convex queries that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Convex Query Implementation

- [X] T004 Create `convex/functions/automationRate.ts` file structure with imports and validators
- [X] T005 [P] Implement helper function `calculatePeriodDateRange()` to convert period enum to Unix timestamps in `convex/functions/automationRate.ts`
- [X] T006 [P] Implement helper function `generateWeekRanges()` to create week boundaries (Monday-Sunday) in `convex/functions/automationRate.ts`
- [X] T007 Implement core aggregation function `aggregateAutomationRateData()` that queries all 4 data sources (AR, Bank, Fee, Expense) with deduplication logic in `convex/functions/automationRate.ts`
- [X] T008 Implement `getAutomationRate` Convex query in `convex/functions/automationRate.ts` - calculates rate for given business and period
- [X] T009 Implement `getAutomationRateTrend` Convex query in `convex/functions/automationRate.ts` - returns weekly trend data with optimization events
- [X] T010 Implement `getLifetimeStats` Convex query in `convex/functions/automationRate.ts` - returns cumulative lifetime automation statistics
- [X] T011 [P] Implement `getMilestones` Convex query in `convex/functions/automationRate.ts` - returns milestone achievement status

### Testing Foundational Queries

- [ ] T012 Test `getAutomationRate` query in Convex dashboard with test businessId for "today" period (Manual UAT)
- [ ] T013 Test `getAutomationRate` query with "week" period and verify 4-source aggregation (Manual UAT)
- [ ] T014 Test `getAutomationRateTrend` query with 8 weeks parameter and verify data structure (Manual UAT)
- [ ] T015 Test edge case: zero AI activity returns "No AI activity in this period" message (Manual UAT)
- [ ] T016 Test edge case: <10 decisions returns "Collecting data..." message with `hasMinimumData: false` (Manual UAT)
- [ ] T017 Verify deduplication logic: multiple corrections for same document count as one (Manual UAT)

**Checkpoint**: Convex queries deployed and ready - UI implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Current Automation Rate (Priority: P1) 🎯 MVP

**Goal**: Display current automation rate prominently on analytics dashboard, Action Center, and business settings

**Independent Test**: Navigate to analytics dashboard and verify hero metric displays "X documents processed, Y needed review (Z% automated)". Check Action Center shows daily summary. Verify business settings displays lifetime stats.

### React Hooks for User Story 1

- [ ] T018 [P] [US1] Create `src/domains/analytics/hooks/use-automation-rate.ts` file and export `useAutomationRate` hook using Convex `useQuery`
- [ ] T019 [P] [US1] Add `useLifetimeStats` hook to `src/domains/analytics/hooks/use-automation-rate.ts` for business settings

### Hero Metric Component (Dashboard)

- [X] T020 [P] [US1] Create `src/domains/analytics/components/automation-rate-hero.tsx` with `AutomationRateHero` component skeleton
- [X] T021 [US1] Implement period selector (Today/This Week/This Month) in `automation-rate-hero.tsx` using Radix UI Select
- [X] T022 [US1] Implement hero metric display logic in `automation-rate-hero.tsx` - large rate percentage, total/reviewed counts, period label
- [X] T023 [US1] Add "No AI activity" and "Collecting data..." message handling in `automation-rate-hero.tsx`
- [X] T024 [US1] Style `automation-rate-hero.tsx` using semantic tokens (bg-card, text-primary) and responsive grid
- [X] T025 [US1] Integrate `AutomationRateHero` into `src/domains/analytics/components/complete-dashboard.tsx` at top of grid layout

### Action Center Summary (SKIPPED per user request - Option A)

- [ ] ~~T026 [P] [US1] Create `src/domains/analytics/components/action-center/AutomationSummaryCard.tsx` component~~ (SKIPPED)
- [ ] ~~T027 [US1] Implement daily summary display in `AutomationSummaryCard.tsx` - "Today: X documents processed, Y needed your attention" format~~ (SKIPPED)
- [ ] ~~T028 [US1] Add conditional color styling in `AutomationSummaryCard.tsx` (success if >90%, warning if <80%)~~ (SKIPPED)
- [ ] ~~T029 [US1] Integrate `AutomationSummaryCard` into `src/domains/analytics/components/action-center/ProactiveActionCenter.tsx` at top~~ (SKIPPED)

### Business Settings Stats

- [X] T030 [P] [US1] Create `src/domains/account-management/components/ai-automation-settings.tsx` with `AIAutomationSettings` component
- [X] T031 [US1] Implement lifetime stats display in `ai-automation-settings.tsx` - total processed, reviewed, rate, time saved estimate
- [X] T032 [US1] Add source breakdown table in `ai-automation-settings.tsx` (AR, Bank, Fee, Expense breakdown)
- [X] T033 [US1] Add "AI & Automation" tab to `src/domains/account-management/components/tabbed-business-settings.tsx`
- [X] T034 [US1] Wire `AIAutomationSettings` component into new tab in `tabbed-business-settings.tsx`

### User Story 1 UAT Testing

- [ ] T035 [US1] UAT Test Scenario 1: Verify hero metric shows "96.0% automated" for 100 decisions, 4 reviewed
- [ ] T036 [US1] UAT Test Scenario 2: Verify Action Center shows "Today: 47 documents processed, 2 needed your attention"
- [ ] T037 [US1] UAT Test Scenario 3: Verify aggregation across all 4 AI sources (AR, Bank, Fee, Expense)
- [ ] T038 [US1] UAT Test Scenario 4: Verify "No AI activity in this period" message when totalDecisions = 0
- [ ] T039 [US1] UAT Test Scenario 5: Verify business settings shows lifetime stats with correct rate
- [ ] T040 [US1] UAT Test Scenario 6: Verify partial expense OCR edit counts as full correction

**Checkpoint**: User Story 1 complete and independently testable - hero metric, Action Center, and settings all display automation rate

---

## Phase 4: User Story 2 - Track Automation Rate Improvement Over Time (Priority: P2)

**Goal**: Display weekly trend chart showing automation rate improvement with "Model optimized" annotations

**Independent Test**: Navigate to analytics dashboard and verify trend chart renders 8 weeks of data with optimization markers. Hover over data points to see tooltips. Verify historical immutability by adding delayed correction.

### React Hook for Trend Data

- [ ] T041 [P] [US2] Add `useAutomationRateTrend` hook to `src/domains/analytics/hooks/use-automation-rate.ts` with React Query caching (staleTime: 5 minutes)

### Trend Chart Component

- [ ] T042 [P] [US2] Create `src/domains/analytics/components/automation-rate-trend-chart.tsx` with `AutomationRateTrendChart` component skeleton
- [ ] T043 [US2] Import and configure Recharts components (LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer) in `automation-rate-trend-chart.tsx`
- [ ] T044 [US2] Implement line chart rendering in `automation-rate-trend-chart.tsx` with weekly data on X-axis, rate percentage on Y-axis
- [ ] T045 [US2] Add custom tooltip to `automation-rate-trend-chart.tsx` showing week label, rate, total decisions, reviewed count
- [ ] T046 [US2] Implement "Model optimized" ReferenceLine annotations in `automation-rate-trend-chart.tsx` for optimization events from DSPy model versions
- [ ] T047 [US2] Add "No activity" handling for weeks with zero decisions in `automation-rate-trend-chart.tsx` (null rate, special tooltip)
- [ ] T048 [US2] Add "Tracking automation trends - check back after 2 weeks" message when < 2 weeks of data in `automation-rate-trend-chart.tsx`
- [ ] T049 [US2] Style trend chart using semantic colors (primary for line, muted-foreground for annotations) in `automation-rate-trend-chart.tsx`
- [ ] T050 [US2] Integrate `AutomationRateTrendChart` into `src/domains/analytics/components/complete-dashboard.tsx` below hero metric

### User Story 2 UAT Testing

- [ ] T051 [US2] UAT Test Scenario 1: Verify trend chart displays 8 weeks of historical data with upward trend
- [ ] T052 [US2] UAT Test Scenario 2: Verify "Model optimized" annotation appears on correct date when DSPy optimization occurred
- [ ] T053 [US2] UAT Test Scenario 3: Verify chart shows progression from 85% to 95% over 8 weeks
- [ ] T054 [US2] UAT Test Scenario 4: Verify tooltip displays exact rate and decision count on hover
- [ ] T055 [US2] UAT Test Scenario 5: Verify message "Tracking automation trends" appears when < 2 weeks of data
- [ ] T056 [US2] UAT Test Scenario 6: Verify historical immutability - correction made 2 weeks later doesn't change week 1 rate
- [ ] T057 [US2] UAT Test Scenario 7: Verify week with zero AI activity shows "No activity" in tooltip
- [ ] T058 [US2] UAT Test Scenario 8: Verify DSPy optimization temporary dip (94% to 89%) displays honestly without smoothing

**Checkpoint**: User Story 2 complete and independently testable - trend chart displays automation rate improvement over time

---

## Phase 5: User Story 3 - Receive Milestone Celebration Notifications (Priority: P3)

**Goal**: Trigger toast notifications and email digest celebrations when automation rate crosses 90%, 95%, 99% thresholds

**Independent Test**: Simulate AI decisions that push automation rate over thresholds and verify toast notifications appear. Check email digest includes milestone achievements. Verify no duplicate notifications.

### Milestone Tracking (Convex Backend)

- [ ] T059 [P] [US3] Implement `checkMilestones` internal mutation in `convex/functions/automationRate.ts` - checks rate, updates businesses.automationMilestones, returns newly achieved
- [ ] T060 [P] [US3] Implement `checkAllBusinessMilestones` internal mutation in `convex/functions/automationRate.ts` - loops through all businesses and calls checkMilestones
- [ ] T061 [US3] Add daily cron job `check-automation-milestones` to `convex/crons.ts` - runs hourly at 10 AM UTC (6 PM SGT) and calls checkAllBusinessMilestones
- [ ] T062 [US3] Deploy cron configuration to Convex with `npx convex deploy --yes`

### Milestone Subscription Hook (React)

- [ ] T063 [P] [US3] Create `src/domains/analytics/hooks/use-milestone-subscription.ts` file with `useMilestoneSubscription` hook
- [ ] T064 [US3] Implement Convex subscription to `businesses` table changes in `use-milestone-subscription.ts`
- [ ] T065 [US3] Add milestone detection logic in `use-milestone-subscription.ts` - compares previous vs current automationMilestones
- [ ] T066 [US3] Add session storage tracking in `use-milestone-subscription.ts` to prevent duplicate toasts in same session
- [ ] T067 [US3] Trigger Sonner toast notifications in `use-milestone-subscription.ts` when new milestone detected

### Toast Notification Configuration

- [ ] T068 [P] [US3] Create `src/lib/utils/automation-rate.ts` utility file with `getMilestoneToastConfig()` helper function
- [ ] T069 [US3] Implement toast configuration in `automation-rate.ts` - title, description, duration for each threshold (90%, 95%, 99%)
- [ ] T070 [US3] Add special context for 99% milestone in `automation-rate.ts` - "Only 1 in 100 documents needs your review!"

### Email Digest Integration

- [ ] T071 [P] [US3] Extend `gatherAIActivity()` function in `convex/functions/aiDigest.ts` to include `milestoneAchievements` field
- [ ] T072 [US3] Query `businesses.automationMilestones` in `aiDigest.ts` for achievements in last 24 hours
- [ ] T073 [US3] Add milestone achievements section to `generateEmailHtml()` in `aiDigest.ts` with green celebration banner
- [ ] T074 [US3] Test email digest generation with milestone achievements included

### Milestone Subscription Integration

- [ ] T075 [US3] Add `useMilestoneSubscription({ businessId })` call to `src/domains/analytics/components/complete-dashboard.tsx` or layout component

### User Story 3 UAT Testing

- [ ] T076 [US3] UAT Test Scenario 1: Verify toast notification "🎉 Your AI automation rate just hit 90%!" when crossing 90% threshold
- [ ] T077 [US3] UAT Test Scenario 2: Verify email digest includes celebration message for 95% milestone achievement
- [ ] T078 [US3] UAT Test Scenario 3: Verify NO duplicate notification when rate drops to 88% then rises to 91% again
- [ ] T079 [US3] UAT Test Scenario 4: Verify 99% notification includes context "Only 1 in 100 documents needs your review!"
- [ ] T080 [US3] UAT Test Scenario 5: Verify milestone notifications respect user settings (disabled toasts = no toast, but email still shows)

**Checkpoint**: User Story 3 complete and independently testable - milestone notifications trigger correctly via toast and email

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final touches, documentation, and project-wide validation

### Documentation Updates

- [ ] T081 [P] Update `CLAUDE.md` with automation rate implementation notes (already done in planning phase - verify completeness)
- [ ] T082 [P] Create or update `src/domains/analytics/CLAUDE.md` with automation rate query patterns and component usage
- [ ] T083 [P] Verify `quickstart.md` accuracy - test all manual testing scenarios and update as needed

### Build & Deployment Validation

- [ ] T084 Run `npm run build` and fix any TypeScript compilation errors
- [ ] T085 Run `npx tsc --noEmit` to validate all types compile correctly
- [ ] T086 Verify no console.log statements remain in production code (grep check)
- [ ] T087 Final Convex deployment to production: `npx convex deploy --yes`
- [ ] T088 Verify cron job `check-automation-milestones` is scheduled correctly in Convex dashboard

### Performance Validation

- [ ] T089 Test automation rate query performance - verify < 2 second load time (SC-001)
- [ ] T090 Test trend chart rendering performance - verify < 1 second render time
- [ ] T091 Test milestone toast appears within 5 seconds of threshold crossing (SC-004)

### Cross-Browser & Responsive Testing

- [ ] T092 [P] Test automation rate hero metric on mobile viewport (375px width)
- [ ] T093 [P] Test trend chart responsiveness on tablet viewport (768px width)
- [ ] T094 [P] Test Action Center summary on desktop viewport (1920px width)

### Final UAT Validation

- [ ] T095 Perform end-to-end UAT walkthrough using test account from `.env.local` on `finance.hellogroot.com`
- [ ] T096 Verify all 3 user stories work independently and together
- [ ] T097 Create final demo video or screenshots showing all features working

### Git & Deployment

- [ ] T098 Stage all changes: `git add <files>` (list specific files, not `git add .`)
- [ ] T099 Create commit with message: `feat(analytics): surface automation rate metric - hero display, trend chart, milestone notifications`
- [ ] T100 Verify commit author is `grootdev-ai <dev@hellogroot.com>` with `git log --format=full -1`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately with schema changes
- **Foundational (Phase 2)**: Depends on Phase 1 completion (schema deployed) - BLOCKS all UI work
- **User Stories (Phase 3-5)**: All depend on Phase 2 completion (Convex queries working)
  - Can proceed in parallel if team has capacity
  - Otherwise sequential: US1 (P1) → US2 (P2) → US3 (P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - only depends on Foundational phase
- **User Story 2 (P2)**: Independent - only depends on Foundational phase (uses same queries as US1)
- **User Story 3 (P3)**: Independent - only depends on Foundational phase (adds milestone tracking on top)

**NOTE**: All 3 user stories are independently implementable and testable. No cross-story dependencies exist.

### Within Each User Story

**User Story 1**:
1. Hooks (T018-T019) can be implemented in parallel
2. Components (T020-T034) depend on hooks being complete
3. Hero metric (T020-T025), Action Center (T026-T029), Settings (T030-T034) can be implemented in parallel
4. UAT testing (T035-T040) after all components integrated

**User Story 2**:
1. Hook (T041) can start after Foundational complete
2. Chart component (T042-T050) depends on hook being complete
3. UAT testing (T051-T058) after chart integrated

**User Story 3**:
1. Backend mutations (T059-T062) can be implemented in parallel with frontend hook (T063-T067)
2. Toast config (T068-T070) and email integration (T071-T074) can be implemented in parallel
3. Integration (T075) after all pieces complete
4. UAT testing (T076-T080) after integration

### Parallel Opportunities

**Phase 1 (Setup)**:
- All tasks sequential (schema changes must be committed)

**Phase 2 (Foundational)**:
- T005 and T006 (helper functions) can run in parallel
- T011 (getMilestones query) can run in parallel with T007-T010

**Phase 3 (User Story 1)**:
- T018 and T019 (hooks) can run in parallel
- T020, T026, T030 (component skeletons) can run in parallel after hooks complete
- After skeletons: Hero metric tasks, Action Center tasks, Settings tasks can proceed in parallel

**Phase 4 (User Story 2)**:
- T041 (hook) independent
- T042 (skeleton) after hook
- Chart implementation tasks mostly sequential (each builds on previous)

**Phase 5 (User Story 3)**:
- T059-T062 (backend) and T063-T067 (frontend hook) can run in parallel
- T068-T070 (toast config) and T071-T074 (email) can run in parallel

**Phase 6 (Polish)**:
- T081-T083 (documentation) can run in parallel
- T092-T094 (cross-browser testing) can run in parallel

---

## Parallel Example: User Story 1

**After Foundational phase complete, launch 3 parallel tracks for User Story 1:**

```bash
# Track A: Hero Metric
- T020: Create automation-rate-hero.tsx skeleton
- T021-T024: Implement hero metric logic & styling
- T025: Integrate into dashboard

# Track B: Action Center Summary
- T026: Create AutomationSummaryCard.tsx
- T027-T028: Implement summary display & styling
- T029: Integrate into ProactiveActionCenter

# Track C: Business Settings Stats
- T030: Create ai-automation-settings.tsx
- T031-T032: Implement stats display & breakdown
- T033-T034: Add tab & integrate
```

All 3 tracks can proceed independently after hooks (T018-T019) are complete.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

**Fastest path to value** (complete in ~4-6 hours):

1. **Phase 1**: Setup (T001-T003) - 15 minutes
2. **Phase 2**: Foundational (T004-T017) - 2-3 hours
3. **Phase 3**: User Story 1 (T018-T040) - 2-3 hours
4. **STOP and VALIDATE**: Test independently - hero metric, Action Center, settings all show automation rate
5. **Deploy to production** if ready

**Result**: Users can see current automation rate in 3 locations. This alone delivers competitive parity value.

### Incremental Delivery

**Week 1: MVP (User Story 1)**
- Phases 1-3 complete
- Deploy hero metric, Action Center summary, settings stats
- Value: Users see current automation rate

**Week 2: Add Trend Visualization (User Story 2)**
- Phase 4 complete
- Deploy trend chart with optimization markers
- Value: Users see AI improvement over time

**Week 3: Add Celebration (User Story 3)**
- Phase 5 complete
- Deploy milestone notifications
- Value: Users get positive reinforcement

**Week 4: Polish**
- Phase 6 complete
- Final testing, documentation, optimization
- Value: Production-ready, fully polished feature

### Parallel Team Strategy

**With 3 developers:**

**Week 1**: All devs complete Setup + Foundational together (Phases 1-2)

**Week 2**: Once Foundational done, split into parallel user stories:
- **Developer A**: User Story 1 (Hero + Action Center + Settings)
- **Developer B**: User Story 2 (Trend Chart)
- **Developer C**: User Story 3 (Milestone Notifications)

**Week 3**: All user stories complete, integrate and test together, then Polish phase

**Result**: 3-week delivery of complete feature instead of 4 weeks sequential

---

## Task Summary

**Total Tasks**: 100 tasks across 6 phases

**Task Distribution by Phase**:
- Phase 1 (Setup): 3 tasks
- Phase 2 (Foundational): 14 tasks (BLOCKING - must complete first)
- Phase 3 (User Story 1 - P1): 23 tasks (MVP)
- Phase 4 (User Story 2 - P2): 18 tasks
- Phase 5 (User Story 3 - P3): 22 tasks
- Phase 6 (Polish): 20 tasks

**Parallel Opportunities Identified**: 31 tasks marked [P] can run in parallel

**Independent Test Criteria**:
- **User Story 1**: Navigate to analytics dashboard → hero metric displays rate. Check Action Center → daily summary shows. Check settings → lifetime stats display.
- **User Story 2**: Navigate to analytics dashboard → trend chart renders 8 weeks. Hover over points → tooltips appear. Add delayed correction → historical week unchanged.
- **User Story 3**: Simulate crossing 90% threshold → toast notification appears. Check email digest → milestone celebration included. Cross threshold again → no duplicate toast.

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only) = 40 tasks, delivers core competitive value

**Format Validation**: ✅ All tasks follow required checklist format with Task ID, [P] marker where applicable, [Story] label for user story phases, and exact file paths

---

## Notes

- **[P] tasks**: Different files, no dependencies - can run in parallel
- **[Story] labels**: Map tasks to user stories (US1, US2, US3) for traceability
- **Independent stories**: Each user story delivers value independently and can be deployed separately
- **Manual UAT only**: No automated test implementation (not requested in spec)
- **Immutable historical rates**: Key requirement - corrections don't retroactively change past rates
- **Deduplication required**: Multiple corrections for same document = 1 review (FR-021)
- **Git commits**: Use `grootdev-ai` author identity for all commits
- **Convex deployment**: Run `npx convex deploy --yes` after schema changes and before completion

---

**Ready for Implementation**: Run `/speckit.implement` to begin executing tasks in order
