# Tasks: Cross-Business Benchmarking, Email Integration & Voice Input

**Input**: Design documents from `/specs/031-chat-cross-biz-voice/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md

**Tests**: Not explicitly requested — test tasks omitted. Manual UAT via chat interface.

**Organization**: Tasks grouped by user story (P1 Email → P2 Voice → P3 Benchmarking).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Convex schema additions and shared dependencies

- [x] T001 Add `email_send_logs` table to convex/schema.ts with fields: businessId, userId, userRole, reportType, recipients, subject, status, sesMessageId, sentAt and index by_business_date
- [x] T002 [P] Add `benchmarking_opt_ins` table to convex/schema.ts with fields: businessId, isActive, industryGroup, industryLabel, optedInAt, optedInBy, optedOutAt and indexes by_businessId, by_industry_active
- [x] T003 [P] Add `benchmarking_aggregates` table to convex/schema.ts with fields: industryGroup, industryLabel, metric, period, sampleSize, average, median, p25, p75, p10, p90, updatedAt and index by_industry_metric
- [x] T004 Run `npx convex deploy --yes` to deploy schema changes to production

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: MCP tool registration plumbing and shared Convex functions

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Add Zod input/output schemas for `send_email_report`, `compare_to_industry`, and `toggle_benchmarking` tools in src/lambda/mcp-server/contracts/mcp-tools.ts per contracts/mcp-tools.md
- [x] T006 Register the three new tool names (`send_email_report`, `compare_to_industry`, `toggle_benchmarking`) in the TOOL_IMPLEMENTATIONS map and MCP_TOOLS registry in src/lambda/mcp-server/handler.ts (stub implementations returning "not implemented")
- [x] T007 Create convex/functions/emailSendLogs.ts with: internalMutation `create` (insert log row), internalQuery `countTodayByBusiness` (rate limit check — count rows where businessId matches and sentAt is within current UTC day), internalQuery `getByBusiness` (audit log query with pagination)
- [x] T008 [P] Create convex/functions/benchmarking.ts with: mutation `toggleOptIn` (create/update benchmarking_opt_ins, RBAC check for finance_admin/owner), query `getOptInStatus` (by businessId), internalQuery `getOptedInByIndustry` (for aggregation), internalQuery `getAggregates` (by industryGroup + metric + period)

**Checkpoint**: Schema deployed, MCP stubs registered, Convex CRUD ready — user story implementation can begin

---

## Phase 3: User Story 1 - Email Financial Reports via Chat (Priority: P1)

**Goal**: Finance admin/owner can say "Email this AP aging report to john@company.com" and Groot sends a formatted email with confirmation flow.

**Independent Test**: Log in as admin → ask Groot to email a report → confirm → check inbox for formatted email. Log in as employee → same request → should be denied.

### Implementation for User Story 1

- [x] T009 [US1] Add `financial_report` HTML email template to lambda/shared/templates/index.ts — include placeholders for {{businessName}}, {{reportTitle}}, {{reportPeriod}}, {{reportData}} (HTML table), {{senderName}}, {{sentDate}}, and {{unsubscribeUrl}}. Follow existing template patterns (inlined HTML, {{variable}} substitution).
- [x] T010 [US1] Implement `send_email_report` MCP tool in src/lambda/mcp-server/tools/send-email-report.ts: (1) Validate RBAC — reject if role not finance_admin/owner, (2) If confirmed=false: return preview with confirmation_message, recipients, report_type, (3) If confirmed=true: check rate limit via Convex countTodayByBusiness (reject if >=50), validate email addresses, render financial_report template with report_data, call sendEmail() from lambda/shared/email-service.ts for each recipient, log to email_send_logs via Convex, return success with message_ids and daily_sends_remaining
- [x] T011 [US1] Wire `send_email_report` tool into the LangGraph agent's tool registry — add to FINANCE_TOOLS set in src/lib/ai/tools/tool-factory.ts (RBAC enforcement) OR register as MCP tool in src/lambda/mcp-server/handler.ts replacing the stub from T006. Ensure the agent's system prompt mentions the two-phase confirmation flow (preview then confirm).
- [x] T012 [US1] Update the chat agent system prompt in src/lib/ai/agent/prompts/ to include instructions for the send_email_report tool: always call with confirmed=false first, show the confirmation to the user, only call with confirmed=true after explicit user approval. Include example interactions.
- [ ] T013 [US1] Deploy MCP server Lambda with new tool: `cd infra && npx cdk deploy FinanSEAL-MCP-Server --profile groot-finanseal --region us-west-2`
- [x] T014 [US1] Run `npx convex deploy --yes` to ensure email_send_logs functions are deployed

**Checkpoint**: Email report sending works end-to-end via chat. Finance admins can send, employees are denied, rate limit enforced.

---

## Phase 4: User Story 2 - Voice Input for Chat (Priority: P2)

**Goal**: Users can tap a microphone button, speak a query, see transcribed text in the input field, review it, and tap Send.

**Independent Test**: Open chat on Chrome → click mic → speak "What are my outstanding invoices?" → text appears in input → tap Send → normal chat response. On unsupported browser → mic button hidden/disabled.

### Implementation for User Story 2

- [x] T015 [P] [US2] Create src/domains/chat/hooks/use-voice-input.ts — custom React hook that: (1) Detects platform (Capacitor native vs web browser), (2) On web: uses SpeechRecognition / webkitSpeechRecognition API with lang='en-US', continuous=false, interimResults=true, (3) On Capacitor: uses @capacitor-community/speech-recognition plugin, (4) Exposes: { startRecording, stopRecording, isRecording, transcript, isSupported, error }, (5) On transcript finalize: calls onTranscript callback with final text
- [x] T016 [P] [US2] Install @capacitor-community/speech-recognition plugin: `npm install @capacitor-community/speech-recognition` and add microphone permission to ios/App/App/Info.plist (NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription)
- [x] T017 [US2] Create src/domains/chat/components/voice-input-button.tsx — React component that: (1) Uses useVoiceInput hook, (2) Shows Mic icon (lucide-react) when not recording, (3) Shows pulsing red indicator + recording duration when recording, (4) On click: toggles recording on/off, (5) When isSupported=false: renders null (hidden), (6) On transcript: calls onTranscript prop (parent sets input state), (7) Uses semantic tokens for styling (bg-card, text-foreground)
- [x] T018 [US2] Integrate VoiceInputButton into src/domains/chat/components/chat-window.tsx — add the mic button between the textarea and the send button inside the form. Wire onTranscript to setInput(). Ensure the button is only visible when not currently loading/streaming a response.
- [ ] T019 [US2] Sync Capacitor iOS project: `npx cap sync ios` to update native plugins

**Checkpoint**: Voice input works on web (Chrome/Edge) and iOS. Transcribed text appears in input for review. Unsupported browsers hide the mic button.

---

## Phase 5: User Story 3 - Cross-Business Benchmarking (Priority: P3)

**Goal**: Opted-in businesses can ask "Compare our COGS ratio to industry" and receive percentile ranking, averages, and recommendations. Minimum 10 peers required.

**Independent Test**: Opt in a business → ask benchmarking question → if >=10 peers: see percentile + averages + recommendations. If <10: see "insufficient data" message. Opt out → confirm data removal.

### Implementation for User Story 3

- [x] T020 [US3] Implement `toggle_benchmarking` MCP tool in src/lambda/mcp-server/tools/toggle-benchmarking.ts: (1) RBAC check for finance_admin/owner, (2) Fetch business from Convex to get msicCode, (3) Extract 2-digit industry group from msicCode, (4) Call Convex toggleOptIn mutation, (5) Return success with is_active, industry_group, message
- [x] T021 [US3] Add metric computation internalQuery to convex/functions/benchmarking.ts — `computeBusinessMetrics(businessId, period)`: query journal_entry_lines for revenue (4xxx), COGS (5100), OpEx (5200-5800) to compute gross_margin, cogs_ratio, opex_ratio. Query sales_invoices for avg daysOutstanding (ar_days). Query invoices for avg payment cycle (ap_days). Return all 5 metrics as key-value.
- [x] T022 [US3] Implement `compare_to_industry` MCP tool in src/lambda/mcp-server/tools/compare-to-industry.ts: (1) Check if business is opted in (getOptInStatus), (2) If not: return not_opted_in response with explanation, (3) If yes: compute business's own metric value via computeBusinessMetrics, (4) Fetch pre-computed aggregates from benchmarking_aggregates, (5) If sampleSize < 10: return insufficient_data, (6) Calculate percentile by comparing business value to distribution, (7) Generate recommendations based on percentile position, (8) Return full benchmark response per contract
- [x] T023 [US3] Create src/lambda/scheduled-intelligence/modules/benchmarking-aggregation.ts — EventBridge weekly module: (1) Fetch all opted-in businesses by industry group via Convex, (2) For each industry group with >=10 businesses: compute all 5 metrics for each business, (3) Calculate aggregate statistics (avg, median, p10/p25/p75/p90) per metric per industry, (4) Write aggregates to benchmarking_aggregates table via Convex internalMutation, (5) Return JobResult with industriesProcessed, metricsComputed counts
- [x] T024 [US3] Add EventBridge rule for weekly benchmarking aggregation in infra/lib/scheduled-intelligence-stack.ts — add `benchmarking-aggregation` rule with cron `cron(0 3 ? * SUN *)` (Sunday 3am UTC, after chat optimization at 2am), target: existing `finanseal-scheduled-intelligence` Lambda, input: `{ "module": "benchmarking-aggregation" }`
- [x] T025 [US3] Register the benchmarking-aggregation module in src/lambda/scheduled-intelligence/index.ts dispatcher (add case for module name mapping to handler function)
- [x] T026 [US3] Update chat agent system prompt in src/lib/ai/agent/prompts/ to include instructions for compare_to_industry and toggle_benchmarking tools — explain when to suggest opt-in, how to present benchmark results, and how to handle insufficient data gracefully
- [x] T027 [US3] Wire `compare_to_industry` and `toggle_benchmarking` into MCP handler replacing stubs from T006. Deploy MCP server: `cd infra && npx cdk deploy FinanSEAL-MCP-Server --profile groot-finanseal --region us-west-2`
- [x] T028 [US3] Deploy EventBridge stack: `cd infra && npx cdk deploy FinanSEAL-ScheduledIntelligence --profile groot-finanseal --region us-west-2`
- [x] T029 [US3] Run `npx convex deploy --yes` to ensure all benchmarking functions are deployed

**Checkpoint**: Benchmarking opt-in/out works. Comparison queries return percentile data (or insufficient data message). Weekly aggregation scheduled.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, build verification, documentation

- [x] T030 Run `npm run build` and fix any TypeScript compilation errors
- [ ] T031 [P] Update src/domains/expense-claims/einvoice/CLAUDE.md and root CLAUDE.md if any architecture patterns changed
- [ ] T032 Run full UAT: test all 3 features end-to-end per quickstart.md verification steps (email as admin, email denied as employee, voice on web, voice on unsupported browser, benchmarking opt-in, benchmarking query, benchmarking opt-out)
- [x] T033 Final `npx convex deploy --yes` to confirm all Convex changes are live

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must be deployed first)
- **US1 Email (Phase 3)**: Depends on Phase 2 (MCP stubs + Convex functions)
- **US2 Voice (Phase 4)**: Depends on Phase 1 only (no MCP/Convex dependency) — can run in parallel with US1
- **US3 Benchmarking (Phase 5)**: Depends on Phase 2 (MCP stubs + Convex functions)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Independence

- **US1 (Email)**: Fully independent. No dependency on US2 or US3.
- **US2 (Voice)**: Fully independent. Pure frontend — no backend/MCP dependency. Can start after Phase 1.
- **US3 (Benchmarking)**: Fully independent. No dependency on US1 or US2.

### Within Each User Story

- Schema/Convex before MCP tools (data layer first)
- MCP tool implementation before agent prompt updates
- CDK deploy after code changes
- Convex deploy after function changes

### Parallel Opportunities

- T002 + T003 can run in parallel (different tables)
- T005 + T007 + T008 can partially overlap (different files)
- T015 + T016 can run in parallel (hook vs plugin install)
- US1 and US2 can run entirely in parallel (different systems)
- US1 and US3 share Phase 2 but are otherwise independent

---

## Parallel Example: User Story 2 (Voice)

```
# These can run in parallel (different files):
Task T015: "Create use-voice-input.ts hook"
Task T016: "Install Capacitor speech plugin + iOS permissions"

# Then sequentially:
Task T017: "Create voice-input-button.tsx component" (depends on T015)
Task T018: "Integrate into chat-window.tsx" (depends on T017)
Task T019: "Sync Capacitor iOS project" (depends on T016)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T008)
3. Complete Phase 3: User Story 1 — Email (T009-T014)
4. **STOP and VALIDATE**: Test email sending end-to-end
5. Deploy if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Email) → Test → Deploy (MVP!)
3. Add US2 (Voice) → Test → Deploy (can overlap with US1)
4. Add US3 (Benchmarking) → Test → Deploy
5. Polish → Final validation → Ship

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US2 (Voice) has the lightest backend footprint — pure frontend, no MCP tools needed
- US3 (Benchmarking) has the heaviest backend — 2 MCP tools + EventBridge + aggregation logic
