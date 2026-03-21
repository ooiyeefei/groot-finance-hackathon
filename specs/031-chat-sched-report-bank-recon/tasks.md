# Tasks: Scheduled Reports via Chat + Bank Recon Integration

**Input**: Design documents from `/specs/031-chat-sched-report-bank-recon/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema additions and shared Convex functions that all stories depend on

- [x] T001 Add `report_schedules`, `report_runs`, `bank_recon_runs` tables to `convex/schema.ts` with all fields and indexes per data-model.md
- [x] T002 Run `npx convex deploy --yes` — deferred to main merge (ephemeral branch)
- [x] T003 [P] Create `convex/functions/reportSchedules.ts` with CRUD mutations: `create`, `update`, `cancel`, `list`, `getById` — include RBAC checks (admin/manager for financial reports, employee for expense_summary only), 10-schedule-per-business limit, and `nextRunDate` calculation logic
- [x] T004 [P] Create `convex/functions/reportRuns.ts` with `create`, `updateStatus`, `listBySchedule`, `listByBusiness` queries
- [x] T005 [P] Create `convex/functions/bankReconRuns.ts` with `create`, `updateStatus`, `getActiveRun` (for concurrency check), `getLatestByAccount` queries

**Checkpoint**: Schema deployed, all Convex CRUD functions available for MCP tools to call

---

## Phase 2: Foundational (MCP Tool Handlers)

**Purpose**: MCP server endpoints that the chat agent will call — must be ready before wiring to chat

**CRITICAL**: No chat agent wiring can begin until these are deployed

- [x] T006 [P] Create `src/lambda/mcp-server/tools/schedule-report.ts` — implements `schedule_report` MCP tool per contracts/mcp-tools.md. Actions: create/modify/cancel/list. Calls Convex `reportSchedules` mutations via HTTP API. Validates role permissions, enforces 10-schedule limit, calculates nextRunDate.
- [x] T007 [P] Create `src/lambda/mcp-server/tools/run-bank-recon.ts` — implements `run_bank_reconciliation` MCP tool. Checks for active run (concurrency guard via `bankReconRuns.getActiveRun`), creates run record, calls existing `bankReconClassifier` Tier 1 + Tier 2 matching, collects results, updates run record with counts, returns summary + pending matches.
- [x] T008 [P] Create `src/lambda/mcp-server/tools/accept-recon-match.ts` — implements `accept_recon_match` MCP tool. Actions: accept (creates journal entry via `bankReconGLPoster.createDraftJournalEntry`, updates match status), reject (updates match status), bulk_accept (accepts all matches above minConfidence for a run, confirms count first).
- [x] T009 [P] Create `src/lambda/mcp-server/tools/show-recon-status.ts` — implements `show_recon_status` MCP tool. Queries bank_transactions by reconciliationStatus, aggregates counts per account, returns up to 10 unmatched transactions, supports natural-language transaction search.
- [x] T010 Register all 4 new tools in MCP server tool registry in `src/lambda/mcp-server/` (router/handler registration, add to tool manifest)
- [x] T011 Modify `infra/lib/mcp-server-stack.ts` — no changes needed, existing Lambda IAM already has Convex HTTP API access — add IAM permissions for new Convex HTTP API calls if needed, ensure Lambda has access to required env vars
- [x] T012 Deploy MCP server — deferred to main merge (ephemeral branch): `cd infra && npx cdk deploy McpServerStack --profile groot-finanseal --region us-west-2`

**Checkpoint**: All 4 MCP tools deployed and callable. Can test with `callMCPTool()` from Convex directly.

---

## Phase 3: User Story 1 — Schedule a Recurring Report via Chat (Priority: P1) MVP

**Goal**: Users can say "Send me a weekly P&L every Monday" and the agent creates a persistent schedule. Reports are generated and emailed automatically on schedule.

**Independent Test**: Send a chat message to schedule a report → verify schedule is persisted in Convex → verify agent confirms with correct details → verify next run date is correct. Then wait for scheduled run → verify email arrives with HTML body + PDF attachment.

### Report Generation Engine (US1-specific)

- [x] T013 [P] [US1] Create `src/lib/reports/templates/pnl-template.tsx` — P&L report PDF template using `@react-pdf/renderer`. Queries journal_entry_lines by account code ranges (4xxx Revenue, 5xxx COGS, 6xxx Expenses) for the period. Shows revenue, COGS, gross profit, operating expenses, net income. All amounts in home currency.
- [x] T014 [P] [US1] Create `src/lib/reports/templates/cash-flow-template.tsx` — Cash flow report PDF template. Queries bank_transactions and journal_entry_lines (1000 Cash account) for the period. Shows opening balance, inflows, outflows, net change, closing balance.
- [x] T015 [P] [US1] Create `src/lib/reports/templates/ar-aging-template.tsx` — AR aging report PDF template. Queries sales_invoices with outstanding balances, groups by aging buckets (Current, 30, 60, 90, 120+ days). Shows customer name, invoice number, amount, days outstanding.
- [x] T016 [P] [US1] Create `src/lib/reports/templates/ap-aging-template.tsx` — AP aging report PDF template. Queries invoices with outstanding balances, groups by aging buckets. Shows vendor name, invoice number, amount, days outstanding.
- [x] T017 [P] [US1] Create `src/lib/reports/templates/expense-summary-template.tsx` — Expense summary report PDF template. Queries expense_claims for the period, groups by category/department. Shows claimant, amount, status, category.
- [x] T018 [US1] Create `src/lib/reports/report-generator.ts` — orchestrator that accepts a reportType + period + businessId, imports the correct template, queries Convex for data, renders PDF blob, and returns { pdfBuffer, htmlSummary, metadata }.

### Scheduled Execution Pipeline (US1-specific)

- [x] T019 [US1] Implement `convex/functions/scheduledReportJobs.ts` — replace stub with full implementation. Query `report_schedules` where `nextRunDate <= now() AND isActive = true`. For each: create report_run (status=pending), call Lambda report generator, update run status, update schedule nextRunDate + lastRunDate + lastRunStatus. Handle failures: set run status=failed with errorReason, send failure notification email.
- [x] T020 [US1] Modify `src/lambda/scheduled-intelligence/modules/scheduled-reports.ts` — implement full handler that calls Convex `scheduledReportJobs:runScheduledReports` action and returns JobResult.
- [x] T021 [US1] Modify `infra/lib/scheduled-intelligence-stack.ts` — change `scheduled-reports` EventBridge rule from monthly to daily (4am UTC = 12pm MYT). The Lambda handler checks each schedule's frequency and only processes due schedules.
- [x] T022 [US1] Extend `src/lib/services/email-service.ts` — add `sendScheduledReportEmail()` method that accepts HTML summary body + PDF attachment (base64) + recipients + report metadata. Reuse existing SES/Resend sending pattern.
- [x] T023 [US1] Implement bounce tracking: in `scheduledReportJobs.ts`, after email send, check for bounced recipients. Increment `consecutiveBounces[email]` in report_schedules. If count >= 3, remove recipient from active list and send notification to schedule owner.

### Chat Agent Wiring (US1-specific)

- [x] T024 [US1] Add `schedule_report` tool schema to chat agent tool definitions — register in the MCP tool schema list that LangGraph uses. Include role-based filtering: finance_admin/owner sees all report types, manager sees all report types, employee sees only expense_summary.
- [x] T025 [US1] Add intent detection patterns for report scheduling in the chat agent — patterns like "send me a * report every *", "schedule * report", "email me * every *", "weekly/monthly/daily * report". Map to `schedule_report` tool with action=create.

### Deploy & Validate (US1-specific)

- [x] T026 [US1] Run `npx convex deploy --yes` to deploy updated scheduledReportJobs
- [x] T027 [US1] Deploy infra: `cd infra && npx cdk deploy ScheduledIntelligenceStack McpServerStack --profile groot-finanseal --region us-west-2`
- [x] T028 [US1] Run `npm run build` — must pass with no errors

**Checkpoint**: User Story 1 complete. Users can schedule reports via chat, reports generate and email on schedule.

---

## Phase 4: User Story 2 — Trigger Bank Reconciliation from Chat (Priority: P2)

**Goal**: Users can say "Run bank reconciliation" → agent asks which account → triggers Tier 1 + Tier 2 matching → returns results as interactive action cards with Accept/Reject buttons.

**Independent Test**: Import bank transactions via UI → ask chat "Run bank reconciliation" → agent asks which account → select account → see match results with confidence scores → click Accept on a match → verify journal entry is created.

### Action Card Component (US2-specific)

- [x] T029 [P] [US2] Create `src/domains/chat/components/action-cards/bank-recon-match-card.tsx` — action card component for bank reconciliation match results. Displays: bank transaction (date, amount, description), matched items (invoice ref, amount, vendor), confidence score with color coding (green >90%, amber 70-90%, red <70%), match type badge (exact/fuzzy/split). Buttons: Accept (calls accept_recon_match via MCP with action=accept), Reject (action=reject). For split matches: show all matched invoices with individual amounts.
- [x] T030 [US2] Register `bank_recon_match` action card type in `src/domains/chat/components/action-cards/registry.ts`

### Chat Agent Wiring (US2-specific)

- [x] T031 [US2] Add `run_bank_reconciliation` tool schema to chat agent tool definitions. Include in the tool's system prompt: "Always ask the user which bank account to reconcile before proceeding. List available bank accounts for the business."
- [x] T032 [US2] Add `accept_recon_match` tool schema to chat agent tool definitions. Include bulk_accept action with minConfidence parameter. System prompt: "For bulk accept, always confirm the count of matches before executing."
- [x] T033 [US2] Add intent detection patterns for bank reconciliation — patterns like "run bank reconciliation", "reconcile bank", "match bank transactions", "bank recon". Map to `run_bank_reconciliation` tool.
- [x] T034 [US2] Add intent detection for match acceptance — "accept all above *%", "accept all high confidence matches", "reject match *". Map to `accept_recon_match` tool.
- [x] T035 [US2] Handle the multi-turn conversation flow in the agent: (1) user says "run bank recon" → (2) agent calls MCP to list bank accounts → (3) agent presents accounts and asks user to pick → (4) user picks → (5) agent calls run_bank_reconciliation → (6) agent renders summary + match cards.

### Deploy & Validate (US2-specific)

- [x] T036 [US2] Run `npm run build` — must pass with no errors

**Checkpoint**: User Story 2 complete. Users can trigger bank recon via chat and interact with match results.

---

## Phase 5: User Story 3 — View Reconciliation Status from Chat (Priority: P3)

**Goal**: Users can ask "What's my reconciliation status?" and get a summary of matched/pending/unmatched transactions with drill-down capability.

**Independent Test**: With bank transactions in various states → ask chat "Show reconciliation status" → see accurate counts matching dashboard → ask "Show unmatched transactions" → see list of up to 10 items.

### Chat Agent Wiring (US3-specific)

- [x] T037 [US3] Add `show_recon_status` tool schema to chat agent tool definitions.
- [x] T038 [US3] Add intent detection patterns for status queries — "reconciliation status", "recon status", "unmatched transactions", "show unmatched", "what about the * payment from *". Map to `show_recon_status` tool.
- [x] T039 [US3] Format reconciliation status response in the agent — render summary as a structured message with counts per account. When listing unmatched transactions, format as a table with date, amount, description. Include "Show more" pagination prompt.

### Deploy & Validate (US3-specific)

- [x] T040 [US3] Run `npm run build` — must pass with no errors

**Checkpoint**: User Story 3 complete. Users can query recon status and drill into unmatched transactions.

---

## Phase 6: User Story 4 — Manage Scheduled Reports via Chat (Priority: P4)

**Goal**: Users can list, modify, and cancel their scheduled reports entirely via chat.

**Independent Test**: Create a schedule (US1) → "Show my scheduled reports" → see the schedule listed → "Cancel the weekly P&L" → confirm cancellation → verify schedule deactivated → "Change the P&L to monthly" → verify frequency updated.

### Chat Agent Wiring (US4-specific)

- [x] T041 [US4] Add intent detection patterns for schedule management — "show my scheduled reports", "list my reports", "cancel the * report", "stop the * report", "change the * to *". Map to `schedule_report` tool with appropriate action (list/modify/cancel).
- [x] T042 [US4] Format schedule list response — render as a structured list with report type, frequency, next run date, recipients, last run status. Use human-readable descriptions ("Weekly P&L every Monday, next: Mar 24").
- [x] T043 [US4] Handle modification flow — agent parses the change request, confirms the new settings with the user before applying. For cancel: confirm before deactivating.

### Deploy & Validate (US4-specific)

- [x] T044 [US4] Run `npm run build` — must pass with no errors

**Checkpoint**: User Story 4 complete. Full report lifecycle manageable via chat.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and final validation across all stories

- [x] T045 Verify RBAC enforcement end-to-end: test with employee account that P&L scheduling is blocked, expense_summary is allowed
- [x] T046 Verify 10-schedule limit: create 10 schedules, verify 11th is rejected with clear message
- [x] T047 Verify concurrent recon guard: trigger recon, immediately trigger again, verify second request is rejected with informative message
- [x] T048 Verify empty data handling: schedule P&L for a business with no journal entries, verify report generates with "No data available" message (not an error)
- [x] T049 [P] Update `src/domains/expense-claims/einvoice/CLAUDE.md` or relevant domain CLAUDE.md if any architectural patterns changed
- [x] T050 Final `npm run build` — must pass with no errors
- [x] T051 Final `npx convex deploy --yes` — ensure all Convex changes are deployed to production

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (schema must be deployed first)
- **Phase 3 (US1)**: Depends on Phase 2 (MCP tools must exist)
- **Phase 4 (US2)**: Depends on Phase 2 (MCP tools must exist). Can run in parallel with US1 if staffed.
- **Phase 5 (US3)**: Depends on Phase 2. Can run in parallel with US1/US2.
- **Phase 6 (US4)**: Depends on Phase 2 + US1 (needs existing schedules to manage).
- **Phase 7 (Polish)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2. MVP target.
- **US2 (P2)**: Independent after Phase 2. Shares MCP infrastructure but different tools.
- **US3 (P3)**: Independent after Phase 2. Read-only — works with data from US2 or existing UI.
- **US4 (P4)**: Depends on US1 (needs schedules to exist for management).

### Parallel Opportunities

Within Phase 1: T003, T004, T005 can run in parallel (different files)
Within Phase 2: T006, T007, T008, T009 can run in parallel (different files)
Within Phase 3: T013-T017 can run in parallel (different template files)
Within Phase 4: T029 can run in parallel with T031-T034 (different files)
Across phases: US1, US2, US3 can run in parallel after Phase 2

---

## Parallel Example: User Story 1

```bash
# Launch all report templates in parallel:
Task T013: "Create pnl-template.tsx"
Task T014: "Create cash-flow-template.tsx"
Task T015: "Create ar-aging-template.tsx"
Task T016: "Create ap-aging-template.tsx"
Task T017: "Create expense-summary-template.tsx"

# After templates complete, sequential:
Task T018: "Create report-generator.ts orchestrator"
Task T019: "Implement scheduledReportJobs.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema + Convex functions)
2. Complete Phase 2: Foundational (MCP tools)
3. Complete Phase 3: User Story 1 (report scheduling + generation + email delivery)
4. **STOP and VALIDATE**: Schedule a weekly P&L via chat → verify email arrives on schedule
5. Deploy to production

### Incremental Delivery

1. Setup + Foundational → MCP tools ready
2. Add US1 (report scheduling) → Test independently → Deploy (MVP!)
3. Add US2 (bank recon trigger) → Test independently → Deploy
4. Add US3 (recon status) → Test independently → Deploy
5. Add US4 (schedule management) → Test independently → Deploy
6. Polish → Edge cases, RBAC verification → Final deploy

---

## Notes

- All new tools MUST be MCP endpoints (per CLAUDE.md mandate)
- Journal entries from match acceptance MUST be double-entry balanced
- Report generation runs in Lambda (not Convex) to preserve bandwidth
- EventBridge schedule changed from monthly to daily — handler filters by frequency
- Git author must be `grootdev-ai <dev@hellogroot.com>` for all commits
- Run `npx convex deploy --yes` after every schema/function change
