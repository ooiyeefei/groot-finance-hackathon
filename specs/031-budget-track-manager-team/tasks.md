# Tasks: Budget Tracking + Manager Team Tools

**Input**: Design documents from `/specs/031-budget-track-manager-team/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tools.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this feature extends an existing codebase.

- [ ] T001 Verify git author config (`grootdev-ai` / `dev@hellogroot.com`) and branch is `031-budget-track-manager-team`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add budget fields to category data model and update category CRUD — all user stories depend on this.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Add `budgetLimit` (optional number) and `budgetCurrency` (optional string) fields to the category object type in `convex/functions/businesses.ts` — update `createExpenseCategory` and `updateExpenseCategory` mutations to accept and persist these fields
- [ ] T003 Add optional budget limit number input field to category form modal in `src/domains/expense-claims/components/category-form-modal.tsx` — shows currency from business home currency, validates > 0 when provided
- [ ] T004 Add "Budget" column to category management table in `src/domains/expense-claims/components/category-management.tsx` — displays formatted budget limit or "-" when not set
- [ ] T005 Create `convex/functions/budgetTracking.ts` with `internalQuery` `getBudgetUtilization` — queries `expense_submissions` by businessId + category + status (approved/reimbursed) + date range (current month), sums amounts, compares against budgetLimit from category settings, returns per-category utilization array with status classification (on_track/warning/overspent)

**Checkpoint**: Budget data model ready, category settings UI shows budget field, backend can calculate utilization

---

## Phase 3: User Story 1 + 2 — Budget Status Check + Budget Management (Priority: P1) MVP

**Goal**: Managers can set budgets via chat and check budget status with a visual card.

**Independent Test**: Say "Set Travel budget to RM 5000" → confirms creation. Then "What is our budget status?" → shows card with Travel at current spend vs RM 5000.

### Implementation

- [ ] T006 [P] [US2] Create `src/lib/ai/tools/set-budget-tool.ts` — extends BaseTool, tool name `set_budget`, accepts `category_name` (string) + `monthly_limit` (number) + optional `currency`. Matches category_name against business customExpenseCategories (case-insensitive), calls Convex `updateExpenseCategory` mutation to set budgetLimit. Returns created/updated/removed action. Add to MANAGER_TOOLS in tool-factory.ts
- [ ] T007 [P] [US1] Create `src/lib/ai/tools/budget-status-tool.ts` — extends BaseTool, tool name `check_budget_status`, accepts optional `category` filter + optional `period` (YYYY-MM). Calls `budgetTracking.getBudgetUtilization` action, returns categories array with budgetLimit/currentSpend/remaining/percentUsed/status. Add to MANAGER_TOOLS in tool-factory.ts
- [ ] T008 [US1] Create `src/domains/chat/components/action-cards/budget-status-card.tsx` — renders categories with progress bars (green <80%, amber 80-99%, red 100%+), shows budget limit, spent, remaining per category. Total summary row. Export CSV button. Register via `registerActionCard('budget_status', BudgetStatusCard)`
- [ ] T009 [US1] Register `budget_status` card import in `src/domains/chat/components/action-cards/index.tsx` and add auto-generation mapping for `check_budget_status` tool in `src/lib/ai/copilotkit-adapter.ts`
- [ ] T010 Register `set_budget` and `check_budget_status` tools in `src/lib/ai/tools/tool-factory.ts` — add to static registration block and MANAGER_TOOLS set, add to ToolName type union

**Checkpoint**: Budget creation via chat + status check with visual card fully functional

---

## Phase 4: User Story 3 — Proactive Budget Alerts (Priority: P2)

**Goal**: System auto-generates Action Center alerts when spending crosses 80% or 100% of budget.

**Independent Test**: Set a low budget (e.g., RM 100 for a category), approve expenses totaling > RM 80 → verify alert appears in Action Center.

### Implementation

- [ ] T011 [US3] Add `checkBudgetThresholds` function to `convex/functions/budgetTracking.ts` — accepts businessId + categoryId + newApprovedAmount. Calculates new total for the month, checks if 80% or 100% threshold crossed. Deduplicates by checking existing actionCenterInsights with matching `metadata.categoryId` + `metadata.thresholdCrossed` + `metadata.budgetPeriod`. Creates insight with category='optimization', priority='high' (warning) or 'critical' (exceeded). Schedules notification for manager/finance_admin/owner roles
- [ ] T012 [US3] Wire budget threshold check into expense approval flow — in the existing expense approval mutation (likely `convex/functions/expenseSubmissions.ts` approve mutation), after successful approval, call `checkBudgetThresholds` with the approved expense's category and amount

**Checkpoint**: Approving expenses that cross budget thresholds auto-generates Action Center alerts

---

## Phase 5: User Story 4 — Late Approval Detection (Priority: P2)

**Goal**: Managers ask "Any late approvals?" and see overdue submissions with inline approve buttons.

**Independent Test**: Ask "Any late approvals?" → shows card with overdue submissions (or confirms none). Click "Approve Now" → approves inline.

### Implementation

- [ ] T013 [P] [US4] Create `src/lib/ai/tools/late-approvals-tool.ts` — extends BaseTool, tool name `get_late_approvals`, accepts optional `threshold_days` (default 3). Queries `expense_submissions` with status='submitted' and submittedAt older than threshold business days. Scopes to manager's direct reports (via business_memberships.managerId) or submissions where designatedApproverId matches. Returns lateSubmissions array with submitterName, title, totalAmount, waitingDays. Add to MANAGER_TOOLS
- [ ] T014 [P] [US4] Create `src/domains/chat/components/action-cards/late-approvals-card.tsx` — lists overdue submissions with employee name, title, amount, waiting days. "Approve Now" button per submission triggers Convex `expenseSubmissions.approve` mutation inline (follow expense-approval-card.tsx pattern for state machine: idle → confirm → loading → done). Register via `registerActionCard('late_approvals', LateApprovalsCard)`
- [ ] T015 [US4] Register `late_approvals` card import in `src/domains/chat/components/action-cards/index.tsx`, add `get_late_approvals` tool to tool-factory.ts static registration + MANAGER_TOOLS + ToolName union, add auto-generation mapping in `src/lib/ai/copilotkit-adapter.ts`

**Checkpoint**: Late approval detection fully functional with inline approve action

---

## Phase 6: User Story 5 — Team Spending Comparison (Priority: P3)

**Goal**: Managers ask "Compare team spending" and see a bar chart with outlier highlighting.

**Independent Test**: Ask "Compare team spending" → shows horizontal bar chart sorted by amount. Employees spending >1.5x average are highlighted.

### Implementation

- [ ] T016 [P] [US5] Create `src/lib/ai/tools/team-comparison-tool.ts` — extends BaseTool, tool name `compare_team_spending`, accepts optional `period` + `group_by` (employee/category). Calls existing `financialIntelligence.getTeamExpenseSummary` Convex function. Calculates team average, marks employees with totalSpend > 1.5x average as isOutlier. Returns employees array with totalSpend, claimCount, isOutlier, topCategories. Add to MANAGER_TOOLS
- [ ] T017 [P] [US5] Create `src/domains/chat/components/action-cards/team-comparison-card.tsx` — horizontal bar chart (follow spending-chart.tsx pattern) with employee names on Y-axis, amounts on X-axis. Outlier bars highlighted in amber/red. Team average line indicator. Total and average summary. Export CSV button. Register via `registerActionCard('team_comparison', TeamComparisonCard)`
- [ ] T018 [US5] Register `team_comparison` card import in `src/domains/chat/components/action-cards/index.tsx`, add `compare_team_spending` tool to tool-factory.ts static registration + MANAGER_TOOLS + ToolName union, add auto-generation mapping in `src/lib/ai/copilotkit-adapter.ts`

**Checkpoint**: Team comparison with outlier detection fully functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T019 Run `npm run build` and fix any TypeScript/compilation errors
- [ ] T020 Run `npx convex deploy --yes` to deploy all Convex schema and function changes to production
- [ ] T021 Verify all 4 tools work end-to-end via chat: "Set Travel budget to RM 5000", "What is our budget status?", "Any late approvals?", "Compare team spending"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1+US2 Budget)**: Depends on Phase 2 (needs budgetLimit field + utilization query)
- **Phase 4 (US3 Alerts)**: Depends on Phase 3 (needs budget data to check thresholds)
- **Phase 5 (US4 Late Approvals)**: Depends on Phase 2 only (independent of budget features)
- **Phase 6 (US5 Team Comparison)**: Depends on Phase 2 only (independent of budget features)
- **Phase 7 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2 (Budget Status + Management)**: Co-dependent P1 pair — implemented together in Phase 3
- **US3 (Proactive Alerts)**: Depends on US1+US2 (needs budget configuration to check thresholds)
- **US4 (Late Approvals)**: Independent — can start after Phase 2
- **US5 (Team Comparison)**: Independent — can start after Phase 2

### Parallel Opportunities

- T006 and T007 can run in parallel (different tool files)
- T013 and T014 can run in parallel (tool + card in different files)
- T016 and T017 can run in parallel (tool + card in different files)
- Phase 5 (US4) and Phase 6 (US5) can run in parallel (fully independent)

---

## Implementation Strategy

### MVP First (User Stories 1+2 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Foundational (budget fields + utilization query)
3. Complete Phase 3: US1+US2 (set budget + check status)
4. **STOP and VALIDATE**: Test budget creation and status check via chat
5. Deploy if ready

### Full Delivery

1. Setup + Foundational → Foundation ready
2. US1+US2 (Budget) → Test → MVP ready
3. US3 (Proactive Alerts) → Test → Alerts working
4. US4 (Late Approvals) → Test → Late detection working
5. US5 (Team Comparison) → Test → Comparison working
6. Polish → Build + Deploy → Feature complete

---

## Notes

- All new tools must be added to MANAGER_TOOLS set (manager/finance_admin/owner access only)
- Budget calculations use Convex `action` (not reactive `query`) to avoid bandwidth burn
- Action cards follow established registry pattern with side-effect imports
- Proactive alerts reuse `actionCenterInsights` table — no new tables needed
- Late approvals use simple weekday calculation (Mon-Fri), no public holiday support for MVP
