# Research: AI Agent RBAC Security Hardening

## Decision 1: Role Propagation Strategy

**Decision**: Set `userContext.role` from `ensureUserProfile()` return value in `base-tool.ts`, and also pass role from API route to agent initialization.

**Rationale**: `ensureUserProfile()` already resolves the user's business membership and returns `role`. The fix is a single line addition (`userContext.role = userProfile.role`) in base-tool.ts:111. Additionally, pass role during agent init so `getToolSchemasForRole()` works correctly before any tool execution.

**Alternatives considered**:
- Resolve role in API route only → rejected because base-tool.ts re-resolves profile anyway, and both layers should set role for defense-in-depth.
- Cache role in session → rejected per CLAUDE.md rule: resolve from DB on every request (FR-018).

## Decision 2: Tool Access Tier Architecture

**Decision**: Use 3 static `Set<ToolName>` constants in `ToolFactory` — `FINANCE_TOOLS`, `MANAGER_TOOLS`, `PERSONAL_TOOLS` (implicit: everything not in the other two).

**Rationale**: The existing code already has `MANAGER_TOOLS` set. Extending to 3 tiers is minimal change. `getToolSchemasForRole()` already accepts `userRole` param — just need to expand the filtering logic.

**Tier mapping**:
- Personal (all roles): get_transactions, search_documents, get_vendors, searchRegulatoryKnowledgeBase
- Manager+ (manager, finance_admin, owner): + get_employee_expenses, get_team_summary, get_action_center_insight
- Finance (finance_admin, owner only): + get_invoices, get_sales_invoices, analyze_cash_flow, detect_anomalies, analyze_vendor_risk, search_invoices, get_ar_summary, get_ap_aging, get_business_transactions

## Decision 3: BusinessId Validation Approach

**Decision**: In the API route, after resolving businessId, query Convex `business_memberships` to verify the user has an active membership for that business before proceeding.

**Rationale**: The `ensureUserProfile()` function already queries memberships. We can add a lightweight check: if `requestBody.businessId` is provided AND differs from `userData.business_id`, verify membership exists. This prevents injection while avoiding extra DB calls for the common case (no override).

**Alternatives considered**:
- Always query membership regardless → rejected, wastes bandwidth on the 99% case where body.businessId matches profile.
- Trust frontend completely → rejected, security violation.

## Decision 4: New Tool Implementation Pattern

**Decision**: Enhance existing `get_invoices` with search parameters (FR-011/012), and create 3 new standalone tools for AR summary, AP aging, and business-wide transactions. All new Convex queries use `action` + `internalQuery` pattern per bandwidth rules.

**Rationale**:
- `get_invoices` already exists and works — adding vendor/date/amount/invoiceNumber params is a natural extension rather than a separate tool.
- AR summary, AP aging, and business-wide transactions are fundamentally different query patterns that deserve dedicated tools.
- Using `action` + `internalQuery` prevents reactive subscription bandwidth burn (CLAUDE.md critical rule).

## Decision 5: Action Center Insight Scoping

**Decision**: Modify the `get_action_center_insight` backend query to accept `requestingUserId` and `role`. For managers, filter duplicate/overdue results to only include items involving their direct reports. For finance_admin/owner, return business-wide results.

**Rationale**: The existing `resolveEmployeeByName` and `getTeamExpenseSummary` functions already implement the `managerId → direct reports` scoping pattern. Apply the same pattern to action center insights.

## Decision 6: Clarification Logic Fix

**Decision**: In `intent-node.ts`, replace the blanket `personal_data → skip clarification` override with a more nuanced check: skip clarification only when the query is about the user's OWN data (contains "my", "I", "me"). For cross-employee queries (contains employee names, "team", "someone"), allow clarification to proceed.

**Rationale**: The current override (line 52-56) was designed to prevent unnecessary clarification for simple personal queries, but it inadvertently blocks clarification for manager queries about team data. The fix preserves the original intent while enabling clarification for cross-employee contexts.

## Decision 7: System Prompt Role Injection

**Decision**: Add a `## YOUR ROLE & PERMISSIONS` section to the system prompt in `prompts.ts`, populated dynamically based on `userContext.role`. Include explicit capability lists and forbidden actions for each role.

**Rationale**: The LLM needs to know the user's role to proactively refuse unauthorized queries. By including explicit permission lists in the prompt, the LLM can refuse before attempting a tool call — providing a better UX than a tool-level error.

## Decision 8: UX for Denial Messages & New Tool Output

**Decision**: All role-based denials use friendly, conversational text with a suggestion of what the user CAN do. New tool outputs (AR summary, AP aging, etc.) emit structured action cards matching existing patterns (cash_flow_dashboard, spending_chart, invoice_posting) for rich interactive rendering in the CopilotKit UI.

**Rationale**: The chat agent already renders action cards as interactive dashboard components (not raw JSON/markdown). New tools must follow the same pattern — emit action card JSON blocks that the frontend renders as visual cards with totals, breakdowns, and status indicators.

**New action card types**:
- `ar_aging_dashboard` — AR aging buckets, customer breakdown, overdue alerts
- `ap_aging_dashboard` — AP aging buckets, vendor breakdown, upcoming dues
- `invoice_detail` — Single invoice with line items table
