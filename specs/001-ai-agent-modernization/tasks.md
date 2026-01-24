# Tasks: Next-Gen Agent Architecture

**Input**: Design documents from `/specs/001-ai-agent-modernization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not explicitly requested in spec - test tasks omitted.

**Organization**: Tasks grouped by user story priority (P1 → P2 → P3) for incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and external service setup

- [x] T001 Install npm dependencies: `npm install mem0ai neo4j-driver`
- [x] T002 [P] Add Neo4j environment variables to `.env.local` (NEO4J_URL, NEO4J_USERNAME, NEO4J_PASSWORD)
- [x] T003 [P] Add Mem0/VAPID environment variables to `.env.local` (QDRANT_MEMORIES_COLLECTION, VAPID keys)
- [ ] T004 Create Neo4j Aura Free instance at https://neo4j.com/aura/ and obtain credentials
- [ ] T005 Verify Neo4j connection with test script

**Checkpoint**: External services configured, dependencies installed

---

## Phase 1.5: Receipt Required Enforcement (Prerequisite Enhancement)

**Purpose**: Ensure data quality for AI extraction by making receipt attachment mandatory

**⚠️ CRITICAL**: This is a P1 prerequisite - must complete before Action Center vendor intelligence

### Schema & Validation

- [x] T091 Update `convex/functions/expenseClaims.ts` to add receipt validation in submit mutation (reject if no storagePath)
- [x] T092 [P] Update `src/domains/expense-claims/components/ExpenseClaimForm.tsx` to disable submit button until receipt attached
- [x] T093 [P] Update expense claim API endpoint to return 400 error if receipt missing on submission
- [x] T094 Add receipt required indicator to both AI extraction and manual entry workflows in UI

**Checkpoint**: All expense claim submissions require receipt attachment (both workflows)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Convex Schema Extensions

- [x] T006 Add `actionCenterInsights` table to `convex/schema.ts` with indexes (by_user_status, by_business_priority, by_category, by_detected)
- [x] T007 [P] Add `agentNotifications` table to `convex/schema.ts` with indexes (by_user_status, by_insight, by_scheduled)
- [x] T008 [P] Add `userPreferences` table to `convex/schema.ts` with by_user index
- [x] T009 Deploy Convex schema: `npx convex deploy --yes`
- [x] T010 Verify tables exist in Convex dashboard

### Mem0 Integration (Cloud + Direct Qdrant fallback)

- [x] T011 Create `src/lib/ai/agent/memory/mem0-config.ts` with dual-mode support (Mem0 Cloud or Direct Qdrant)
- [x] T012 Create `src/lib/ai/agent/memory/mem0-service.ts` with addConversationMemories, searchMemories, getAllUserMemories functions
- [x] T013 Test Mem0 connection and memory operations via `/api/v1/system/health/mem0` endpoint

**Checkpoint**: Foundation ready - Convex schema deployed, Memory service configured with dual-mode support

**Note**: Original spec assumed `mem0ai` npm package was OSS. It's actually Mem0 Cloud client requiring API key.
Implementation pivoted to support both Mem0 Cloud (full features) and Direct Qdrant (fallback without graph).
Neo4j setup (T004-T005) is optional - only needed for Mem0 OSS Python version, not the npm client.

---

## Phase 3: User Story 1 - Real-time Streaming (Priority: P1) 🎯 MVP

**Goal**: Users see AI response token-by-token within 1 second, with tool execution status indicators

**Independent Test**: Send a message via `/api/v1/chat/stream` and observe SSE events (token, tool, done) in browser DevTools

### Implementation for User Story 1

- [x] T014 [US1] Add streaming types to `src/lib/ai/agent/types.ts` (StreamEvent, TokenEvent, ToolEvent, MetadataEvent, DoneEvent)
- [x] T015 [US1] Create `streamAgentResponse` async generator in `src/lib/ai/langgraph-agent.ts` using `astream_events` v2 API
- [x] T016 [US1] Create `transformToStreamEvent` helper to convert LangGraph events to StreamEvent types
- [x] T017 [US1] Create SSE streaming endpoint at `src/app/api/v1/chat/stream/route.ts` with ReadableStream
- [x] T018 [US1] Add graceful error handling for streaming (connection drops, timeouts)
- [x] T019 [US1] Update `src/domains/chat/components/ChatInterface.tsx` to consume SSE stream
- [x] T020 [US1] Add typing indicator component that shows during streaming
- [x] T021 [US1] Add tool execution status indicator (shows which tool is running)

**Checkpoint**: Users see token-by-token streaming with <1s time-to-first-token

---

## Phase 4: User Story 2 - Persistent Memory (Priority: P1)

**Goal**: AI remembers user preferences and past interactions across sessions

**Independent Test**: Set a preference in one session, end session, start new session, verify AI recalls preference

### Implementation for User Story 2

- [x] T022 [US2] Create `remember` tool in `src/lib/ai/tools/memory/memory-store-tool.ts` (stores user-explicit preferences via Mem0)
- [x] T023 [P] [US2] Create `recall` tool in `src/lib/ai/tools/memory/memory-recall-tool.ts` (retrieves memories via semantic search)
- [x] T024 [US2] Register remember and recall tools in `src/lib/ai/tools/tool-factory.ts`
- [x] T025 [US2] Add post-conversation memory extraction hook (calls `addConversationMemories` after each conversation)
- [ ] T026 [US2] Create memory cleanup scheduled job in `convex/functions/maintenance.ts` for 12-month retention

**Checkpoint**: AI persists and recalls user preferences across sessions

---

## Phase 5: User Story 5 - Smart Action Center (Priority: P1)

**Goal**: Dashboard surfaces proactive insights (anomalies, compliance gaps, deadlines) before users ask

**Independent Test**: Create test data with anomaly (>2σ deviation), verify Action Center card appears

### Convex Functions

- [x] T027 [US5] Create `convex/functions/actionCenterInsights.ts` with CRUD operations (create, list, getById, updateStatus, getPending, getSummary)
- [x] T028 [P] [US5] Create `convex/functions/actionCenterJobs.ts` with runProactiveAnalysis internal action

### Detection Algorithms

- [x] T029 [US5] Implement anomaly detection algorithm (>2σ from historical average) in `convex/functions/insights/detectAnomalies.ts`
- [x] T030 [P] [US5] Implement compliance gap detection in `convex/functions/insights/detectComplianceGaps.ts`
- [x] T031 [P] [US5] Implement deadline tracking in `convex/functions/insights/trackDeadlines.ts`
- [x] T032 [P] [US5] Implement cash flow forecasting in `convex/functions/insights/forecastCashFlow.ts`
- [x] T033 [P] [US5] Implement duplicate detection in `convex/functions/insights/detectDuplicates.ts`

### Vendor Intelligence (NEW - P1 Enhancement)

- [x] T095 [P] [US5] Create `convex/functions/insights/vendorIntelligence.ts` with vendor pattern analysis (spending frequency, amount variance, payment timing)
- [x] T096 [P] [US5] Implement vendor risk scoring algorithm based on payment history and pattern changes
- [x] T097 [P] [US5] Implement top-10 vendor spending comparison (year-over-year, quarter-over-quarter)
- [x] T098 [US5] Add vendor intelligence detection to `runProactiveAnalysis` job (trigger on >30% spending variance)

### Real-Time Critical Alerts (NEW - P1 Enhancement)

- [x] T099 [US5] Create `convex/functions/insights/realTimeAlerts.ts` with critical alert evaluation logic (implemented inline in actionCenterJobs.ts)
- [x] T100 [US5] Implement >3σ anomaly detection for real-time critical alerts (bypass batch cycle)
- [x] T101 [P] [US5] Implement large transaction threshold alert (user-configurable amount)
- [x] T102 [P] [US5] Implement projected negative balance alert (within 7 days)
- [x] T103 [US5] Add real-time alert trigger hook to transaction creation/import flow in `convex/functions/transactions.ts`
- [x] T104 [US5] Ensure critical alerts delivered within <1 minute (not 4hr batch cycle)

### Scheduled Jobs

- [x] T034 [US5] Add proactive analysis cron job to `convex/crons.ts` (every 4 hours)
- [x] T035 [US5] Add deadline tracking cron job to `convex/crons.ts` (daily at 6 AM)

### API Endpoints

- [x] T036 [US5] Create `src/app/api/v1/insights/route.ts` (GET list, filters by status/category/priority)
- [x] T037 [P] [US5] Create `src/app/api/v1/insights/[insightId]/route.ts` (GET detail, PATCH status)
- [x] T038 [P] [US5] Create `src/app/api/v1/insights/summary/route.ts` (GET aggregated counts)
- [x] T039 [US5] Create `src/app/api/v1/insights/[insightId]/deep-dive/route.ts` (POST creates conversation with context)

### UI Components

- [x] T040 [US5] Create `src/domains/analytics/hooks/useInsights.ts` with Convex real-time subscription
- [x] T041 [US5] Create `src/domains/analytics/components/action-center/InsightCard.tsx` with priority badge, category icon, one-click actions
- [x] T042 [US5] Create `src/domains/analytics/components/action-center/InsightDetail.tsx` for expanded view
- [x] T043 [US5] Update `src/domains/analytics/components/action-center/ActionCenter.tsx` to use InsightCard components with real-time updates
- [x] T044 [US5] Add "Deep Dive" button that opens AI chat with insight context

### Vendor Intelligence UI (NEW - P1 Enhancement)

- [x] T105 [US5] Create `src/domains/analytics/components/action-center/VendorInsightCard.tsx` with vendor name, spending trend, risk score badge (implemented via unified InsightCard + InsightMetadata)
- [x] T106 [P] [US5] Add vendor spending chart component (quarter-over-quarter comparison) (metadata displayed in VendorSpendingChangeMetadata)
- [x] T107 [US5] Implement "Review Vendor" action button that links to vendor detail page (via InsightCard actions)

### Real-Time Critical Alerts UI (NEW - P1 Enhancement)

- [x] T108 [US5] Add critical alert visual indicator (red badge, animation) to distinguish from standard alerts (priority badge in InsightCard)
- [x] T109 [US5] Implement toast notification component for real-time critical alerts (appears immediately) (uses existing toast system)

**Checkpoint**: Action Center shows 3+ proactive insights per user per week, including vendor intelligence and real-time critical alerts

---

## Phase 6: User Story 3 - Context Management (Priority: P2)

**Goal**: AI maintains meaningful extended conversations without losing important context

**Independent Test**: Have 30+ message conversation, reference something from early messages, verify AI recalls correctly

### Implementation for User Story 3

- [x] T045 [US3] Create `src/lib/ai/agent/memory/context-builder.ts` with buildContext method
- [x] T046 [US3] Implement entity extraction and caching in context-builder.ts (vendors, amounts, dates)
- [x] T047 [US3] Implement conversation summarization for messages exceeding 20-message threshold
- [x] T048 [US3] Implement sliding window context with important message preservation
- [x] T049 [US3] Integrate context builder into agent initialization in `src/lib/ai/langgraph-agent.ts`
- [x] T050 [US3] Add tool result caching within session to avoid redundant queries

**Checkpoint**: Agent maintains context quality for 30+ message conversations

---

## Phase 7: User Story 6 - Proactive AI Assistant (Priority: P2)

**Goal**: AI proactively suggests relevant topics and connects conversations to Action Center insights

**Independent Test**: Open AI Assistant with pending Action Center items, verify AI mentions them proactively

### Implementation for User Story 6

- [x] T051 [US6] Create proactive system prompt template in `src/lib/ai/agent/prompts/proactive-prompt.ts`
- [x] T052 [US6] Inject pending Action Center insights into conversation context
- [x] T053 [US6] Implement proactive behavior: mention unreviewed high-priority items on conversation start
- [x] T054 [US6] Implement topic-to-insight connection ("Speaking of expenses, I detected...")
- [x] T055 [US6] Implement memory recall connections ("You discussed this vendor 2 weeks ago...")
- [x] T056 [US6] Implement absence summary feature for users returning after 7+ days

**Checkpoint**: AI proactively mentions relevant context in 80% of applicable conversations

---

## Phase 8: User Story 4 - MCP Client Integration (Priority: P2)

**Goal**: LangGraph agent can dynamically consume tools from deployed MCP servers (Supabase, Context7, etc.)

**Independent Test**: Agent successfully calls an MCP server tool and returns results to user

### MCP Client Infrastructure

- [x] T057 [US4] Create `src/lib/ai/mcp/mcp-client-config.ts` with MCP server registry (URLs, transport types, auth)
- [x] T058 [US4] Install MCP client dependencies: `@modelcontextprotocol/sdk`
- [x] T059 [US4] Create `src/lib/ai/mcp/mcp-client.ts` with connection management (connect, disconnect, reconnect)
- [x] T060 [US4] Implement MCP tool discovery - fetch available tools from connected servers

### MCP Tool Adapter

- [x] T061 [US4] Create `src/lib/ai/mcp/mcp-tool-adapter.ts` to convert MCP tools to LangGraph-compatible format
- [x] T062 [US4] Implement MCP tool schema to OpenAI function schema converter
- [x] T063 [US4] Create `McpToolWrapper` class extending `BaseTool` for unified tool interface

### Agent Integration

- [x] T064 [US4] Update `src/lib/ai/tools/tool-factory.ts` to dynamically register MCP tools
- [x] T065 [US4] Create MCP tool executor (merged into mcp-client.ts callTool method)
- [x] T066 [US4] Update `src/lib/ai/langgraph-agent.ts` to initialize MCP client on agent start
- [x] T067 [US4] Add MCP tool results to streaming events (tool name, server, result)

### Configuration & Management

- [x] T068 [US4] Create MCP server configuration in environment variables (MCP_SERVERS JSON)
- [x] T069 [P] [US4] Add MCP connection health check to `/api/v1/system/health/mcp` endpoint
- [x] T070 [P] [US4] Implement graceful degradation when MCP server unavailable (agent continues with native tools)
- [x] T071 [US4] Add MCP tool usage logging for debugging and analytics

### Security & Multi-tenancy

- [x] T072 [US4] Implement per-user MCP tool permissions (which tools each user can access)
- [x] T073 [US4] Add business context injection for MCP tool calls (pass businessId, userId)
- [x] T074 [US4] Audit MCP tool calls for security compliance

**Checkpoint**: LangGraph agent successfully discovers and executes tools from external MCP servers

---

## Phase 9: User Story 7 - Event-Driven Notifications (Priority: P3)

**Goal**: Users receive real-time notifications about critical financial events

**Independent Test**: Create critical anomaly, verify web notification appears within 5 minutes

### Notification Infrastructure

- [x] T075 [US7] Create `convex/functions/agentNotifications.ts` with queueNotification, processNotificationQueue, markDelivered functions ✓ VERIFIED
- [x] T076 [US7] Add notification processing cron job to `convex/crons.ts` ✓ VERIFIED
- [x] T077 [US7] Add `sendInsightNotification` method to `src/lib/services/email-service.ts` (using existing SES)

### API Endpoints

- [x] T078 [US7] Create `src/app/api/v1/notifications/preferences/route.ts` (GET/PUT)
- [x] T079 [US7] ~~Push subscription~~ SKIPPED - Using email instead of Web Push

### UI Integration

- [x] T080 [US7] Add email notification toggle to user preferences in settings
- [x] T081 [US7] Include deep-link URL in email notification to Action Center card
- [x] T082 [US7] ~~Permission flow~~ SKIPPED - No browser permission needed for email

**Checkpoint**: Critical notifications delivered within 5 minutes via email (SES)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T083 Run `npm run build` and fix any type errors
- [x] T084 [P] Implement graceful degradation when Mem0/Neo4j unavailable (agent continues, warns user)
- [x] T085 [P] Add error handling for streaming connection drops
- [ ] T086 Performance optimization: add caching for memory retrieval (<200ms target)
- [ ] T087 Performance optimization: optimize Qdrant indices for memory search
- [x] T088 Security audit: verify multi-tenant isolation in all new endpoints
- [ ] T089 Run quickstart.md validation checklist
- [ ] T090 Final production deployment verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Receipt Required (Phase 1.5)**: Depends on Setup - P1 prerequisite for data quality
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US1 Streaming (Phase 3)**: Depends on Foundational
- **US2 Memory (Phase 4)**: Depends on Foundational (Mem0 setup)
- **US5 Action Center (Phase 5)**: Depends on Foundational (Convex schema) + Phase 1.5 (receipt required for vendor intelligence data quality)
- **US3 Context (Phase 6)**: Depends on US2 (memory service)
- **US6 Proactive AI (Phase 7)**: Depends on US2, US3, US5 (memory + context + insights)
- **US4 MCP Server (Phase 8)**: Depends on domain intelligence tools
- **US7 Notifications (Phase 9)**: Depends on US5 (Action Center insights)
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 1.5: Receipt Required (Prerequisite Enhancement)  ← NEW
    ↓
Phase 2: Foundational (schema, Mem0, Neo4j)
    ↓
┌───────────────────────────────────────────────────────────────────┐
│ Phase 3: US1 (Streaming)     [P1]                                  │
│ Phase 4: US2 (Memory)        [P1]         ← Can run in parallel   │
│ Phase 5: US5 (Action Center) [P1]                                  │
│     └── NEW: Vendor Intelligence, Real-time Critical Alerts        │
└───────────────────────────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────┐
│ Phase 6: US3 (Context)       [P2]         │
│ Phase 7: US6 (Proactive AI)  [P2]         │  ← After P1 stories
│ Phase 8: US4 (MCP Server)    [P2]         │
└───────────────────────────────────────────┘
    ↓
Phase 9: US7 (Notifications)   [P3]
    ↓
Phase 10: Polish
```

### Within Each User Story

- Models/types before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 2 (Foundational)**:
- T007, T008 can run in parallel (different Convex tables)

**Phase 3 (US1 Streaming)**:
- T014-T16 must be sequential (types → streaming → transform)

**Phase 4 (US2 Memory)**:
- T022, T023 can run in parallel (different tool files)

**Phase 1.5 (Receipt Required)**:
- T092, T093 can run in parallel (different files)

**Phase 5 (US5 Action Center)**:
- T027, T028 can run in parallel
- T029-T033 can ALL run in parallel (different detection algorithms)
- T095-T097 can run in parallel (different vendor intelligence components) - NEW
- T101, T102 can run in parallel (different alert types) - NEW
- T036-T038 can run in parallel (different API files)
- T105, T106 can run in parallel (different UI components) - NEW

**Phase 8 (US4 MCP)**:
- T064-T067 can run in parallel (different MCP resources)
- T068-T071 can run in parallel (different domain intelligence tools)

---

## Parallel Example: User Story 5 (Action Center)

```bash
# Launch all detection algorithms in parallel:
Task T029: "Anomaly detection in convex/functions/insights/detectAnomalies.ts"
Task T030: "Compliance gaps in convex/functions/insights/detectComplianceGaps.ts"
Task T031: "Deadlines in convex/functions/insights/trackDeadlines.ts"
Task T032: "Cash flow in convex/functions/insights/forecastCashFlow.ts"
Task T033: "Duplicates in convex/functions/insights/detectDuplicates.ts"

# Launch all API endpoints in parallel:
Task T036: "List insights in src/app/api/v1/insights/route.ts"
Task T037: "Insight detail in src/app/api/v1/insights/[insightId]/route.ts"
Task T038: "Summary in src/app/api/v1/insights/summary/route.ts"
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup
2. Complete Phase 1.5: Receipt Required (Prerequisite) → NEW
3. Complete Phase 2: Foundational (CRITICAL)
4. Complete Phase 3: US1 Streaming → Test independently
5. Complete Phase 4: US2 Memory → Test independently
6. Complete Phase 5: US5 Action Center (incl. Vendor Intelligence + Real-time Alerts) → Test independently
7. **STOP and VALIDATE**: All P1 stories functional + new enhancements
8. Deploy MVP

### Incremental Delivery

1. **MVP**: Setup + Receipt Required + Foundational + US1 + US2 + US5 (incl. Vendor Intelligence + Real-time Critical Alerts) → Core AI experience with competitive edge
2. **V1.1**: Add US3 + US6 → Context + Proactive behaviors
3. **V1.2**: Add US4 → MCP Server for Claude Desktop
4. **V1.3**: Add US7 → Notifications
5. **V1.4**: Polish → Performance, reliability, security
6. **V2.0 (Phase 2 Roadmap)**: Benchmark Intelligence, Predictive Spend Alerts, Approval Workflow AI, Advanced Vendor Negotiation

### Success Metrics to Validate

| Metric | Target | User Story |
|--------|--------|------------|
| Time-to-first-token | <1s | US1 |
| Memory recall accuracy | 95% | US2 |
| Insights per user/week | 3+ | US5 |
| Context quality at 30+ messages | Maintained | US3 |
| Proactive mentions when applicable | 80% | US6 |
| MCP auth success rate | 100% | US4 |
| Notification delivery | <5 minutes | US7 |
| **Critical alert delivery** | **<1 minute** | **US5 (NEW)** |
| **Vendor intelligence coverage** | **>30% variance vendors surfaced** | **US5 (NEW)** |
| **Receipt enforcement** | **100% compliance** | **Prerequisite (NEW)** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story should be independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `npm run build` frequently to catch type errors early
- Run `npx convex deploy --yes` after any Convex changes
