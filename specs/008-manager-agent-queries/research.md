# Research: Manager Cross-Employee Financial Queries

**Branch**: `008-manager-agent-queries` | **Date**: 2026-02-07

## R1: Date Range Calculation Approach

**Decision**: Extract date parsing from `TransactionLookupTool._calculateDateRange()` into a shared utility module at `src/lib/ai/utils/date-range-resolver.ts`, then use it across all tools (existing and new).

**Rationale**: The existing `_calculateDateRange()` in TransactionLookupTool already handles patterns like "past_60_days", "100 days", "last 2 months", "june_2024", "this_month", "this_year". Rather than duplicating this logic in new tools, extracting it into a shared module means all tools benefit from deterministic date calculation. The key change: inject `new Date()` as a parameter (instead of using Date.now() internally) so it's testable and always uses server time.

**Alternatives considered**:
- DSPy signature for date parsing (Python-only, adds cross-language dependency for a purely deterministic task)
- LLM-based date extraction via Gemini structured output (still relies on LLM inference, violates FR-006)
- Third-party NLP date library like chrono-node (adds dependency for patterns we already handle)

## R2: Employee Name Resolution Strategy

**Decision**: Create a new Convex query `memberships.resolveEmployeeByName` that performs case-insensitive partial matching on `users.fullName` and `users.email` fields, scoped to the manager's direct reports only.

**Rationale**: The codebase stores `fullName` on the users table and `managerId` on business_memberships. The resolution flow is: (1) get manager's direct report user IDs via `managerId` filter on business_memberships, (2) load those users, (3) match input name against `fullName` using case-insensitive substring matching. This handles SEA name patterns (partial matching "Ali" to "Muhammad Ali bin Hassan") without external NLP dependencies.

**Alternatives considered**:
- Fuzzy matching library (fuse.js) — adds dependency for a small dataset (typical team size <20 direct reports)
- Embedding-based name matching — over-engineered for team sizes under 50
- Exact match only — too rigid for SEA naming conventions

## R3: New Tool Architecture (LangGraph vs MCP)

**Decision**: Add 2 new LangGraph tools (Category 1-2) for direct data retrieval, plus 1 new MCP tool (Category 3) for server-side analytics.

**New LangGraph tools**:
1. `get_employee_expenses` — Individual employee expense lookup with vendor/category/date filters. Returns raw data for LLM to present.
2. `get_team_summary` — Aggregate team spending across all direct reports. Returns structured summaries.

**New MCP tool**:
3. `analyze_team_spending` — Server-side analytics: spending trends, category breakdowns, employee comparisons. Domain intelligence computed on Lambda, not by LLM.

**Rationale**: Data retrieval (looking up specific expenses) is Category 1-2 and belongs in the LangGraph tool layer where it can use the authenticated Convex client directly. Analytics (computing trends and comparisons) is Category 3 and belongs in the MCP server where computation is isolated from LLM context.

**Alternatives considered**:
- All tools as MCP server tools (adds network hop for simple lookups, increases latency)
- All tools as LangGraph tools (analytics computation would bloat LLM context)
- Single monolithic tool with `query_type` parameter (violates single-responsibility, harder for LLM to select correct parameters)

## R4: Role-Based Tool Routing

**Decision**: Extend `ToolFactory.getToolSchemas()` to accept a `UserContext` parameter and filter tools based on the user's role from business_memberships.

**Rationale**: The ToolFactory currently returns all tool schemas regardless of user role. The enhancement adds a lookup: fetch the user's membership role, then filter the tool list. Employee role users should never see `get_employee_expenses` or `get_team_summary` (and per FR-005a, employees don't access the AI assistant at all). Managers see team tools scoped to direct reports. Finance admins/owners see all tools.

**Implementation approach**: Add a `getToolSchemasForRole(userContext, modelType)` method that wraps existing `getToolSchemas()` with a role filter. The filter is a simple mapping: `{ manager: [...managerTools], finance_admin: [...allTools], owner: [...allTools] }`.

**Alternatives considered**:
- Dynamic tool registration per session (overly complex, breaks caching)
- Tool-level permission checks only (tools would still appear in LLM schema, causing confusion)

## R5: Structured Output Schemas

**Decision**: Define Zod output schemas for new manager tools only. Validate tool response against schema before returning to LLM. Existing tools remain unchanged per clarification.

**Output schema approach**:
```
EmployeeExpenseResponse {
  summary: { totalAmount, currency, recordCount, dateRange }
  employee: { name, id }
  items: Array<{ date, description, vendor, amount, category }> (max 50)
  truncated: boolean
  truncatedCount: number
}
```

**Rationale**: Zod output schemas provide runtime validation that the tool response has the expected shape before it reaches the LLM. This prevents the LLM from receiving malformed data and generating incorrect responses. Using Zod (already in the project for input validation) avoids adding new dependencies.

**Alternatives considered**:
- DSPy TypePredict signatures (Python-only, not applicable to TypeScript tools)
- JSON Schema validation (Zod can generate this, but direct Zod validation is simpler)
- No output validation (current state — leads to `data: any` type drift)

## R6: Convex Query Design for Cross-Employee Access

**Decision**: Create 3 new Convex query functions in `financialIntelligence.ts` that implement the authorization check server-side.

**New functions**:
1. `getEmployeeExpensesForManager` — Takes managerId + employeeId + filters. Verifies managerId→employeeId relationship via business_memberships before querying accounting_entries.
2. `getTeamExpenseSummary` — Takes managerId + filters. Queries all direct reports' accounting entries and aggregates server-side.
3. `resolveEmployeeByName` — Takes managerId + name query. Returns matching direct reports.

**Query pattern**: Use `by_businessId` index on accounting_entries, then filter in-memory by userId (employee). This is efficient because Convex loads all business entries anyway (no SQL-style JOIN), and the in-memory filter for a specific userId is O(n) on business entries which is acceptable for SME-sized businesses.

**Authorization pattern**: Every query first verifies that the calling user has `manager`/`finance_admin`/`owner` role AND that the target employee is their direct report (or they have business-wide access). This check happens in the Convex function, not in the tool layer.

**Alternatives considered**:
- Client-side filtering (security risk — data leaves Convex before authorization check)
- Separate authorization middleware (adds complexity, Convex functions already have context)

## R7: Audit Logging for Cross-Employee Queries

**Decision**: Add structured audit log entries to the existing CloudWatch logging (MCP server) and Convex-side logging (LangGraph tools) whenever a cross-employee query is executed.

**Log format**:
```json
{
  "event": "cross_employee_query",
  "managerId": "user_123",
  "targetEmployeeId": "user_456",
  "toolName": "get_employee_expenses",
  "queryParams": { "vendor": "Starbucks", "dateRange": "2026-01-01/2026-01-31" },
  "resultCount": 5,
  "timestamp": "2026-02-07T10:00:00Z"
}
```

**Rationale**: FR-015 requires logging all cross-employee queries. Using structured JSON logs to CloudWatch (MCP tools) and console.log (LangGraph tools, captured by Vercel) provides audit trail without adding a new logging infrastructure.

## R8: Vendor Name Matching Strategy

**Decision**: Case-insensitive substring matching using JavaScript `toLowerCase().includes()` on the `vendorName` field from accounting_entries. Aggregate all matching entries regardless of exact vendor name spelling.

**Rationale**: Vendor names in the database are raw text from OCR extraction (e.g., "STARBUCKS COFFEE SDN BHD", "Starbucks", "STARBUCKS COFFEE"). A simple case-insensitive substring match handles the most common variations without external NLP. For the query "starbucks", this matches all variations. The trade-off is potential false positives (e.g., searching "star" would match "Starbucks" and "StarHub"), but this is acceptable since the manager can see the matched items and refine.

**Alternatives considered**:
- Levenshtein distance / fuzzy matching (over-engineered for this use case)
- Vendor normalization table (doesn't exist, would require a data migration)
- Exact match only (too rigid, OCR variations would cause misses)

## R9: Category Mapping Strategy

**Decision**: Create a static mapping file `src/lib/ai/utils/category-mapper.ts` that maps common natural language terms to IFRS category IDs. The LLM can also contribute to mapping via its intent analysis step.

**Mapping examples**:
```
"meals" → ["travel_entertainment"]
"coffee" → ["travel_entertainment"]
"travel" → ["travel_entertainment"]
"office" → ["administrative_expenses"]
"software" → ["software_subscriptions"]
"marketing" → ["marketing_advertising"]
```

**Rationale**: The system has ~15 IFRS categories and ~9 business default categories. A static mapping of ~30-50 common terms to categories covers the vast majority of queries. For edge cases, the LLM's intent analysis can identify the closest category from the system prompt's category list.

**Alternatives considered**:
- Embedding-based category matching (over-engineered for 15 categories)
- LLM-only mapping (no deterministic guarantee, varies across models)
- User-configurable mappings (adds UI complexity for a low-frequency use case)
