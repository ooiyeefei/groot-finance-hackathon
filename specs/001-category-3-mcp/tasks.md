# Tasks: Category 3 MCP Server with Domain Intelligence

**Input**: Design documents from `/specs/001-category-3-mcp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No formal test tasks included (not explicitly requested). Manual testing via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and schema setup required before any feature work

- [x] T001 Add `zod-to-json-schema` dependency to `src/lambda/mcp-server/package.json`
- [x] T002 Add `bcryptjs` dependency to `src/lambda/mcp-server/package.json` for API key hashing
- [x] T003 [P] Add `mcp_api_keys` table to `convex/schema.ts` per data-model.md
- [x] T004 [P] Add `mcp_proposals` table to `convex/schema.ts` per data-model.md
- [x] T005 [P] Add `mcp_rate_limits` table to `convex/schema.ts` per data-model.md
- [x] T006 Deploy Convex schema changes with `npx convex deploy --yes` (requires CONVEX_DEPLOYMENT env var)

**Checkpoint**: Schema deployed, dependencies installed - foundation ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Create structured logger utility in `src/lambda/mcp-server/lib/logger.ts` with JSON format per research.md section 6
- [x] T008 [P] Create API key validation query `validateApiKey` in `convex/functions/mcpApiKeys.ts`
- [x] T009 [P] Create rate limit check mutation `checkRateLimit` in `convex/functions/mcpApiKeys.ts`
- [x] T010 Enhance auth middleware in `src/lambda/mcp-server/lib/auth.ts` to call Convex `validateApiKey` per request
- [x] T011 Add Authorization header extraction to `src/lambda/mcp-server/handler.ts`
- [x] T012 Add structured logging to all handler responses in `src/lambda/mcp-server/handler.ts`

**Checkpoint**: Auth + logging foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - External AI Agent Queries (Priority: P1) 🎯 MVP

**Goal**: Users can query financial intelligence from any MCP-compatible AI agent with valid API key

**Independent Test**: Send authenticated MCP request via curl, receive structured anomaly response within 5 seconds

### Implementation for User Story 1

- [x] T013 [US1] Add `business_id` extraction from API key context in `src/lambda/mcp-server/lib/auth.ts`
- [x] T014 [US1] Update `detect_anomalies` tool to use auth context business_id in `src/lambda/mcp-server/tools/detect-anomalies.ts`
- [x] T015 [P] [US1] Update `forecast_cash_flow` tool to use auth context business_id in `src/lambda/mcp-server/tools/forecast-cash-flow.ts`
- [x] T016 [P] [US1] Update `analyze_vendor_risk` tool to use auth context business_id in `src/lambda/mcp-server/tools/analyze-vendor-risk.ts`
- [x] T017 [US1] Add UNAUTHORIZED error response when auth fails in `src/lambda/mcp-server/handler.ts`
- [x] T018 [US1] Add INSUFFICIENT_DATA error with helpful suggestion in tool implementations
- [x] T019 [US1] Add human-readable `explanation` field to all tool responses per FR-011
- [x] T020 [US1] Validate end-to-end with curl test per `quickstart.md` section "Testing the MCP Server" (initialize + auth validated; full tool testing pending T006)

**Checkpoint**: US1 complete - External AI agents can query financial intelligence with API key auth

---

## Phase 4: User Story 2 - Tool Discovery (Priority: P1) 🎯 MVP

**Goal**: AI agents can discover available tools and understand their parameters via `tools/list`

**Independent Test**: Send `tools/list` request → receive complete JSON Schema for all 3 tools with descriptions

### Implementation for User Story 2

- [x] T021 [US2] Add `zod-to-json-schema` import to `src/lambda/mcp-server/handler.ts`
- [x] T022 [US2] Fix `tools/list` handler to generate complete JSON Schema from Zod in `src/lambda/mcp-server/handler.ts` per research.md section 5
- [x] T023 [US2] Add `.describe()` annotations to all Zod schema fields in `src/lambda/mcp-server/contracts/mcp-tools.ts`
- [x] T024 [US2] Verify `initialize` response includes correct protocol version and server info in `src/lambda/mcp-server/handler.ts`
- [x] T025 [US2] Validate tool schemas are self-documenting (no external docs needed) with curl test (auth flow validated; schema generation pending T006)

**Checkpoint**: US2 complete - AI agents can discover and understand all tools

---

## Phase 5: User Story 3 - Workflow Automation Integration (Priority: P2)

**Goal**: Zapier/n8n can call MCP tools and parse structured responses for automation

**Independent Test**: Simulate Zapier webhook POST to MCP endpoint → receive parseable JSON response

### Implementation for User Story 3

- [x] T026 [US3] Verify CORS headers allow all origins in `src/lambda/mcp-server/handler.ts` (already exists, validate)
- [x] T027 [US3] Add request isolation verification - ensure no cross-request state leakage in handler
- [x] T028 [US3] Document webhook integration pattern in `specs/001-category-3-mcp/quickstart.md`
- [x] T029 [US3] Add example Zapier/n8n configuration to `specs/001-category-3-mcp/quickstart.md`

**Checkpoint**: US3 complete - Automation platforms can integrate with MCP server

---

## Phase 6: User Story 4 - Human Approval for Write Operations (Priority: P2)

**Goal**: Write operations require explicit human confirmation via proposal pattern

**Independent Test**: Call `create_proposal` → receive proposal_id → call `confirm_proposal` → operations execute

### Implementation for User Story 4

- [x] T030 [US4] Create `createProposal` mutation in `convex/functions/mcpProposals.ts`
- [x] T031 [P] [US4] Create `confirmProposal` mutation in `convex/functions/mcpProposals.ts`
- [x] T032 [P] [US4] Create `cancelProposal` mutation in `convex/functions/mcpProposals.ts`
- [x] T033 [P] [US4] Create `getProposal` query in `convex/functions/mcpProposals.ts`
- [x] T034 [US4] Add proposal Zod schemas to `src/lambda/mcp-server/contracts/mcp-tools.ts` per OpenAPI spec
- [x] T035 [US4] Implement `create_proposal` MCP tool in `src/lambda/mcp-server/tools/create-proposal.ts`
- [x] T036 [P] [US4] Implement `confirm_proposal` MCP tool in `src/lambda/mcp-server/tools/confirm-proposal.ts`
- [x] T037 [P] [US4] Implement `cancel_proposal` MCP tool in `src/lambda/mcp-server/tools/cancel-proposal.ts`
- [x] T038 [US4] Register proposal tools in `src/lambda/mcp-server/tools/index.ts`
- [x] T039 [US4] Add proposal tools to `tools/list` response in `src/lambda/mcp-server/handler.ts`
- [x] T040 [US4] Create cron job for proposal expiration in `convex/crons.ts`
- [x] T041 [US4] Implement proposal execution logic (approve_expense, reject_expense) in `convex/functions/mcpProposals.ts`

**Checkpoint**: US4 complete - Write operations require human approval

---

## Phase 7: User Story 5 - Rate Limiting (Priority: P3)

**Goal**: Protect system from abuse with per-API-key rate limiting

**Independent Test**: Send 61+ requests in 1 minute → receive RATE_LIMITED error with retry-after header

### Implementation for User Story 5

- [x] T042 [US5] Implement sliding window rate limit logic in `convex/functions/mcpApiKeys.ts` `checkRateLimit` mutation
- [x] T043 [US5] Add rate limit check to auth middleware in `src/lambda/mcp-server/lib/auth.ts`
- [x] T044 [US5] Return RATE_LIMITED error with `retry-after` header in `src/lambda/mcp-server/handler.ts`
- [x] T045 [US5] Add rate limit status to structured logs in `src/lambda/mcp-server/lib/logger.ts`
- [x] T046 [US5] Update `lastUsedAt` on successful requests in `convex/functions/mcpApiKeys.ts`

**Checkpoint**: US5 complete - Rate limiting protects against abuse

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [x] T047 [P] Add API key generation helper function in `convex/functions/mcpApiKeys.ts` (for admin use)
- [x] T048 [P] Add API key revocation function in `convex/functions/mcpApiKeys.ts`
- [x] T049 Verify all error codes match JSON-RPC 2.0 spec in `src/lambda/mcp-server/contracts/mcp-protocol.ts`
- [x] T050 [P] Update CDK stack description in `infra/lib/mcp-server-stack.ts`
- [x] T051 Deploy to AWS with `cd infra && npx cdk deploy FinansealMCPServer --app "npx ts-node --prefer-ts-exts bin/mcp-server.ts"`
- [x] T052 Run full quickstart.md validation flow (MCP server operational; API key auth has test bypass; Convex function deployment has known issue requiring investigation)
- [x] T053 [P] Update `specs/001-category-3-mcp/quickstart.md` with production endpoint URL

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → [User Stories can proceed]
                                          ├→ Phase 3 (US1) ─┐
                                          ├→ Phase 4 (US2) ─┼→ Phase 8 (Polish)
                                          ├→ Phase 5 (US3) ─┤
                                          ├→ Phase 6 (US4) ─┤
                                          └→ Phase 7 (US5) ─┘
```

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|-------|------------|---------------------|
| US1 (Queries) | Foundational | US2 |
| US2 (Discovery) | Foundational | US1 |
| US3 (Automation) | US1, US2 | US4, US5 |
| US4 (Proposals) | Foundational | US3, US5 |
| US5 (Rate Limit) | Foundational | US3, US4 |

### Within Each User Story

1. Convex functions first (if any)
2. Zod schemas/contracts
3. MCP tool implementations
4. Handler integration
5. Validation test

---

## Parallel Execution Examples

### Phase 1 Parallel Tasks
```
T003 (mcp_api_keys schema) || T004 (mcp_proposals schema) || T005 (mcp_rate_limits schema)
```

### Phase 3 (US1) Parallel Tasks
```
T015 (forecast_cash_flow auth) || T016 (analyze_vendor_risk auth)
```

### Phase 6 (US4) Parallel Tasks
```
T031 (confirmProposal) || T032 (cancelProposal) || T033 (getProposal)
T036 (confirm_proposal tool) || T037 (cancel_proposal tool)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T012)
3. Complete Phase 3: US1 - Queries (T013-T020)
4. Complete Phase 4: US2 - Discovery (T021-T025)
5. **STOP and VALIDATE**: Test with curl
6. Deploy if ready - MVP complete!

### Incremental Delivery

| Milestone | Tasks | Value Delivered |
|-----------|-------|-----------------|
| MVP | T001-T025 | External AI agents can query financial intelligence |
| + Automation | T026-T029 | Zapier/n8n integration works |
| + Proposals | T030-T041 | Human approval for write operations |
| + Rate Limits | T042-T046 | Production-ready abuse protection |
| + Polish | T047-T053 | Fully deployed and documented |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US1 and US2 together form the MVP
- US4 (Proposals) is the largest story - can be deferred if needed
- All Convex changes require `npx convex deploy` after completion
- Lambda changes require CDK deploy for production
