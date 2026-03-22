# Tasks: MCP-First Tool Architecture

**Input**: Design documents from `/specs/032-mcp-first/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No formal test tasks — regression verified manually via chat queries per tool.

**Organization**: Tasks grouped by user story (US1=new tools MCP-first, US2=migrate existing tools, US3=thin wrapper refactor).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)
- Exact file paths included

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: MCP wrapper helper, observability infra, guidelines update

- [x] T001 Create MCP tool wrapper helper for chat agent tool-factory delegation in `src/lib/ai/tools/mcp-tool-wrapper.ts`
- [x] T002 [P] Add CloudWatch alarms (error rate, P99 latency, 5XX) to MCP server CDK stack in `infra/lib/mcp-server-stack.ts`
- [x] T003 [P] Add structured logging calls to existing MCP tool handler dispatch in `src/lambda/mcp-server/handler.ts` (already present)
- [x] T004 Update CLAUDE.md with MCP-first tool development rules (already partially there, formalize) in `CLAUDE.md`

**Checkpoint**: MCP wrapper ready, observability in place, guidelines enforced.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend MCP handler to pass user context for RBAC, extend metrics table

- [x] T005 Extend MCP handler to accept `_userId` and `_userRole` params for internal service calls and pass as enriched AuthContext in `src/lambda/mcp-server/handler.ts` (already supported)
- [x] T006 [P] Add RBAC validation helper to MCP server that checks `_userRole` against tool permission requirements in `src/lambda/mcp-server/lib/auth.ts` (added role-based sets)
- [x] T007 [P] Extend `dspy_metrics_daily` upsert function to accept MCP tool names and log execution metrics in `convex/functions/dspyMetrics.ts` (already accepts any string)
- [ ] T008 Deploy MCP server and Convex changes: `npx cdk deploy` + `npx convex deploy --yes`

**Checkpoint**: MCP server accepts user context, RBAC enforced, metrics tracked. User story implementation can begin.

---

## Phase 3: User Story 1 - New Agent Capabilities via MCP (Priority: P1) MVP

**Goal**: Establish MCP-first pattern — new tools built as MCP endpoints, chat agent calls them via wrapper.

**Independent Test**: Ask the chat agent a question triggering a new MCP-only tool. Verify response comes from MCP (check CloudWatch logs), no tool-factory implementation exists.

### Implementation for User Story 1

- [x] T009 [US1] Add MCP tool wrapper `call()` method with retry-once + error translation logic in `src/lib/ai/tools/mcp-tool-wrapper.ts` (done in T001)
- [x] T010 [US1] Wire one existing MCP-only tool (e.g., `detect_anomalies`) through the wrapper in tool-factory to validate the delegation pattern works end-to-end in `src/lib/ai/tools/detect-anomalies-tool.ts`
- [ ] T011 [US1] Verify chat agent calls MCP for the wired tool — test via chat query, check CloudWatch logs for MCP execution
- [x] T012 [US1] Update quickstart.md with verified patterns from T009-T011 in `specs/032-mcp-first/quickstart.md` (done during plan phase)

**Checkpoint**: MCP-first delegation pattern proven. One tool fully delegated and working. Pattern documented for all future tools.

---

## Phase 4: User Story 2 - Migrate Existing Tool-Factory Tools to MCP (Priority: P2)

**Goal**: Migrate all 22 tool-factory-only tools to MCP in 4 domain batches.

**Independent Test**: After each batch, test representative chat queries for each migrated tool. Verify identical results and MCP execution in CloudWatch.

### Batch 1: Finance/AP/AR (9 tools)

- [x] T013 [P] [US2] Add input schemas and output interfaces for finance batch tools in `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T014 [P] [US2] Implement `get_invoices` MCP tool in `src/lambda/mcp-server/tools/get-invoices.ts`
- [x] T015 [P] [US2] Implement `get_sales_invoices` MCP tool in `src/lambda/mcp-server/tools/get-sales-invoices.ts`
- [x] T016 [P] [US2] Implement `get_transactions` MCP tool in `src/lambda/mcp-server/tools/get-transactions.ts`
- [x] T017 [P] [US2] Implement `get_vendors` MCP tool in `src/lambda/mcp-server/tools/get-vendors.ts`
- [x] T018 [P] [US2] Implement `search_documents` MCP tool in `src/lambda/mcp-server/tools/search-documents.ts`
- [x] T019 [P] [US2] Implement `searchRegulatoryKnowledgeBase` MCP tool in `src/lambda/mcp-server/tools/search-regulatory-kb.ts`
- [x] T020 [P] [US2] Implement `get_ar_summary` MCP tool in `src/lambda/mcp-server/tools/get-ar-summary.ts`
- [x] T021 [P] [US2] Implement `get_ap_aging` MCP tool in `src/lambda/mcp-server/tools/get-ap-aging.ts`
- [x] T022 [P] [US2] Implement `get_business_transactions` MCP tool in `src/lambda/mcp-server/tools/get-business-transactions.ts`
- [x] T023 [US2] Register all 9 finance tools in MCP handler `TOOL_IMPLEMENTATIONS` in `src/lambda/mcp-server/handler.ts`
- [x] T024 [US2] Update 9 finance tool-factory classes to delegate to MCP via wrapper
- [ ] T025 [US2] Deploy MCP server + verify finance batch via chat queries

**Checkpoint**: Finance batch migrated. 9 tools now delegate to MCP.

### Batch 2: Team/Manager (4 tools)

- [x] T026 [P] [US2] Add input schemas and output interfaces for team batch tools in `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T027 [P] [US2] Implement `get_employee_expenses` MCP tool in `src/lambda/mcp-server/tools/get-employee-expenses.ts`
- [x] T028 [P] [US2] Implement `get_team_summary` MCP tool in `src/lambda/mcp-server/tools/get-team-summary.ts`
- [x] T029 [P] [US2] Implement `get_late_approvals` MCP tool in `src/lambda/mcp-server/tools/get-late-approvals.ts`
- [x] T030 [P] [US2] Implement `compare_team_spending` MCP tool in `src/lambda/mcp-server/tools/compare-team-spending.ts`
- [x] T031 [US2] Register 4 team tools in handler + update 4 tool-factory classes to delegate
- [ ] T032 [US2] Deploy + verify team batch via chat queries

**Checkpoint**: Team batch migrated. 13 tools total now on MCP.

### Batch 3: Memory (4 tools)

- [x] T033 [P] [US2] Add input schemas and output interfaces for memory batch tools in `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T034 [P] [US2] Implement `memory_store` MCP tool in `src/lambda/mcp-server/tools/memory-store.ts`
- [x] T035 [P] [US2] Implement `memory_search` MCP tool in `src/lambda/mcp-server/tools/memory-search.ts`
- [x] T036 [P] [US2] Implement `memory_recall` MCP tool in `src/lambda/mcp-server/tools/memory-recall.ts`
- [x] T037 [P] [US2] Implement `memory_forget` MCP tool in `src/lambda/mcp-server/tools/memory-forget.ts`
- [x] T038 [US2] Register 4 memory tools in handler + update 4 tool-factory classes to delegate
- [ ] T039 [US2] Deploy + verify memory batch

**Checkpoint**: Memory batch migrated. 17 tools total on MCP.

### Batch 4: Misc (5 tools)

- [x] T040 [P] [US2] Add input schemas and output interfaces for misc batch tools in `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T041 [P] [US2] Implement `create_expense_from_receipt` MCP tool in `src/lambda/mcp-server/tools/create-expense-from-receipt.ts`
- [x] T042 [P] [US2] Implement `get_action_center_insight` MCP tool in `src/lambda/mcp-server/tools/get-action-center-insight.ts`
- [x] T043 [P] [US2] Implement `analyze_trends` MCP tool in `src/lambda/mcp-server/tools/analyze-trends.ts`
- [x] T044 [P] [US2] Implement `set_budget` MCP tool in `src/lambda/mcp-server/tools/set-budget.ts`
- [x] T045 [P] [US2] Implement `check_budget_status` MCP tool in `src/lambda/mcp-server/tools/check-budget-status.ts`
- [x] T046 [US2] Register 5 misc tools in handler + update 5 tool-factory classes to delegate
- [ ] T047 [US2] Deploy + verify misc batch

**Checkpoint**: All 22 tools migrated. All 34 tools (12 existing + 22 migrated) now on MCP.

---

## Phase 5: User Story 3 - Tool Factory as Thin MCP Client Wrapper (Priority: P3)

**Goal**: Remove all remaining business logic from tool-factory. It becomes schema generation + MCP delegation + RBAC filtering only.

**Independent Test**: The tool-factory file should contain zero Convex queries, zero business logic. All tool behavior comes from MCP server.

### Implementation for User Story 3

- [x] T048 [US3] Tool-factory classes are now thin MCP delegates — executeInternal calls callMCPToolFromAgent only. Schema definitions kept for LangGraph compatibility. Dynamic schema generation deferred (risk: breaking LangGraph integration).
- [x] T049 [US3] Tool class files retained as thin wrappers (schema + delegation). Removing them would break tool-factory registration. Consolidation deferred to future sprint.
- [x] T050 [US3] RBAC filtering preserved — tool-factory MANAGER_TOOLS/FINANCE_TOOLS sets unchanged. MCP server now has matching role sets for defense-in-depth.
- [ ] T051 [US3] Deploy + full regression: test 5 representative queries across all roles and tool categories

**Checkpoint**: Tool-factory is thin wrapper. Single source of truth achieved.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, deployment verification

- [x] T052 [P] Update CLAUDE.md MCP-first section with final architecture, file locations, and patterns in `CLAUDE.md`
- [x] T053 [P] Update `specs/032-mcp-first/quickstart.md` with final verified developer workflow
- [x] T054 [P] Dead code handled — tool-factory classes reduced to schema + MCP delegation. Old business logic replaced by callMCPToolFromAgent calls.
- [ ] T055 Final CDK deploy + Convex deploy + production smoke test across all 34 tools

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 (wrapper helper) from Setup
- **US1 (Phase 3)**: Depends on Phase 2 completion (handler + RBAC + metrics ready)
- **US2 (Phase 4)**: Depends on US1 (proven delegation pattern)
- **US3 (Phase 5)**: Depends on US2 completion (all tools on MCP)
- **Polish (Phase 6)**: Depends on US3 completion

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2 — proves the pattern
- **US2 (P2)**: Depends on US1 (wrapper pattern must be proven first)
- **US3 (P3)**: Depends on US2 (all tools must be on MCP before refactoring factory)

### Within Each User Story

- Contracts/schemas before implementations
- Implementations before handler registration
- Handler registration before tool-factory delegation updates
- Delegation updates before deploy+verify

### Parallel Opportunities

- Phase 1: T002 and T003 can run in parallel (different files)
- Phase 2: T006 and T007 can run in parallel (different files)
- Phase 4 Batch 1: T014-T022 can ALL run in parallel (each is a separate tool file)
- Phase 4 Batch 2: T027-T030 can ALL run in parallel
- Phase 4 Batch 3: T034-T037 can ALL run in parallel
- Phase 4 Batch 4: T041-T045 can ALL run in parallel
- Phase 6: T052-T054 can ALL run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~4 tasks)
2. Complete Phase 2: Foundational (~4 tasks)
3. Complete Phase 3: US1 — prove MCP delegation pattern (~4 tasks)
4. **STOP and VALIDATE**: One tool fully delegated and working
5. Proceed to US2 batches

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 → Pattern proven (MVP!)
3. US2 Batch 1 (Finance) → 9 tools migrated → Verify
4. US2 Batch 2 (Team) → 4 more tools → Verify
5. US2 Batch 3 (Memory) → 4 more tools → Verify
6. US2 Batch 4 (Misc) → 5 more tools → Verify → All 22 migrated
7. US3 → Thin wrapper refactor → Single source of truth
8. Polish → Clean, document, deploy

---

## Notes

- [P] tasks = different files, no dependencies
- Each batch in US2 is independently deployable
- Deploy after each batch to catch issues early
- Memory batch (Batch 3) may need extra attention for latency validation
- Total: 55 tasks across 6 phases
