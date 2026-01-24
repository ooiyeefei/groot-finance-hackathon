# Implementation Plan: Next-Gen Agent Architecture - Memory, Context Engineering, MCP & Real-time Integration

**Branch**: `001-ai-agent-modernization` | **Date**: 2026-01-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ai-agent-modernization/spec.md`

## Summary

Upgrade FinanSEAL's existing LangGraph-based AI agent to implement:
1. **Real-time Streaming** - SSE-based token streaming for <1s time-to-first-token
2. **Hierarchical Memory** - Persistent user preferences + episodic memories with vector embeddings
3. **Smart Action Center** - Proactive intelligence layer for anomaly detection, compliance alerts, cash flow forecasting, **vendor intelligence**
4. **Proactive AI Assistant** - Context injection from Action Center, memory recall, absence summaries
5. **MCP Server** - Domain intelligence server (Type 3) for Claude Desktop integration
6. **Event-Driven Notifications** - Real-time web notifications for critical insights
7. **Real-time Critical Alerts** - <1 minute delivery for >3σ anomalies, large transactions, negative balance (vs standard 4hr batch)
8. **Receipt Required Enforcement** - Mandatory receipt attachment for expense claims (both AI extraction and manual entry)

**Technical Approach**: Enhance existing LangGraph StateGraph with InMemorySaver/InMemoryStore, add streamEvents() API, build MCP server with OAuth2 auth wrapping elevated domain intelligence tools.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15.4.6), Python 3.11 (Lambda)
**Primary Dependencies**:
- LangGraph 0.2+ (agent framework with streaming)
- @modelcontextprotocol/sdk 1.0+ (MCP server)
- Convex (real-time database)
- Qdrant Cloud (vector embeddings)
- OpenAI SDK (LLM integration)
- Gemini 3 Flash Preview (document processing, RAG analysis)

**Storage**:
- Convex (user data, transactions, memories, action center insights)
- Qdrant (vector embeddings for memory/RAG)
- AWS S3 (documents)

**Testing**:
- Jest/Vitest (unit tests)
- Playwright (E2E tests)
- Manual testing for streaming/real-time features

**Target Platform**: Web (Next.js on Vercel), MCP server (standalone Node.js process)
**Project Type**: Web application (existing monorepo)

**Performance Goals**:
- <1s time-to-first-token for streaming responses
- <5 minutes for critical notification delivery
- 95% memory recall accuracy
- 3+ insights per user per week

**Constraints**:
- Must integrate with existing ToolFactory + BaseTool pattern
- Must maintain multi-tenant isolation (businessId scoping)
- Memory retention: 12 months max
- Must not break existing chat functionality during migration

**Scale/Scope**:
- ~1000 active users initially
- ~50 Action Center insight types
- ~5 MCP tools (domain intelligence)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Constitution template not customized for FinanSEAL. Using CLAUDE.md guidelines:

| Principle | Status | Notes |
|-----------|--------|-------|
| Prefer Modification Over Creation | ✅ PASS | Enhancing existing LangGraph agent, not replacing |
| Build-Fix Loop Mandatory | ✅ PASS | Will run `npm run build` after each change |
| Embrace Parallel Execution | ✅ PASS | Phase 0 research can parallelize |
| Git Author for Deployments | ✅ PASS | Using grootdev-ai author |
| AWS CDK as Single Source | ✅ PASS | Any Lambda changes via CDK |
| Convex Deployment | ✅ PASS | Will deploy to prod after schema changes |
| Semantic Design System | ✅ PASS | UI changes use semantic tokens |

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-agent-modernization/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output - technical research
├── data-model.md        # Phase 1 output - entity schemas
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - API contracts
│   ├── streaming-api.yaml
│   ├── mcp-server.yaml
│   └── action-center-api.yaml
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Existing structure - modifications only
src/
├── lib/
│   ├── ai/
│   │   ├── langgraph-agent.ts          # MODIFY: Add streaming, memory injection
│   │   ├── agent/
│   │   │   ├── types.ts                # MODIFY: Add memory state types
│   │   │   └── memory/                 # NEW: Memory management module
│   │   │       ├── mem0-config.ts      # Mem0 OSS configuration
│   │   │       ├── mem0-service.ts     # Mem0 operations (add, search, getAll)
│   │   │       └── context-builder.ts  # Dynamic context engineering
│   │   └── tools/
│   │       ├── tool-factory.ts         # MODIFY: Add domain intelligence tools
│   │       └── domain-intelligence/    # NEW: Elevated Type 3 tools
│   │           ├── analyze-cash-flow.ts
│   │           ├── evaluate-vendor-risk.ts
│   │           └── forecast-expenses.ts
│   └── mcp/                            # NEW: MCP server module
│       ├── server.ts                   # MCP server entry point
│       ├── resources.ts                # MCP resources (finanseal://)
│       ├── tools.ts                    # MCP tools (wrapping ToolFactory)
│       └── prompts.ts                  # MCP prompt templates
├── domains/
│   ├── analytics/
│   │   └── components/
│   │       └── action-center/          # MODIFY: Smart Action Center
│   │           ├── ActionCenter.tsx    # Enhanced UI
│   │           ├── InsightCard.tsx     # Rich action cards
│   │           └── hooks/
│   │               └── useInsights.ts  # Real-time insight subscription
│   └── chat/
│       └── components/
│           └── ChatInterface.tsx       # MODIFY: Streaming + proactive behavior
├── app/
│   └── api/
│       └── v1/
│           ├── chat/
│           │   └── route.ts            # MODIFY: SSE streaming endpoint
│           └── insights/               # NEW: Action Center API
│               └── route.ts
└── convex/
    ├── schema.ts                       # MODIFY: Add insight/notification tables
    └── functions/
        ├── actionCenterInsights.ts     # NEW: Insight CRUD
        └── agentNotifications.ts       # NEW: Notification queue

# Standalone MCP server (separate process)
mcp-server/                             # NEW: Standalone MCP server
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Entry point
│   └── auth.ts                         # OAuth2 handler
└── README.md
```

**Structure Decision**: Web application with new MCP server as sibling package. Memory handled externally by Mem0 OSS (Qdrant + Neo4j).

## Complexity Tracking

> No Constitution violations identified. All changes follow existing patterns.

| Area | Complexity | Justification |
|------|------------|---------------|
| MCP Server | New package | Required for standalone process that Claude Desktop connects to |
| Memory Module | New directory | Mem0 OSS integration (simpler than custom implementation) |
| Domain Intelligence Tools | New directory | Distinguishes Type 3 tools from existing CRUD tools |
| External Services | Neo4j Aura | Free tier for graph memory relationships |

---

## Phase 0: Research (COMPLETE)

**Output**: [research.md](./research.md)

All technical unknowns resolved:
- ✅ LangGraph streaming API (`astream_events`) patterns documented
- ✅ MCP server architecture (Type 3 Domain Intelligence) confirmed
- ✅ Memory persistence: **Mem0 OSS** with Qdrant (vectors) + Neo4j Aura (graph)
- ✅ Memory LLM: **Gemini 3.0 Flash Preview** for fact extraction
- ✅ SSE integration pattern for Next.js established
- ✅ Action Center detection algorithms designed

---

## Phase 1: Design (COMPLETE)

**Outputs**:
- [data-model.md](./data-model.md) - Entity schemas for 4 new tables
- [contracts/](./contracts/) - API specifications (OpenAPI 3.0)
- [quickstart.md](./quickstart.md) - Implementation guide

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Memory Storage | **Mem0 OSS** + Qdrant (vectors) + Neo4j (graph) | Automatic fact extraction, deduplication, graph relationships |
| Memory LLM | Gemini 3.0 Flash Preview | Fast, cheap fact extraction (separate from agent LLM) |
| Streaming Protocol | Server-Sent Events (SSE) | Native browser support, simpler than WebSocket for uni-directional |
| MCP Server Type | Domain Intelligence (Type 3) | Competitive moat via server-side analysis, not raw data exposure |
| Action Center Updates | Convex scheduled functions (4h) + real-time for critical | Balance freshness/compute; critical alerts bypass batch (<1 min) |
| Memory Retention | 12 months (Mem0 managed) | Automatic via Mem0, no custom cleanup jobs |
| Critical Alert Threshold | >3σ anomalies, large tx, negative balance | Beat competitors with <1 min critical alert delivery |
| Vendor Intelligence | Pattern analysis + risk scoring | Phase 1: spending patterns. Phase 2: negotiation outreach |
| Receipt Requirement | Mandatory for all expense claims | Data quality for AI, audit compliance |

### Constitution Re-Check (Post-Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| Prefer Modification Over Creation | ✅ PASS | 4 files modified, 15 new files in organized structure |
| Build-Fix Loop Mandatory | ✅ PASS | Implementation will use incremental builds |
| Embrace Parallel Execution | ✅ PASS | Phases 1-3 have parallelizable tasks |
| Git Author for Deployments | ✅ PASS | Using grootdev-ai author |
| AWS CDK as Single Source | ✅ PASS | No Lambda changes in this feature |
| Convex Deployment | ✅ PASS | Schema changes require `npx convex deploy` |
| Semantic Design System | ✅ PASS | Action Center UI uses semantic tokens |

---

## Phase 2: Implementation Plan

### Implementation Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Core Infrastructure (Week 1)                                       │
│ ├── Convex schema extensions (actionCenterInsights, notifications, prefs)   │
│ ├── Mem0 OSS setup (mem0-config.ts, mem0-service.ts)                        │
│ └── Neo4j Aura Free instance setup                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Streaming & Context (Week 2)                                       │
│ ├── LangGraph streaming integration (astream_events)                        │
│ ├── SSE API endpoint (/api/v1/chat/stream)                                  │
│ ├── Chat UI streaming support                                               │
│ └── Context builder implementation                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Action Center (Week 3)                                             │
│ ├── Insight detection jobs (anomaly, compliance, deadline, etc.)            │
│ ├── Action Center API endpoints                                             │
│ ├── Enhanced Action Center UI                                               │
│ └── Real-time Convex subscriptions                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Proactive AI (Week 4)                                              │
│ ├── Context injection (memories + insights)                                 │
│ ├── Proactive behavior prompts                                              │
│ ├── remember() and recall() tools                                           │
│ └── Absence summary feature                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phase 5: MCP Server (Week 5)                                                │
│ ├── Standalone server setup (mcp-server/)                                   │
│ ├── OAuth2 authentication                                                   │
│ ├── Domain intelligence tools                                               │
│ └── Resources and prompts                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phase 6: Notifications & Polish (Week 6)                                    │
│ ├── Notification queue implementation                                       │
│ ├── Web push integration                                                    │
│ ├── E2E testing                                                             │
│ └── Performance optimization                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Story → Phase Mapping

| User Story | Priority | Phase | Dependencies |
|------------|----------|-------|--------------|
| US1: Real-time Streaming | P1 | Phase 2 | Phase 1 (schema) |
| US2: Persistent Memory | P1 | Phase 1 + 4 | None |
| US3: Context Management | P2 | Phase 2 | Phase 1 (memory) |
| US4: MCP Server | P2 | Phase 5 | Phase 1-4 |
| US5: Smart Action Center | P1 | Phase 3 | Phase 1 (schema) |
| US6: Proactive AI | P2 | Phase 4 | Phase 1-3 |
| US7: Notifications | P3 | Phase 6 | Phase 3 (insights) |
| **Enhancement: Real-time Critical Alerts** | P1 | Phase 3 | Phase 1 (schema) |
| **Enhancement: Vendor Intelligence** | P1 | Phase 3 | Phase 1 (schema) |
| **Enhancement: Receipt Required** | P1 | Phase 0 (Setup) | None - prerequisite |

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LangGraph streaming compatibility | High | Test with existing agent before full migration |
| Convex subscription performance | Medium | Use pagination and selective subscriptions |
| Memory retrieval latency | Medium | Implement caching layer, optimize Qdrant indices |
| MCP OAuth2 complexity | Medium | Start with simple token auth, iterate to full OAuth |
| Action Center job runtime | Low | Batch processing with pagination |

---

## Phase 3: Tasks (PENDING)

**Next Step**: Generate detailed tasks using `/speckit.tasks`

Tasks will be generated from:
- [quickstart.md](./quickstart.md) - Implementation steps
- [data-model.md](./data-model.md) - Schema implementation tasks
- [contracts/](./contracts/) - API endpoint tasks

---

## Appendix: File Change Summary

### New Files (16)

| File | Purpose |
|------|---------|
| `src/lib/ai/agent/memory/mem0-config.ts` | Mem0 OSS configuration (Qdrant + Neo4j + Gemini) |
| `src/lib/ai/agent/memory/mem0-service.ts` | Mem0 operations (add, search, getAll) |
| `src/lib/ai/agent/memory/context-builder.ts` | Context injection logic |
| `src/lib/ai/tools/domain-intelligence/analyze-cash-flow.ts` | Type 3 tool |
| `src/lib/ai/tools/domain-intelligence/evaluate-vendor-risk.ts` | Type 3 tool (includes vendor intelligence) |
| `src/lib/ai/tools/domain-intelligence/forecast-expenses.ts` | Type 3 tool |
| `src/lib/ai/tools/remember-tool.ts` | Memory creation via Mem0 |
| `src/lib/ai/tools/recall-tool.ts` | Memory retrieval via Mem0 |
| `src/app/api/v1/insights/route.ts` | Action Center API |
| `src/domains/analytics/components/action-center/InsightCard.tsx` | UI component |
| `src/domains/analytics/hooks/useInsights.ts` | Convex subscription hook |
| `convex/functions/actionCenterInsights.ts` | Insight CRUD |
| `convex/functions/agentNotifications.ts` | Notification queue |
| `convex/functions/insights/vendorIntelligence.ts` | **NEW: Vendor pattern analysis + risk scoring** |
| `convex/functions/insights/realTimeAlerts.ts` | **NEW: Real-time critical alert evaluation** |
| `src/domains/analytics/components/action-center/VendorInsightCard.tsx` | **NEW: Vendor intelligence card UI** |

### Modified Files (6)

| File | Changes |
|------|---------|
| `src/lib/ai/langgraph-agent.ts` | Add streaming, memory injection |
| `src/app/api/v1/chat/route.ts` | SSE streaming endpoint |
| `src/domains/analytics/components/action-center/ActionCenter.tsx` | Enhanced UI with vendor intelligence |
| `convex/schema.ts` | Add 3 new tables (insights, notifications, preferences) |
| `convex/functions/expenseClaims.ts` | **NEW: Receipt required validation** |
| `src/domains/expense-claims/components/ExpenseClaimForm.tsx` | **NEW: Receipt required UI enforcement** |

### New Package (1)

| Package | Purpose |
|---------|---------|
| `mcp-server/` | Standalone MCP server for Claude Desktop |

### External Services (2)

| Service | Purpose |
|---------|---------|
| Neo4j Aura Free | Graph memory relationships |
| Mem0 OSS | Memory layer with fact extraction |

---

**Plan Status**: COMPLETE
**Next Action**: Run `/speckit.tasks` to generate implementation tasks
