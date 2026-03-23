# AI Agent Architecture

## Overview

LangGraph-based chat agent with MCP (Model Context Protocol) as the single source of truth for all tool schemas and execution.

```
User → Chat UI → LangGraph StateGraph → mcp-tool-registry.ts → MCP Lambda → Convex
                  (custom nodes)          (schema + RBAC + exec)   (36 tools)   (data)
```

## Key Files

| File | Purpose |
|------|---------|
| `tools/mcp-tool-registry.ts` | Schema fetch (MCP tools/list), RBAC filter, tool execution (MCP tools/call) |
| `tools/base-tool.ts` | Types only (UserContext, ToolResult, CitationData) — no class |
| `agent/agent-factory.ts` | StateGraph construction + node wiring |
| `agent/nodes/model-node.ts` | LLM invocation — sends OpenAI-format schemas to Gemini |
| `agent/nodes/tool-nodes.ts` | Tool execution via MCP + error handling |
| `agent/nodes/validation-node.ts` | Security gate — blocks unauthenticated tool execution |
| `agent/nodes/intent-node.ts` | Intent classification (regulatory, transaction, etc.) |
| `agent/nodes/guardrail-nodes.ts` | Topic guardrail — blocks off-topic queries |
| `agent/router.ts` | Conditional routing between nodes |
| `agent/config/prompts.ts` | System prompts per role and language |
| `langgraph-agent.ts` | Agent entry point + createAgentState() |

## ADR: Custom LangGraph Nodes (Not Built-in ToolNode)

**Decision**: Use custom `executeTool` and `callModel` nodes instead of LangGraph's built-in `ToolNode` and `ChatModel` bindings.

**Status**: Active (2026-03-23, reaffirmed during 032-mcp-first)

**Context**: LangGraph provides `ToolNode` for automatic tool dispatch and `ChatModel` wrappers for LLM binding. We evaluated migrating to these + `@langchain/mcp-adapters` during the MCP-first migration.

**Decision Drivers**:

1. **RBAC defense-in-depth**: Our agent enforces role-based access at TWO levels:
   - Schema filtering: `getToolSchemasForRole()` removes tools from the LLM's view based on user role
   - Execution-time check: `executeTool()` re-validates role before calling MCP (defense-in-depth)
   - ToolNode has no built-in RBAC — we'd need equivalent middleware

2. **Anti-hallucination guards**: When tools fail, we return structured error messages:
   ```
   TOOL_ERROR: I cannot retrieve the requested information due to: [error]
   **Important**: This is a system error message, not actual data. Do not fabricate information.
   ```
   ToolNode returns raw errors — LLMs often hallucinate data from error messages

3. **Circuit breaker**: After 3 tool failures or 20+ messages, the agent stops looping. ToolNode has no built-in circuit breaker.

4. **Correction loop**: `correctToolCall` node re-prompts the LLM when it produces invalid tool calls (Gemini quirk). Not available in ToolNode.

5. **Raw Gemini API**: We call Gemini via OpenAI-compatible HTTP (not LangChain's `ChatGoogleGenerativeAI`). This gives us precise control over tool_choice, temperature, and message formatting — critical for Gemini's quirks (thought_signature, orphaned tool_calls).

6. **@langchain/mcp-adapters** returns `StructuredTool` instances — our agent needs raw `{ type: "function", function: { name, parameters } }` OpenAI schemas. Using the adapter would require converting back.

**Consequences**:
- ~500 lines of custom node code (vs ~50 lines adapter config + ~200 lines middleware for RBAC/circuit-breaker)
- We maintain the Gemini HTTP integration ourselves
- Full control over security, error handling, and retry behavior
- No dependency on `@langchain/mcp-adapters`

**Alternatives Rejected**:
- `@langchain/mcp-adapters` + ToolNode: Net zero line savings, adds dependency, loses security controls
- `ChatGoogleGenerativeAI`: Risk of breaking prompt behavior, tool calling format differences with Gemini

## ADR: MCP as Single Source of Truth for Tools

**Decision**: All agent tool schemas and execution go through the MCP server. No local tool implementations.

**Status**: Active (2026-03-23, implemented in 032-mcp-first)

**Before**: 30+ `BaseTool` subclasses in `src/lib/ai/tools/` (~7,000 lines) — each tool had local business logic, Convex queries, parameter validation, and schema definitions.

**After**: `mcp-tool-registry.ts` (~300 lines) — fetches schemas from MCP `tools/list` (cached 5 min), filters by role, executes via MCP `tools/call`.

**Benefits**:
- New tool workflow: Add MCP endpoint → register in handler → deploy CDK → done
- Schemas auto-sync (no manual duplication between tool class and MCP)
- Slack bots, API partners, mobile apps can use the same tools
- CloudWatch observability on every tool call
- -7,000 lines of code removed

## RBAC Model

### Role Hierarchy
```
Owner > Finance Admin > Manager > Employee
```

### Tool Access Sets

**MANAGER_TOOLS** (requires manager+):
```
get_employee_expenses, get_team_summary, analyze_trends, set_budget,
check_budget_status, get_late_approvals, compare_team_spending,
analyze_team_spending, forecast_cash_flow, generate_report_pdf,
get_action_center_insight
```

**FINANCE_TOOLS** (requires finance_admin+):
```
get_invoices, get_sales_invoices, detect_anomalies, analyze_vendor_risk,
get_ar_summary, get_ap_aging, get_business_transactions,
run_bank_reconciliation, accept_recon_match, show_recon_status,
send_email_report, compare_to_industry, toggle_benchmarking
```

**Special rule**: `get_transactions` with `transactionType: "Income"/"Revenue"` blocked for employee/manager.

### Enforcement Points
1. `mcp-tool-registry.ts getToolSchemasForRole()` — removes schemas before LLM sees them
2. `mcp-tool-registry.ts executeTool()` — re-checks at execution time (defense-in-depth)
3. `src/lambda/mcp-server/lib/auth.ts hasPermission()` — MCP server validates role

## MCP Tool Registry

### Schema Flow
```
Agent starts → getToolSchemasForRole(userRole)
  → fetchMCPToolSchemas() — HTTP POST to MCP tools/list (cached 5 min)
  → Convert MCP JSON Schema → OpenAI function calling format
  → Filter by MANAGER_TOOLS / FINANCE_TOOLS sets
  → Return to model-node.ts for Gemini API call
```

### Execution Flow
```
LLM returns tool_call → tool-nodes.ts executeTool()
  → mcp-tool-registry.executeTool(toolName, params, userContext)
  → RBAC check (defense-in-depth)
  → HTTP POST to MCP tools/call with _businessId, _userId, _userRole
  → Retry once on transient errors (5xx, timeout)
  → Return ToolResult → LLM generates final answer
```

### Cache
- Schema cache: 5 min TTL, single global cache (all tools from MCP)
- RBAC filtering happens on every call (after cache hit)
