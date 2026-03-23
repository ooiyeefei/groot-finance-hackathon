# Tasks: Auto-Generated Financial Statements

**Input**: Design documents from `/specs/033-fin-statements-gen/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Domain folder structure and shared utilities

- [x] T001 Create domain directory structure: `src/domains/financial-statements/components/`
- [x] T002 [P] Create period selector utility with presets (This Month, Last Month, This Quarter, Last Quarter, This FY, Last FY, Custom) in `src/domains/financial-statements/components/period-selector.tsx`
- [x] T003 [P] Create CSV export utility function in `src/domains/financial-statements/lib/csv-export.ts`
- [x] T004 [P] Create report export buttons component (PDF + CSV) in `src/domains/financial-statements/components/report-export-buttons.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convert existing reactive queries to non-reactive actions and add missing generators

**⚠️ CRITICAL**: No UI or MCP work can begin until this phase is complete

- [x] T005 Create Balance Sheet generator in `convex/lib/statement_generators/balance_sheet_generator.ts` — point-in-time snapshot, Current/Non-Current by account sub-range (1000-1499/1500-1999, 2000-2499/2500-2999), dynamic retained earnings (sum Revenue - sum Expenses all time), verify A = L + E
- [x] T006 Create Cash Flow generator in `convex/lib/statement_generators/cash_flow_generator.ts` — direct method, filter Cash (1000) entries, classify contra-accounts: Operating (4xxx-6xxx), Investing (1500-1999), Financing (2xxx-3xxx), verify opening + netChange = closing
- [x] T007 Refactor `convex/functions/financialStatements.ts` — convert existing `query` to `action` + `internalQuery` pattern per CLAUDE.md bandwidth rules; add `getBalanceSheet` and `getCashFlow` actions; add `getProfitLossComparison` action (calls P&L generator twice, computes variance); add role check (Owner/Admin + Manager only)
- [x] T008 Deploy Convex functions: `npx convex deploy --yes`

**Checkpoint**: All 4 statement generators exist and are accessible via Convex actions

---

## Phase 3: User Story 1 — Generate Trial Balance (Priority: P1) 🎯 MVP

**Goal**: Users can generate a trial balance for any date range, verify DR=CR, and export PDF/CSV

**Independent Test**: Select a date range → see account list with debit/credit totals → verify balanced → export PDF

### Implementation for User Story 1

- [x] T009 [P] [US1] Create Trial Balance PDF template in `src/lib/reports/templates/trial-balance-template.tsx` — account code, name, debit balance, credit balance columns, total row with balance verification badge
- [x] T010 [P] [US1] Create Trial Balance view component in `src/domains/financial-statements/components/trial-balance-view.tsx` — table display with account rows, totals row, balanced/unbalanced indicator, integrates period-selector and export buttons
- [x] T011 [US1] Add `trial_balance` type to report-generator orchestrator in `src/lib/reports/report-generator.ts`

**Checkpoint**: Trial Balance generates, displays, and exports independently

---

## Phase 4: User Story 2 — Generate Profit & Loss Statement (Priority: P1)

**Goal**: Users can generate P&L showing Revenue, COGS, Gross Profit, OpEx, Net Profit with period comparison

**Independent Test**: Select a period → see categorized P&L → enable comparison → see variance columns → export PDF

### Implementation for User Story 2

- [x] T012 [P] [US2] Create P&L view component in `src/domains/financial-statements/components/profit-loss-view.tsx` — collapsible account groups (Revenue, COGS, Gross Profit, OpEx, Net Profit), period comparison toggle with variance columns (amount + percentage), expand/collapse per group
- [x] T013 [US2] Update P&L PDF template to support comparison mode in `src/lib/reports/templates/pnl-template.tsx` — add optional comparison column with variance

**Checkpoint**: P&L generates with comparison and exports independently

---

## Phase 5: User Story 3 — Generate Balance Sheet (Priority: P1)

**Goal**: Users can generate balance sheet as-of date, verify A=L+E, see Current/Non-Current classification

**Independent Test**: Select an as-of date → see Assets/Liabilities/Equity with subtotals → verify equation → export PDF

### Implementation for User Story 3

- [x] T014 [P] [US3] Create Balance Sheet PDF template in `src/lib/reports/templates/balance-sheet-template.tsx` — Current Assets, Non-Current Assets, Total Assets, Current Liabilities, Non-Current Liabilities, Total Liabilities, Equity + Retained Earnings, equation verification footer
- [x] T015 [P] [US3] Create Balance Sheet view component in `src/domains/financial-statements/components/balance-sheet-view.tsx` — classified sections, subtotals, equation badge (balanced/imbalanced warning)
- [x] T016 [US3] Add `balance_sheet` type to report-generator orchestrator in `src/lib/reports/report-generator.ts`

**Checkpoint**: Balance Sheet generates, verifies A=L+E, exports independently

---

## Phase 6: User Story 4 — Generate Cash Flow Statement (Priority: P2)

**Goal**: Users can see cash inflows/outflows categorized by Operating/Investing/Financing

**Independent Test**: Select a period → see three activity sections → verify opening + net = closing → export PDF

### Implementation for User Story 4

- [x] T017 [P] [US4] Update Cash Flow PDF template with Operating/Investing/Financing sections in `src/lib/reports/templates/cash-flow-template.tsx` — replace simple inflows/outflows with three IFRS activity categories
- [x] T018 [P] [US4] Create Cash Flow view component in `src/domains/financial-statements/components/cash-flow-view.tsx` — three activity sections, opening/closing balance, net change, integrity check badge

**Checkpoint**: Cash Flow generates with proper categorization and exports independently

---

## Phase 7: User Story 5 — Period Filtering and Navigation (Priority: P1)

**Goal**: Single page with tabs for all 4 reports, period filtering, sidebar navigation entry

**Independent Test**: Navigate via sidebar → see 4 tabs → switch periods → reports update inline

### Implementation for User Story 5

- [x] T019 [US5] Create How It Works info drawer in `src/domains/financial-statements/components/how-it-works-drawer.tsx` — explains each report type, when to use it, what it shows
- [x] T020 [US5] Create main client component with tabs in `src/domains/financial-statements/components/financial-statements-client.tsx` — tabs: Trial Balance | P&L | Balance Sheet | Cash Flow; shared period selector; role-based access check; loading states; empty states; integrates all 4 view components + How It Works drawer
- [x] T021 [US5] Create server page in `src/app/[locale]/financial-statements/page.tsx` — mandatory layout: `force-dynamic`, auth check, `<ClientProviders>` → `<Sidebar>` + `<HeaderWithUser>` + `<main>` → client component
- [x] T022 [US5] Update sidebar navigation in `src/lib/navigation/nav-items.ts` — add Financial Statements entry in finance group (admin) and workspace group (manager), use `BarChart3` or `FileBarChart` icon from lucide-react, path `/financial-statements`

**Checkpoint**: Full UI page with all 4 reports, tab switching, period filtering, sidebar nav

---

## Phase 8: User Story 6 — Generate Reports via Chat Agent (Priority: P1)

**Goal**: Chat agent can generate financial reports inline via natural language ("Show me P&L for last quarter")

**Independent Test**: Ask agent "Show me P&L for this month" → get formatted summary with key figures + insight + PDF offer

### Implementation for User Story 6

- [x] T023 [P] [US6] Create MCP tool: `generate_trial_balance` in `src/lambda/mcp-server/tools/generate-trial-balance.ts` — accepts business_id + as_of_date, calls Convex action, returns structured TrialBalanceStatement
- [x] T024 [P] [US6] Create MCP tool: `generate_pnl` in `src/lambda/mcp-server/tools/generate-pnl.ts` — accepts business_id + date_from + date_to + optional comparison_period, returns ProfitLossStatement or comparison
- [x] T025 [P] [US6] Create MCP tool: `generate_balance_sheet` in `src/lambda/mcp-server/tools/generate-balance-sheet.ts` — accepts business_id + as_of_date, returns BalanceSheetStatement
- [x] T026 [P] [US6] Create MCP tool: `generate_cash_flow` in `src/lambda/mcp-server/tools/generate-cash-flow.ts` — accepts business_id + date_from + date_to, returns CashFlowStatement
- [x] T027 [US6] Register 4 MCP tools in handler and contracts: `src/lambda/mcp-server/handler.ts` + `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T028 [P] [US6] Create chat agent tool wrapper: `GenerateTrialBalanceTool` in `src/lib/ai/tools/generate-trial-balance-tool.ts` — delegates to MCP via callMCPToolFromAgent, formats result as readable summary
- [x] T029 [P] [US6] Create chat agent tool wrapper: `GeneratePnlTool` in `src/lib/ai/tools/generate-pnl-tool.ts` — includes natural language insight about trends
- [x] T030 [P] [US6] Create chat agent tool wrapper: `GenerateBalanceSheetTool` in `src/lib/ai/tools/generate-balance-sheet-tool.ts`
- [x] T031 [P] [US6] Create chat agent tool wrapper: `GenerateCashFlowTool` in `src/lib/ai/tools/generate-cash-flow-tool.ts`
- [x] T032 [US6] Register 4 tools in tool factory: `src/lib/ai/tools/tool-factory.ts` — add ToolName entries + registerTool calls, ensure role check (Owner/Admin + Manager only)

**Checkpoint**: Chat agent generates all 4 reports inline with natural language

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, deployment, and cleanup

- [x] T033 Run `npm run build` — fix any TypeScript/build errors until clean
- [x] T034 Deploy Convex production: `npx convex deploy --yes`
- [x] T035 Deploy MCP server: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- [ ] T036 Verify all 4 reports generate correctly on production URL
- [ ] T037 Verify chat agent responds to "Show me P&L for this month" correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Can proceed in parallel with Phase 1 (different files)
- **User Stories (Phases 3-8)**: All depend on Phase 2 completion (generators + actions must exist)
  - US1-US5 (Phases 3-7) share no dependencies — can run in parallel
  - US6 (Phase 8) depends on Phase 2 (Convex actions) but NOT on UI phases
- **Polish (Phase 9)**: Depends on all phases complete

### User Story Dependencies

- **US1 (Trial Balance)**: After Phase 2 — no dependencies on other stories
- **US2 (P&L)**: After Phase 2 — no dependencies on other stories
- **US3 (Balance Sheet)**: After Phase 2 — no dependencies on other stories
- **US4 (Cash Flow)**: After Phase 2 — no dependencies on other stories
- **US5 (Period Filtering + Navigation)**: After US1-US4 (needs all 4 view components)
- **US6 (Chat Agent)**: After Phase 2 only — independent of UI phases

### Parallel Opportunities

- T002, T003, T004 can all run in parallel (Phase 1)
- T005, T006 can run in parallel (different generator files)
- T009, T010 can run in parallel (US1 — different files)
- T012, T013 can run in parallel with US1 tasks (different stories)
- T014, T015 can run in parallel (US3 — different files)
- T017, T018 can run in parallel (US4 — different files)
- T023-T026 can ALL run in parallel (4 MCP tools — different files)
- T028-T031 can ALL run in parallel (4 tool wrappers — different files)

---

## Parallel Example: Phase 8 (Chat Agent)

```bash
# Launch all 4 MCP tools in parallel:
Task: "Create MCP tool: generate_trial_balance in src/lambda/mcp-server/tools/generate-trial-balance.ts"
Task: "Create MCP tool: generate_pnl in src/lambda/mcp-server/tools/generate-pnl.ts"
Task: "Create MCP tool: generate_balance_sheet in src/lambda/mcp-server/tools/generate-balance-sheet.ts"
Task: "Create MCP tool: generate_cash_flow in src/lambda/mcp-server/tools/generate-cash-flow.ts"

# Then register all at once:
Task: "Register 4 MCP tools in handler and contracts"

# Then launch all 4 wrappers in parallel:
Task: "Create GenerateTrialBalanceTool in src/lib/ai/tools/generate-trial-balance-tool.ts"
Task: "Create GeneratePnlTool in src/lib/ai/tools/generate-pnl-tool.ts"
Task: "Create GenerateBalanceSheetTool in src/lib/ai/tools/generate-balance-sheet-tool.ts"
Task: "Create GenerateCashFlowTool in src/lib/ai/tools/generate-cash-flow-tool.ts"
```

---

## Implementation Strategy

### MVP First (Trial Balance Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (US1: Trial Balance)
3. **STOP and VALIDATE**: Generate trial balance, verify DR=CR, export PDF
4. This alone delivers value — users can verify their books balance

### Incremental Delivery

1. Setup + Foundational → Generators + actions ready
2. US1 (Trial Balance) → First report works → Deploy
3. US2 (P&L) + US3 (Balance Sheet) → Core statements → Deploy
4. US4 (Cash Flow) → Complete set → Deploy
5. US5 (Page + Navigation) → Full UI → Deploy
6. US6 (Chat Agent) → Agent-first complete → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Existing generators (TB + P&L) need NO changes — only the Convex function layer needs refactoring
- All PDF templates follow the existing pattern in `src/lib/reports/templates/`
- MCP tools follow the pattern in `src/lambda/mcp-server/tools/analyze-trends.ts`
- Chat agent wrappers follow the pattern in `src/lib/ai/tools/detect-anomalies-tool.ts`
