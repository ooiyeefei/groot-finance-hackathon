# Tasks: Manager Cross-Employee Financial Queries

**Input**: Design documents from `/specs/008-manager-agent-queries/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No automated tests specified in the feature spec. Verification via `npm run build` and manual integration testing via AI assistant chat.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared utility modules that all subsequent phases depend on

- [X] T001 [P] [US4] Create date range resolver utility at `src/lib/ai/utils/date-range-resolver.ts` — Extract `_calculateDateRange()` logic from `src/lib/ai/tools/transaction-lookup-tool.ts` into a shared module. Support patterns: named months ("January 2026"), relative periods ("last quarter", "this year", "this month"), rolling windows ("past 60 days", "last 2 months"). Accept `referenceDate: Date` parameter for testability. Export `resolveDateRange(expression: string, referenceDate?: Date): DateRangeResult` and `DateRangeResult` type per data-model.md.
- [X] T002 [P] [US4] Create category mapper utility at `src/lib/ai/utils/category-mapper.ts` — Static mapping of ~30-50 common natural language terms to IFRS category IDs per research.md R9. Import IFRS categories from `src/lib/constants/ifrs-categories.ts`. Export `mapCategoryTerm(term: string): { categoryId: string; categoryName: string; confidence: 'exact' | 'partial' } | null`.

**Checkpoint**: Shared utilities ready — date resolver and category mapper available for all tools

---

## Phase 2: Foundational (Convex Queries — Blocking Prerequisites)

**Purpose**: Create the Convex query functions that all LangGraph and MCP tools depend on

**⚠️ CRITICAL**: No LangGraph/MCP tool implementation can begin until these queries exist

- [X] T003 [US1/US2] Add `resolveEmployeeByName` query to `convex/functions/memberships.ts` — Takes `businessId`, `requestingUserId`, `nameQuery`. Returns matching direct reports with confidence level (exact/partial/ambiguous) per contracts/convex-functions.md. Authorization: get direct reports via `managerId` filter for managers, all employees for finance_admin/owner. Match against `fullName` (case-insensitive substring) and `email` prefix.
- [X] T004 [US1/US2] Add `getEmployeeExpensesForManager` query to `convex/functions/financialIntelligence.ts` — Takes `businessId`, `requestingUserId`, `targetEmployeeId`, optional filters (vendorName, category, startDate, endDate, transactionType, limit). Returns `{ authorized, error?, entries[], totalCount, totalAmount, currency, employeeName }` per contracts/convex-functions.md. Authorization: verify manager→employee relationship via business_memberships. Use `by_businessId` index, filter by userId + !deletedAt + optional filters. Compute totals BEFORE applying limit.
- [X] T005 [US3] Add `getTeamExpenseSummary` query to `convex/functions/financialIntelligence.ts` — Takes `businessId`, `requestingUserId`, optional filters (startDate, endDate, category, groupBy). Returns `{ authorized, error?, summary, breakdown[], topCategories[] }` per contracts/convex-functions.md. Authorization: same pattern as T004 but scope is all direct reports (or all employees for admin/owner). Group by employee/category/vendor, compute totals and percentages.
- [X] T006 [US3] Add `getMcpTeamExpenses` query to `convex/functions/financialIntelligence.ts` — Takes `businessId`, `managerUserId`, optional `employeeIds[]`, `startDate`, `endDate`, `categoryFilter[]`. Returns raw expense array with userName resolved per contracts/convex-functions.md. Used by MCP server's analyze_team_spending tool. Authorization: validate managerUserId has manager/finance_admin/owner role.

**Checkpoint**: All Convex query functions ready — LangGraph and MCP tools can now be built

---

## Phase 3: US4 — Structured Date Range Calculation (Priority: P1) 🎯 MVP

**Goal**: All tools (existing and new) use deterministic server-side date calculation instead of LLM inference

**Independent Test**: Send queries with various date expressions ("January 2026", "last quarter", "past 60 days", "this year") and verify calculated ranges match expected calendar dates

### Implementation for US4

- [X] T007 [US4] Refactor `src/lib/ai/tools/transaction-lookup-tool.ts` to use shared date resolver — Replace `_calculateDateRange()` with imported `resolveDateRange()` from `src/lib/ai/utils/date-range-resolver.ts`. Ensure existing behavior is preserved (all current date patterns still work). Remove the private `_calculateDateRange()` method.
- [X] T008 [US4] Run `npm run build` to verify no regressions from date resolver refactor

**Checkpoint**: US4 complete — deterministic date calculation available across all tools. Verify by running build and manually testing existing TransactionLookupTool date queries.

---

## Phase 4: US1 — Manager Queries Employee Spending by Vendor (Priority: P1) 🎯 MVP

**Goal**: Manager can ask "How much did Sarah spend at Starbucks in January 2026?" and get accurate structured response

**Independent Test**: Manager sends vendor+employee query via AI assistant, receives structured response matching database records

### Implementation for US1

- [X] T009 [US1] Create `get_employee_expenses` LangGraph tool at `src/lib/ai/tools/employee-expense-tool.ts` — Extend `BaseTool` abstract class. Input schema per contracts/langgraph-tools.md: `employee_name` (required), optional `vendor`, `category`, `date_range`, `start_date`, `end_date`, `transaction_type`, `limit`. Implementation flow: (1) resolve employee name via T003's `resolveEmployeeByName`, (2) handle ambiguous/not-found, (3) resolve date range via shared utility from T001, (4) map category via T002 if provided, (5) call T004's `getEmployeeExpensesForManager`, (6) format response per Zod output schema from data-model.md (EmployeeExpenseResponse). Error responses: employee not found → list direct reports; not authorized → deny with explanation; ambiguous → list matches and ask for clarification.
- [X] T010 [US1] Define Zod output schema for `get_employee_expenses` response — Add EmployeeExpenseResponse Zod schema (summary, employee, items[], truncated, truncated_count) either in the tool file or in a shared schemas file. Validate tool output against schema before returning.
- [X] T011 [US1] Register `get_employee_expenses` tool in `src/lib/ai/tools/tool-factory.ts` — Add import and `registerTool()` call following existing pattern.
- [X] T012 [US1] Run `npm run build` to verify employee expense tool compiles correctly

**Checkpoint**: US1 complete — manager can query individual employee vendor spending. Test by asking "How much did [employee] spend at [vendor] in [date range]?"

---

## Phase 5: US2 — Manager Queries Employee Spending by Category (Priority: P1)

**Goal**: Manager can ask "How much did John spend on meals this quarter?" and get accurate structured response

**Independent Test**: Manager sends category+employee query via AI assistant, receives structured response with category mapping noted

**Note**: US2 shares the same `get_employee_expenses` tool as US1 — the category filtering path is already built in T009. This phase validates the category mapper integration.

### Implementation for US2

- [X] T013 [US2] Verify category mapping integration in employee-expense-tool — Ensure the `category` parameter in `get_employee_expenses` correctly calls `mapCategoryTerm()` from T002, passes the resolved IFRS category ID to the Convex query, and includes the category mapping note in the response when a NL term was mapped. Test: query with "meals" should map to "travel_entertainment" and return matching entries.
- [X] T014 [US2] Run `npm run build` to verify category integration compiles

**Checkpoint**: US1 + US2 complete — manager can query employee spending by vendor AND by category. Both use the same tool with different filter parameters.

---

## Phase 6: US5 — Structured Response Formatting (Priority: P2)

**Goal**: All new manager tool responses follow consistent structured format enforced by Zod schemas

**Independent Test**: Send the same query multiple times, verify response structure is identical (same fields, same ordering)

### Implementation for US5

- [X] T015 [US5] Define Zod output schema for `get_team_summary` response — Add TeamSummaryResponse Zod schema (summary, breakdown[], top_categories[]) per data-model.md. Export from shared location or within the team-summary-tool file.
- [X] T016 [US5] Add structured audit logging for cross-employee queries — In `employee-expense-tool.ts` and `team-summary-tool.ts` (once created), add structured console.log per research.md R7 format: `{ event: "cross_employee_query", managerId, targetEmployeeId, toolName, queryParams, resultCount, timestamp }`. This satisfies FR-015.
- [X] T017 [US5] Run `npm run build` to verify schema definitions compile

**Checkpoint**: US5 output schemas defined and audit logging added — ready for US3 team summary implementation

---

## Phase 7: US3 — Manager Queries Aggregate Team Spending (Priority: P2)

**Goal**: Manager can ask "What's the total team spending on travel this quarter?" or "Who spent the most this month?"

**Independent Test**: Manager asks team-wide spending summary, receives aggregate with per-employee breakdown matching sum of individual records

### Implementation for US3

- [X] T018 [US3] Create `get_team_summary` LangGraph tool at `src/lib/ai/tools/team-summary-tool.ts` — Extend `BaseTool`. Input schema per contracts/langgraph-tools.md: optional `date_range`, `start_date`, `end_date`, `category`, `group_by` (employee|category|vendor). Implementation flow: (1) resolve date range via shared utility, (2) map category if provided, (3) call T005's `getTeamExpenseSummary`, (4) validate response against Zod schema from T015, (5) add audit logging from T016. Error: no direct reports → "No direct reports assigned, contact administrator." Zero results → structured zero-total response (not free-form).
- [X] T019 [US3] Register `get_team_summary` tool in `src/lib/ai/tools/tool-factory.ts` — Add import and `registerTool()` call.
- [X] T020 [US3] Run `npm run build` to verify team summary tool compiles

**Checkpoint**: US3 complete — manager can query aggregate team spending with breakdowns and rankings

---

## Phase 8: US6 — Role-Based Tool Access (Priority: P2)

**Goal**: Tool availability is filtered by user role — managers see team tools, employees are blocked from AI assistant

**Independent Test**: Log in as different roles, verify tool availability differs per authorization matrix

### Implementation for US6

- [X] T021 [US6] Add `getToolSchemasForRole()` method to `src/lib/ai/tools/tool-factory.ts` — Accept `UserContext` parameter, fetch user's membership role from Convex, filter tool schemas. Mapping: manager → all existing tools + get_employee_expenses + get_team_summary; finance_admin/owner → all tools; employee → empty (should never reach here per FR-005a). Keep existing `getToolSchemas()` method for backward compatibility; update `langgraph-agent.ts` to use new role-aware method instead.
- [X] T022 [US6] Update `src/lib/ai/langgraph-agent.ts` to use role-based tool schemas — In the graph node that prepares tool schemas for the LLM, replace `ToolFactory.getToolSchemas()` with `ToolFactory.getToolSchemasForRole(userContext)`. Ensure the model only sees tools the user is authorized to use.
- [X] T023 [US6] Run `npm run build` to verify role-based routing compiles

**Checkpoint**: US6 complete — role-based tool access enforced at schema level

---

## Phase 9: MCP Server Extension (Cross-Cutting)

**Purpose**: Extend MCP server with team spending analytics tool (Category 3 — server-side computation)

- [X] T024 [P] Add `AnalyzeTeamSpendingInputSchema` to `src/lambda/mcp-server/contracts/mcp-tools.ts` — Zod schema per contracts/mcp-tools.md: manager_user_id, optional employee_filter, date_range, category_filter, vendor_filter, include_trends, include_rankings. Also define `AnalyzeTeamSpendingOutput` TypeScript interface.
- [X] T025 Create `analyze_team_spending` tool at `src/lambda/mcp-server/tools/analyze-team-spending.ts` — Follow existing tool pattern (e.g., `detect-anomalies.ts`). Implementation: (1) validate input against Zod schema, (2) verify manager authorization, (3) call T006's `getMcpTeamExpenses` via Convex client, (4) compute server-side analytics: team_summary, employee_rankings, category_breakdown, vendor_breakdown, optional trends (compare current vs previous period). Return `AnalyzeTeamSpendingOutput` per contracts/mcp-tools.md.
- [X] T026 Register `analyze_team_spending` in `src/lambda/mcp-server/handler.ts` — Add to TOOL_IMPLEMENTATIONS map, add tool schema to the tool list. Ensure `analyze_team_spending` permission is added to the permissions list.
- [X] T027 Run `npm run build` to verify MCP server changes compile

**Checkpoint**: MCP server extended with team analytics tool

---

## Phase 10: Polish & Integration

**Purpose**: System prompt updates, final integration, and deployment verification

- [X] T028 Update system prompt in `src/lib/ai/config/prompts.ts` — Add tool descriptions for `get_employee_expenses` and `get_team_summary` to the system prompt so the LLM knows when to use them. Include guidance: "Use get_employee_expenses when a manager asks about a specific team member's spending" and "Use get_team_summary when a manager asks about total team spending or employee rankings."
- [X] T029 Run full `npm run build` — Final build validation across all changes
- [X] T030 Deploy Convex functions — `npx convex dev` (dev) then `npx convex deploy --yes` (prod) to sync new query functions
- [X] T031 Deploy MCP server — `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- [ ] T032 Integration test via AI assistant chat — Test the following scenarios manually:
  - Manager: "How much did [employee] spend at Starbucks in January 2026?" (US1)
  - Manager: "How much did [employee] spend on meals this quarter?" (US2)
  - Manager: "What's the total team spending this month?" (US3)
  - Manager querying non-direct-report → should be denied (FR-002)
  - Finance admin querying any employee → should work (FR-005)
  - Date range: "last quarter", "past 60 days", "this year" → verify correct calculation (US4)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 can start immediately and in parallel
- **Foundational (Phase 2)**: No dependency on Phase 1 — T003-T006 can run in parallel with T001-T002 (different codebases: src/lib/ai/utils/ vs convex/functions/)
- **US4 (Phase 3)**: Depends on T001 (date resolver utility)
- **US1 (Phase 4)**: Depends on T001 (date resolver), T002 (category mapper), T003 (resolveEmployeeByName), T004 (getEmployeeExpensesForManager)
- **US2 (Phase 5)**: Depends on US1 completion (same tool, validates category path)
- **US5 (Phase 6)**: Depends on US1 completion (adds schemas and logging to existing tool)
- **US3 (Phase 7)**: Depends on T001 (date resolver), T002 (category mapper), T005 (getTeamExpenseSummary), T015 (output schema)
- **US6 (Phase 8)**: Depends on US1 and US3 completion (all tools must exist before role-filtering)
- **MCP Server (Phase 9)**: Depends on T006 (getMcpTeamExpenses) and T024 can start when MCP schema is designed
- **Polish (Phase 10)**: Depends on all prior phases

### Parallel Opportunities

Phase 1 and Phase 2 run fully in parallel:
```
T001 (date resolver) ──┐
T002 (category mapper) ─┤── All run in parallel (different files)
T003 (resolveEmployee) ─┤
T004 (getEmployeeExpenses) ─┤
T005 (getTeamSummary) ─┤
T006 (getMcpTeamExpenses) ──┘
```

Within Phase 4 (US1):
```
T009 (tool implementation) → T010 (output schema) → T011 (register) → T012 (build)
```

Phase 9 (MCP) can run in parallel with Phases 6-8 after Phase 2 completes:
```
After Phase 2: US5/US3/US6 ── parallel with ── MCP Server (Phase 9)
```

### User Story Dependencies

- **US4 (P1)**: Can start after Phase 1 T001 — foundational, no dependency on other stories
- **US1 (P1)**: Can start after Phase 1 + Phase 2 T003/T004 — MVP story
- **US2 (P1)**: Depends on US1 (shares the same tool) — validates category path
- **US5 (P2)**: Depends on US1 (adds schema validation layer)
- **US3 (P2)**: Can start after Phase 2 T005 + Phase 6 T015 — team aggregation
- **US6 (P2)**: Depends on US1 + US3 (all tools must exist before filtering)

---

## Implementation Strategy

### MVP First (US1 + US4)

1. Complete Phase 1: Setup (T001, T002) — in parallel
2. Complete Phase 2: Foundational (T003, T004) — in parallel with Phase 1
3. Complete Phase 3: US4 (T007, T008) — date resolver refactor
4. Complete Phase 4: US1 (T009-T012) — employee vendor queries
5. **STOP and VALIDATE**: Test US1 via AI assistant — "How much did Sarah spend at Starbucks in January 2026?"
6. Deploy if ready (T030, T031)

### Full Feature Delivery

1. MVP (above) → validates core pipeline works end-to-end
2. Add US2 (Phase 5) → category queries (minimal effort, shared tool)
3. Add US5 (Phase 6) → structured output enforcement
4. Add US3 (Phase 7) → team aggregation
5. Add US6 (Phase 8) → role-based access
6. Add MCP tool (Phase 9) → server-side analytics
7. Polish (Phase 10) → system prompt, deployments, integration testing

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All build verification tasks (T008, T012, T014, T017, T020, T023, T027, T029) are checkpoints — fix errors before proceeding
- Commit after each phase or logical group of tasks
- `npm run build` must pass before moving to next phase
- Convex changes (Phase 2) require `npx convex dev` to sync to dev environment
- MCP server changes (Phase 9) require CDK deploy to push to AWS Lambda
