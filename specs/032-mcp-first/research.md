# Research: MCP-First Tool Architecture

**Date**: 2026-03-22 | **Branch**: `032-mcp-first`

## Decision 1: Tool Migration Pattern

**Decision**: Each tool-factory tool migrates to an MCP server function following the existing pattern: one file per tool in `src/lambda/mcp-server/tools/`, Zod input schema + TypeScript output interface in `contracts/mcp-tools.ts`, registered in `handler.ts::TOOL_IMPLEMENTATIONS`.

**Rationale**: 12 tools already follow this exact pattern. Consistency reduces migration risk. The handler's `TOOL_IMPLEMENTATIONS` registry is a simple key→function map — adding a tool is one import + one line.

**Alternatives considered**:
- Dynamic tool loading (auto-discover files) — rejected: adds complexity, harder to debug, marginal benefit for 34 tools
- Separate Lambda per tool — rejected: cold start multiplication, 22x Lambda cost, operational nightmare

## Decision 2: Tool-Factory Wrapper Approach

**Decision**: Create a generic `mcp-tool-wrapper.ts` helper that tool-factory tools delegate to. Each existing tool class's `executeInternal()` is replaced with a single `callMCPTool()` call. The wrapper handles: MCP client call → retry once on failure → translate MCPErrorResponse to ToolResult format → return.

**Rationale**: The tool-factory `BaseTool` interface expects `ToolResult { success, data, error }` but MCP returns `OutputType | MCPErrorResponse { error, code, message }`. A shared wrapper handles this translation once, not 22 times.

**Alternatives considered**:
- Rewrite tool-factory entirely — rejected: too risky for Phase 2, better to delegate incrementally
- Use Convex `mcpClient.ts` directly from tool-factory — rejected: tool-factory runs in Next.js/Vercel, not Convex; needs direct HTTP call to MCP Lambda

## Decision 3: MCP Client for Chat Agent (Next.js → Lambda)

**Decision**: The chat agent (running in Vercel/Next.js) calls the MCP server via the same HTTP endpoint used by Convex, but using the internal service key auth pattern (`X-Internal-Key` header + `_businessId` + `_userId` + `_userRole` in params).

**Rationale**: The MCP handler already supports internal service key auth (lines 177-180 in handler.ts). The chat agent has access to the user's role from Clerk/LangGraph context. No new auth pattern needed.

**Alternatives considered**:
- Vercel OIDC → IAM → Lambda invoke — rejected: adds IAM complexity, CLAUDE.md says use internal service key for Convex→MCP pattern
- API key per user — rejected: overkill for internal service calls, API keys are for external consumers

## Decision 4: RBAC Enforcement Strategy

**Decision**: Dual enforcement — tool-factory filters tool visibility by role (which tools appear in the schema), MCP server validates authorization on each call (via `_userRole` param for internal calls, API key permissions for external calls).

**Rationale**: Defense in depth. The tool-factory prevents the LLM from even seeing tools the user can't use (reducing hallucinated tool calls). The MCP server enforces authorization as a safety net for all consumers.

**Alternatives considered**:
- MCP-only RBAC (remove tool-factory filtering) — rejected: LLM would see all tools and attempt unauthorized calls, degrading UX
- Tool-factory-only RBAC — rejected: external consumers (Slack, API) bypass tool-factory

## Decision 5: Memory Tool Latency

**Decision**: Memory tools (`memory_store`, `memory_search`, `memory_recall`, `memory_forget`) are migrated to MCP but the MCP Lambda makes direct calls to Mem0/Qdrant APIs. The added latency (~50-100ms for Lambda hop) is acceptable given current <100ms target becomes <200ms, and memory operations are not on the critical chat response path.

**Rationale**: Memory recall happens before generation (auto-recall), not during streaming. The user doesn't wait for memory operations to see the chat response. The 50-100ms overhead is invisible.

**Alternatives considered**:
- Keep memory tools in tool-factory permanently — rejected: breaks single-source-of-truth goal
- Run memory tools at edge (Vercel) — rejected: Qdrant/Mem0 API keys would need to be in Vercel env

## Decision 6: Observability Implementation

**Decision**: Reuse existing `logger.ts` in MCP server for structured logging (tool name, latency, success/error, consumer, businessId). Add 3 CloudWatch alarms to `mcp-server-stack.ts` (error rate, P99 latency, 5XX API Gateway). Extend `dspy_metrics_daily` table with MCP tool execution records. Dashboard deferred.

**Rationale**: All infrastructure exists. Logger is ready, alarm pattern is in scheduled-intelligence-stack, metrics table accepts any tool name string. Estimated effort: ~30 min CDK + ~15 min Convex schema.

**Alternatives considered**:
- Full distributed tracing + dashboard — rejected as over-engineering at current scale
- No observability — rejected: MCP becomes critical path, need alerts on failures

## Decision 7: Migration Batch Composition

**Decision**: 4 domain-based batches for Phase 2 migration:

| Batch | Tools | Count |
|-------|-------|-------|
| Finance/AP/AR | get_invoices, get_sales_invoices, get_transactions, get_vendors, search_documents, searchRegulatoryKnowledgeBase, get_ar_summary, get_ap_aging, get_business_transactions | 9 |
| Team/Manager | get_employee_expenses, get_team_summary, get_late_approvals, compare_team_spending | 4 |
| Memory | memory_store, memory_search, memory_recall, memory_forget | 4 |
| Misc | create_expense_from_receipt, get_action_center_insight, analyze_trends, set_budget, check_budget_status | 5 |

**Rationale**: Domain grouping allows testing complete user workflows after each batch (e.g., "show me AP aging" exercises get_invoices + get_ap_aging together).
