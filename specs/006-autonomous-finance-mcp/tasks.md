# Tasks: Autonomous Finance MCP Server

**Input**: Design documents from `/specs/006-autonomous-finance-mcp/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/ (complete)

**Tests**: Tests are NOT explicitly requested in the specification. Optional test tasks are noted but not included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Lambda MCP Server**: `src/lambda/mcp-server/`
- **Infrastructure**: `infra/lib/`
- **LangGraph Integration**: `src/lib/ai/tools/mcp/`
- **Existing Agent**: `src/lib/ai/langgraph-agent.ts`
- **Existing Tools**: `src/lib/ai/tools/tool-factory.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and MCP server structure

- [ ] T001 Create MCP server Lambda directory structure at src/lambda/mcp-server/{tools,lib}
- [ ] T002 Create package.json with @modelcontextprotocol/sdk and zod dependencies in src/lambda/mcp-server/package.json
- [ ] T003 [P] Create tsconfig.json for Lambda with ES modules support in src/lambda/mcp-server/tsconfig.json
- [ ] T004 [P] Copy contracts from specs to Lambda src/lambda/mcp-server/contracts/mcp-tools.ts
- [ ] T005 [P] Copy protocol contracts to Lambda src/lambda/mcp-server/contracts/mcp-protocol.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**WARNING**: No user story work can begin until this phase is complete

- [ ] T006 Create Convex HTTP client utility in src/lambda/mcp-server/lib/convex-client.ts
- [ ] T007 Create business ID authorization helper in src/lambda/mcp-server/lib/auth.ts
- [ ] T008 Create MCP Lambda handler skeleton with StreamableHTTPServerTransport in src/lambda/mcp-server/handler.ts
- [ ] T009 Create CDK stack for MCP server Lambda + API Gateway in infra/lib/mcp-server-stack.ts
- [ ] T010 Register MCPServerStack in infra CDK app entry point at infra/bin/infra.ts
- [ ] T011 Create MCP client wrapper class in src/lib/ai/tools/mcp/mcp-client.ts
- [ ] T012 Create MCP tool adapter skeleton in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T013 Add MCP_SERVER_URL environment variable to Vercel config documentation

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Real-Time Financial Intelligence via Chat (Priority: P1)

**Goal**: Users can ask the AI assistant about financial anomalies and receive intelligence-backed responses within 3 seconds

**Independent Test**: Ask AI assistant "Are there any unusual transactions this month?" and receive response with real anomaly detection results from MCP server

### Implementation for User Story 1

- [ ] T014 [US1] Implement detect_anomalies tool in src/lambda/mcp-server/tools/detect-anomalies.ts
- [ ] T015 [US1] Register detect_anomalies tool in MCP server handler at src/lambda/mcp-server/handler.ts
- [ ] T016 [US1] Implement mcp_detect_anomalies tool wrapper in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T017 [US1] Register mcp_detect_anomalies in ToolFactory at src/lib/ai/tools/tool-factory.ts
- [ ] T018 [P] [US1] Implement forecast_cash_flow tool in src/lambda/mcp-server/tools/forecast-cash-flow.ts
- [ ] T019 [P] [US1] Implement analyze_vendor_risk tool in src/lambda/mcp-server/tools/analyze-vendor-risk.ts
- [ ] T020 [US1] Register forecast_cash_flow and analyze_vendor_risk in MCP server handler at src/lambda/mcp-server/handler.ts
- [ ] T021 [US1] Implement mcp_forecast_cash_flow tool wrapper in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T022 [US1] Implement mcp_analyze_vendor_risk tool wrapper in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T023 [US1] Register mcp_forecast_cash_flow and mcp_analyze_vendor_risk in ToolFactory at src/lib/ai/tools/tool-factory.ts
- [ ] T024 [US1] Add CloudWatch logging for MCP tool invocations in src/lambda/mcp-server/handler.ts
- [ ] T025 [US1] Add Sentry error tracking to MCP Lambda in src/lambda/mcp-server/handler.ts

**Checkpoint**: User Story 1 complete - users can query financial intelligence through chat

---

## Phase 4: User Story 2 - Self-Evolving Agent Learning (Priority: P2)

**Goal**: AI agent remembers user financial patterns and preferences, providing increasingly personalized insights

**Independent Test**: Ask the same category of question after multiple sessions and observe the agent reference previous context or learned patterns

### Implementation for User Story 2

- [ ] T026 [US2] Review existing mem0 memory tools integration in src/lib/ai/tools/memory/
- [ ] T027 [US2] Create financial pattern learning logic that stores MCP tool results in memory at src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T028 [US2] Add memory recall for user baseline patterns before MCP tool calls in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T029 [US2] Implement user alert threshold storage via existing memory tools in src/lib/ai/tools/mcp/mcp-tool-adapter.ts
- [ ] T030 [US2] Add context injection for learned preferences in agent prompt in src/lib/ai/langgraph-agent.ts
- [ ] T031 [US2] Create proactive insight surfacing logic based on stored patterns in src/lib/ai/langgraph-agent.ts

**Checkpoint**: User Story 2 complete - agent demonstrates personalized learning

---

## Phase 5: User Story 3 - Multi-Tool Orchestration (Priority: P3)

**Goal**: AI agent intelligently combines multiple intelligence tools in a single response for comprehensive insights

**Independent Test**: Ask "Give me a complete financial health check" and receive a combined response using all three intelligence tools

### Implementation for User Story 3

- [ ] T032 [US3] Add tool orchestration hints to agent system prompt in src/lib/ai/langgraph-agent.ts
- [ ] T033 [US3] Implement parallel MCP tool execution support in src/lib/ai/tools/mcp/mcp-client.ts
- [ ] T034 [US3] Create financial health check synthesis logic in agent in src/lib/ai/langgraph-agent.ts
- [ ] T035 [US3] Add priority weighting for critical alerts across tools in src/lib/ai/langgraph-agent.ts
- [ ] T036 [US3] Implement graceful degradation when some tools timeout in src/lib/ai/tools/mcp/mcp-tool-adapter.ts

**Checkpoint**: User Story 3 complete - agent provides unified financial health checks

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and deployment readiness

- [ ] T037 [P] Implement rate limiting (60 calls/min per user) in src/lambda/mcp-server/lib/rate-limiter.ts
- [ ] T038 Integrate rate limiter into MCP handler in src/lambda/mcp-server/handler.ts
- [ ] T039 [P] Add input validation with helpful error messages in src/lambda/mcp-server/handler.ts
- [ ] T040 Deploy MCP server stack to AWS via CDK deploy command
- [ ] T041 Update Vercel environment variables with MCP_SERVER_URL
- [ ] T042 Run end-to-end validation per quickstart.md deployment checklist
- [ ] T043 Verify <3 second response time for MCP tools (SC-001)
- [ ] T044 Test concurrent connections (100 target per SC-003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 -> P2 -> P3)
- **Polish (Phase 6)**: Depends on User Story 1 being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 MCP tools but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses US1 MCP tools but independently testable

### Within Each User Story

- MCP server tools before client wrappers
- Client wrappers before ToolFactory registration
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- T004 and T005 (contracts copy) can run in parallel
- T018 and T019 (cash flow and vendor tools) can run in parallel after T014 validates pattern
- Different user stories can be worked on in parallel by different team members after Phase 2

---

## Parallel Example: User Story 1 MCP Tools

```bash
# After T014 (detect_anomalies) validates the pattern:
Task T018: "Implement forecast_cash_flow tool in src/lambda/mcp-server/tools/forecast-cash-flow.ts"
Task T019: "Implement analyze_vendor_risk tool in src/lambda/mcp-server/tools/analyze-vendor-risk.ts"

# These can run in parallel since they follow the same pattern in different files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test detect_anomalies end-to-end
5. Deploy MCP server and validate via chat interface

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> Deploy/Demo (MVP!)
3. Add User Story 2 -> Test independently -> Deploy/Demo
4. Add User Story 3 -> Test independently -> Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (MCP server tools)
   - Developer B: User Story 1 (LangGraph client integration)
3. After US1 deployed:
   - Developer A: User Story 2
   - Developer B: User Story 3
4. Stories complete and integrate independently

---

## File Summary

| Path | Tasks | Purpose |
|------|-------|---------|
| `src/lambda/mcp-server/package.json` | T002 | Lambda dependencies |
| `src/lambda/mcp-server/handler.ts` | T008, T015, T020, T024, T25, T38-39 | MCP server entry point |
| `src/lambda/mcp-server/tools/detect-anomalies.ts` | T014 | Anomaly detection tool |
| `src/lambda/mcp-server/tools/forecast-cash-flow.ts` | T018 | Cash flow forecast tool |
| `src/lambda/mcp-server/tools/analyze-vendor-risk.ts` | T019 | Vendor risk analysis tool |
| `src/lambda/mcp-server/lib/convex-client.ts` | T006 | Convex HTTP API client |
| `src/lambda/mcp-server/lib/auth.ts` | T007 | Business ID validation |
| `infra/lib/mcp-server-stack.ts` | T009 | CDK infrastructure |
| `src/lib/ai/tools/mcp/mcp-client.ts` | T011, T033 | MCP client wrapper |
| `src/lib/ai/tools/mcp/mcp-tool-adapter.ts` | T012, T016, T21-22, T27-29, T36 | Tool adapters |
| `src/lib/ai/tools/tool-factory.ts` | T017, T023 | Tool registration |
| `src/lib/ai/langgraph-agent.ts` | T030-31, T32, T34-35 | Agent integration |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- MCP server uses existing Convex detection algorithms - no algorithm reimplementation needed
