# Data Model: MCP-First Tool Architecture

**Date**: 2026-03-22 | **Branch**: `032-mcp-first`

## Entities

### MCP Tool Registration

Each tool is defined by three artifacts:

1. **Contract** (in `contracts/mcp-tools.ts`):
   - `name`: snake_case identifier (e.g., `get_invoices`)
   - `description`: User-facing description for LLM tool selection
   - `inputSchema`: Zod schema defining accepted parameters
   - Output interface: TypeScript type for successful response

2. **Implementation** (in `tools/{name}.ts`):
   - Async function: `(args, authContext?) => Promise<Output | MCPErrorResponse>`
   - Convex queries for data access
   - Business logic (analysis, formatting, validation)

3. **Handler Registration** (in `handler.ts`):
   - Entry in `TOOL_IMPLEMENTATIONS` map
   - Import statement

### Tool-Factory Wrapper (thin client)

After migration, each tool-factory class contains:
- `getToolName()`: Same name as MCP tool
- `getDescription()`: Same description
- `getToolSchema()`: OpenAI-format schema (derived from MCP Zod schema)
- `executeInternal()`: Single call to `mcpToolWrapper.call(toolName, params, userContext)`

### RBAC Mapping

| Role | Tool-Factory Filtering | MCP Server Validation |
|------|----------------------|----------------------|
| employee | Excludes MANAGER_TOOLS + FINANCE_TOOLS from schema | `_userRole: 'employee'` checked in handler |
| manager | Excludes FINANCE_TOOLS from schema | `_userRole: 'manager'` checked in handler |
| finance_admin | All tools visible | `_userRole: 'finance_admin'` — full access |
| owner | All tools visible | `_userRole: 'owner'` — full access |

### Metrics Extension (dspy_metrics_daily)

Existing table extended with MCP tool names. No schema change needed — `tool` field is already a string that accepts any value. New tool name convention: same as MCP tool name (e.g., `get_invoices`, `memory_store`).

Fields used for MCP tracking:
- `tool`: MCP tool name
- `successCount` / `failureCount`: Execution outcomes
- `sumLatencyMs`: Cumulative latency for averaging
- `sumInputTokens` / `sumOutputTokens`: Token tracking (0 for non-AI tools)

## State Transitions

### Tool Migration Lifecycle

```
tool-factory-only → dual (factory + MCP) → MCP-delegated → MCP-only
```

1. **tool-factory-only**: Current state for 22 tools. Business logic in tool-factory class.
2. **dual**: During migration, MCP tool exists alongside tool-factory. Both work independently.
3. **MCP-delegated**: Tool-factory `executeInternal()` calls MCP instead of local logic. MCP is source of truth.
4. **MCP-only**: Tool-factory class removed or reduced to schema-only for LangGraph compatibility.

### Error Response Flow

```
MCP tool returns error → MCPErrorResponse { error, code, message }
  → Tool-factory wrapper translates → ToolResult { success: false, error: "user-friendly message" }
    → LangGraph formats for chat → User sees: "I couldn't fetch that right now, please try again"
```

Retry logic: wrapper retries once on transient errors (5xx, timeout), then returns error.
