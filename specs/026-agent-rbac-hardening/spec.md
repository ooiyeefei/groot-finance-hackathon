# Feature Specification: AI Agent RBAC Security Hardening & Intelligence Gaps

**Feature Branch**: `026-agent-rbac-hardening`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Comprehensive security hardening and capability expansion of the Groot Finance AI chat agent — RBAC enforcement on finance-sensitive tools, functional gaps in query capabilities, and intelligence improvements for smart clarification and routing."

## Clarifications

### Session 2026-03-18

- Q: Should managers see all 3 action center insight types (duplicates, approvals_pending, overdue), or only a subset? → A: Managers see all 3 insight types but scoped to their direct reports only. Duplicate detection shows only expense duplicates involving the manager's assigned employees (not invoice duplicates or other teams' expenses). Overdue insights are also scoped to direct reports. Finance admin/owner see all insight types business-wide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Employee Cannot Access Finance-Sensitive Data (Priority: P1)

An employee (basic role) uses the AI chat agent. They ask questions like "What's our cash flow runway?" or "Show me all invoices." The agent recognizes that the employee's role does not have permission to access finance-level tools and responds with a clear, friendly denial message — without calling the tool or leaking any financial data.

**Why this priority**: This is a critical security vulnerability. Currently any authenticated user can access all 12 tools regardless of role, exposing confidential business financial data (cash flow, invoices, vendor risk) to employees who should only see their own expense data.

**Independent Test**: Log in as an employee-role user, ask the AI agent for cash flow analysis, AP invoices, AR invoices, anomaly detection, or vendor risk. Verify that the agent refuses each request with a clear message and never returns financial data.

**Acceptance Scenarios**:

1. **Given** a user with employee role is chatting with the AI agent, **When** they ask "What's our cash flow runway?", **Then** the agent responds with a friendly permission denial and does NOT call the `analyze_cash_flow` tool.
2. **Given** a user with employee role, **When** they ask "Show me all invoices", **Then** the agent refuses access to both AP and AR invoice tools and suggests they ask about their own expenses instead.
3. **Given** a user with employee role, **When** they ask "Any suspicious transactions?", **Then** the agent refuses the anomaly detection tool and responds with a permission denial.
4. **Given** a user with employee role, **When** they ask "Show me my expenses this month", **Then** the agent successfully calls `get_transactions` and returns their personal expense data (employee CAN access their own data).

---

### User Story 2 — Role Propagation and Tool Schema Filtering (Priority: P1)

The system correctly resolves the user's role from their business membership and propagates it through the entire agent pipeline — from API route to tool factory to system prompt. The tool schemas presented to the LLM are filtered by role, so the LLM never even "sees" tools it cannot use.

**Why this priority**: The root cause of all security gaps — role is not propagated to `userContext`, causing `getToolSchemasForRole()` to return all tools. Without this fix, all other RBAC enforcement is bypassed.

**Independent Test**: Verify by inspecting logs that (1) role is set on userContext after profile enrichment, (2) tool schemas returned for employee exclude finance/manager tools, (3) tool schemas for manager include team tools but exclude finance tools, (4) finance_admin/owner get all tools.

**Acceptance Scenarios**:

1. **Given** a user with employee role, **When** the agent initializes tool schemas, **Then** only personal data tools are included: `get_transactions`, `search_documents`, `get_vendors`, `searchRegulatoryKnowledgeBase`.
2. **Given** a user with manager role, **When** the agent initializes tool schemas, **Then** personal data tools PLUS manager tools are included: `get_employee_expenses`, `get_team_summary`, `get_action_center_insight`.
3. **Given** a user with finance_admin or owner role, **When** the agent initializes tool schemas, **Then** ALL tools are included (personal + manager + finance + new tools).
4. **Given** any role, **When** `userContext` is enriched in the base tool pipeline, **Then** `userContext.role` is always set (never undefined).

---

### User Story 3 — BusinessId Validation (Priority: P1)

When the API route receives a chat request, it validates that the `businessId` in the request body matches a business where the authenticated user has an active membership. If the businessId doesn't match any of the user's memberships, the request is rejected.

**Why this priority**: Without this validation, a user could inject a different business's ID in the request body to access another company's financial data through the AI agent.

**Independent Test**: Send a chat API request with a valid auth token but a businessId belonging to a different business. Verify the request is rejected with a 403 error.

**Acceptance Scenarios**:

1. **Given** a user with membership in Business A only, **When** they send a chat request with Business B's ID, **Then** the API returns a 403 Forbidden error.
2. **Given** a user with membership in both Business A and Business B, **When** they send a chat request with Business A's ID, **Then** the request proceeds normally with Business A's context.
3. **Given** a user sends a chat request without a businessId, **When** the API resolves the default, **Then** it uses the user's current active business from their profile.

---

### User Story 4 — Role-Aware System Prompt (Priority: P2)

The system prompt injected into the LLM includes the user's role and explicit instructions about what they can and cannot access. This causes the LLM to proactively refuse unauthorized queries before even attempting a tool call, and to tailor its suggestions to the user's permission level.

**Why this priority**: Even with tool schema filtering, the LLM should understand the user's role to give contextually appropriate responses, suggestions, and refusals — rather than attempting a tool call and getting a permission error.

**Independent Test**: Review the system prompt for each role and verify it includes role-specific instructions. Test that the LLM mentions the user's capabilities in follow-up suggestions.

**Acceptance Scenarios**:

1. **Given** an employee user, **When** the system prompt is generated, **Then** it includes instructions about the employee's limited scope (own expenses, documents, vendors, regulatory knowledge only).
2. **Given** a manager user, **When** the system prompt is generated, **Then** it includes instructions about team oversight capabilities (direct reports' expenses, team summary) plus personal data access.
3. **Given** a finance_admin user, **When** the system prompt is generated, **Then** it includes instructions about full financial access (invoices, cash flow, anomalies, vendor risk, business-wide data).
4. **Given** an employee asks a finance-level question, **When** the LLM processes the query, **Then** it responds with a friendly refusal WITHOUT attempting a tool call.

---

### User Story 5 — Smart Clarification for Manager Queries (Priority: P2)

When a manager asks about team spending without specifying enough context, the agent intelligently decides whether to ask for clarification or use a broader tool. If the question implies a team-level report (e.g., "How much did the team spend on client meals?"), it routes to the team summary tool. If it implies an individual query but lacks a name (e.g., "How much did someone claim for meals?"), it asks which employee.

**Why this priority**: Currently clarification is skipped for ALL personal_data queries, causing manager queries to fail when they require employee name resolution. This directly impacts the manager's ability to use the AI agent for team oversight.

**Independent Test**: As a manager, ask variations of team and individual expense queries and verify the agent routes correctly or asks for the right clarification.

**Acceptance Scenarios**:

1. **Given** a manager asks "How much did the team claim for client meals last month?", **When** the agent processes this, **Then** it calls `get_team_summary` with category filter for "meals" and date range for last month — no clarification asked.
2. **Given** a manager asks "How much did Kate claim for client meals last month?", **When** the agent processes this, **Then** it calls `get_employee_expenses` with employee_name="Kate", category="meals", and last month date range.
3. **Given** a manager asks "How much did someone claim for meals?", **When** the agent processes this, **Then** it asks "Which team member would you like me to look up? Or would you prefer a team-wide summary?"
4. **Given** a manager asks "How much did the team spend at Starbucks this quarter?", **When** the agent processes this, **Then** it calls `get_team_summary` with vendor filter for "Starbucks" and current quarter date range.

---

### User Story 6 — AP Invoice Search for Finance Admins (Priority: P2)

Finance admins and owners can search AP (purchase) invoices by vendor name, date range, amount range, and invoice number. They can also drill into a specific invoice to see line items with descriptions, quantities, and unit prices.

**Why this priority**: Finance admins need to answer questions like "How much did we buy from Vendor X this quarter?" or "Show me the line items for invoice INV-001" — currently impossible because `get_invoices` only returns a flat list with no filters.

**Independent Test**: As a finance admin, ask the agent about specific vendor invoices, filter by date, and request line item details for a specific invoice.

**Acceptance Scenarios**:

1. **Given** a finance admin asks "Show me invoices from ABC Supplier this quarter", **When** the agent processes this, **Then** it calls the invoice search tool with vendor="ABC Supplier" and date range for current quarter, returning matching invoices.
2. **Given** a finance admin asks "Show line items for invoice INV-2026-001", **When** the agent processes this, **Then** it returns the invoice details including each line item's description, quantity, unit price, and total.
3. **Given** a finance admin asks "How much did we spend on supplies in February?", **When** the agent processes this, **Then** it searches AP invoices for February with relevant category/description matching.
4. **Given** an employee asks for invoice details, **When** the agent processes this, **Then** the tool is not available and the agent refuses access.

---

### User Story 7 — AR Summary and Revenue Reporting (Priority: P2)

Finance admins and owners can ask the agent about accounts receivable: total revenue for a period, overdue invoice aging breakdown, customer-level outstanding balances, and collection status.

**Why this priority**: Finance admins frequently need AR visibility for cash management — "What's our total revenue this month?", "Which customers are overdue?", "Show me aging analysis." Currently the agent can only list individual sales invoices without aggregation.

**Independent Test**: As a finance admin, ask about revenue, overdue customers, and aging. Verify aggregated data is returned with proper breakdowns.

**Acceptance Scenarios**:

1. **Given** a finance admin asks "What's our total revenue this month?", **When** the agent processes this, **Then** it returns total revenue for the current month from sales invoices, broken down by status (paid, sent, overdue).
2. **Given** a finance admin asks "Which customers are overdue?", **When** the agent processes this, **Then** it returns a list of customers with overdue invoices, sorted by amount outstanding, with days overdue for each.
3. **Given** a finance admin asks "Show me AR aging", **When** the agent processes this, **Then** it returns an aging breakdown: current, 1-30 days, 31-60 days, 61-90 days, 90+ days — with totals for each bucket.

---

### User Story 8 — AP Aging and Vendor Balance Reporting (Priority: P2)

Finance admins and owners can ask the agent about accounts payable balances: how much is owed to suppliers, AP aging breakdown, vendor-level outstanding amounts, and upcoming payment deadlines.

**Why this priority**: "How much do we owe suppliers?" is a fundamental finance question. The invoices table already tracks payment status but there's no AI tool to aggregate this data.

**Independent Test**: As a finance admin, ask about AP balances, vendor-level owing, and aging. Verify correct aggregation from the invoices table.

**Acceptance Scenarios**:

1. **Given** a finance admin asks "How much do we owe suppliers?", **When** the agent processes this, **Then** it returns total AP outstanding with a vendor-by-vendor breakdown.
2. **Given** a finance admin asks "Show me AP aging", **When** the agent processes this, **Then** it returns aging buckets (current, 1-30, 31-60, 61-90, 90+ days) with totals.
3. **Given** a finance admin asks "What's due this week?", **When** the agent processes this, **Then** it returns invoices with due dates in the current week, sorted by due date.

---

### User Story 9 — Business-Wide Transaction Query for Admins (Priority: P2)

Finance admins and owners can query all business transactions (not just their own). When a finance admin asks "Show me all office supply expenses this month," they see transactions from ALL employees across the business — not just their personal transactions.

**Why this priority**: The existing `get_transactions` tool is personal-scoped (filtered by the current user's context). Finance admins need business-wide visibility for reporting, auditing, and analysis.

**Independent Test**: As a finance admin, ask "Show all business expenses this month" and verify transactions from multiple employees are returned. As an employee, verify the same query only returns personal data.

**Acceptance Scenarios**:

1. **Given** a finance admin asks "Show me all office supply expenses this month", **When** the agent processes this, **Then** it returns transactions from ALL employees in the business matching "office supplies" category for the current month.
2. **Given** a finance admin asks "What's the total business spending this quarter?", **When** the agent processes this, **Then** it returns aggregate spending across all business transactions.
3. **Given** an employee asks the same question, **When** the agent processes this, **Then** the business-wide tool is unavailable and only personal `get_transactions` runs.

---

### User Story 10 — Team Summary Vendor Filtering (Priority: P3)

The team summary tool supports vendor filtering so managers can ask "How much did the team spend at Starbucks this month?" and get an aggregate answer grouped by employee, without needing to query each employee individually.

**Why this priority**: Currently `get_team_summary` can filter by category and group by vendor, but cannot filter by a specific vendor. This is a common manager question.

**Independent Test**: As a manager, ask "How much did the team spend at Starbucks this quarter?" and verify the response shows per-employee breakdown filtered to Starbucks transactions only.

**Acceptance Scenarios**:

1. **Given** a manager asks "How much did the team spend at Starbucks this month?", **When** the agent processes this, **Then** `get_team_summary` is called with vendor="Starbucks" and returns per-employee spending at Starbucks.
2. **Given** a manager asks "Team spending at Grab last quarter", **When** the agent processes this, **Then** the tool filters to "Grab" vendor transactions for last quarter.

---

### User Story 11 — Multi-Business Session Consistency (Priority: P3)

When a user switches their active business in the UI, subsequent AI chat interactions reflect the new business context. The agent does not retain stale businessId from a previous business, preventing data leakage between businesses where the user may have different roles.

**Why this priority**: A user could be an employee in Business A and an owner in Business B. If the chat session retains Business A's ID after switching, the user might get employee-level permissions when they should have owner-level permissions (or vice versa).

**Independent Test**: Switch businesses in the UI, then ask the AI agent a question. Verify the agent uses the new business context and the correct role for that business.

**Acceptance Scenarios**:

1. **Given** a user is chatting in Business A (employee role), **When** they switch to Business B (owner role) and ask a new question, **Then** the agent uses Business B's context and owner permissions.
2. **Given** a user switches businesses, **When** they ask about cash flow, **Then** the agent's role-based access reflects the NEW business's role.

---

### Edge Cases

- What happens when a user has no active business membership (e.g., membership was deactivated)?
  - Agent should return "Unable to process your request — no active business found. Please contact your administrator."
- What happens when a manager has zero direct reports?
  - Team summary and employee expense tools should return "You have no direct reports assigned. Contact your administrator to set up your team."
- What happens when the LLM generates a tool call for a tool that was filtered out of its schemas?
  - The tool factory should reject the call with "Tool not available for your role" before any data access occurs.
- What happens when a user's role changes mid-session (e.g., promoted from employee to manager)?
  - The next API call should re-resolve the role from the database. Stale role in the current session is acceptable; it refreshes on the next request.
- What happens when a finance admin queries an empty business (no transactions, no invoices)?
  - Tools should return "No data found for the selected period" — not an error.
- What happens when a manager asks about an employee in a different business?
  - The name resolution should only search within the current business. Cross-business employee lookup must be impossible.

## Requirements *(mandatory)*

### Functional Requirements

**Security Layer (P1)**

- **FR-001**: System MUST propagate the user's role from the profile resolution step to `userContext.role` in the base tool execution pipeline, ensuring it is never undefined.
- **FR-002**: System MUST filter tool schemas by role using a tiered access model:
  - **All roles**: `get_transactions`, `search_documents`, `get_vendors`, `searchRegulatoryKnowledgeBase`
  - **Manager+**: adds `get_employee_expenses`, `get_team_summary`, `get_action_center_insight` (scoped to direct reports — see FR-019)
  - **Finance admin/Owner**: adds all remaining tools (invoices, cash flow, anomalies, vendor risk, new tools) with business-wide scope
- **FR-003**: System MUST validate that the `businessId` in the chat API request matches a business where the authenticated user has an active membership, rejecting mismatched requests with a 403 error.
- **FR-004**: System MUST include role-based context in the LLM system prompt, instructing it to refuse unauthorized queries proactively and suggest appropriate alternatives.
- **FR-005**: System MUST enforce role-based access at the tool execution level as a defense-in-depth measure — even if a tool call somehow bypasses schema filtering, the tool itself must reject unauthorized users.
- **FR-006**: System MUST log all role-based access denials for security audit purposes, including the requesting user, attempted tool, and their role.

**Clarification & Routing (P2)**

- **FR-007**: System MUST distinguish between "personal data" queries (user asking about their own data) and "cross-employee" queries (manager asking about someone else) and only skip clarification for personal data.
- **FR-008**: System MUST recognize team-level query patterns (e.g., "team spending", "everyone's expenses", "how much did the team") and route to `get_team_summary` without requiring an employee name.
- **FR-009**: System MUST ask for clarification when a manager query implies a specific employee but doesn't name one (e.g., "How much did someone claim?").
- **FR-010**: System MUST offer the choice between individual lookup and team summary when the query is ambiguous.

**New Tools (P2)**

- **FR-011**: System MUST provide an AP invoice search tool allowing finance admins to filter by vendor name, date range, amount range, and invoice number.
- **FR-012**: System MUST provide a single-invoice detail tool that returns complete line items (description, quantity, unit price, total) for a specific invoice identified by invoice number.
- **FR-013**: System MUST provide an AR summary tool that aggregates sales invoice data by status, customer, and aging bucket (current, 1-30, 31-60, 61-90, 90+ days).
- **FR-014**: System MUST provide an AP aging tool that aggregates purchase invoice data by vendor and aging bucket, showing outstanding balances and upcoming due dates.
- **FR-015**: System MUST provide a business-wide transaction query tool that returns transactions across all employees, available only to finance_admin and owner roles.

**Team Summary Enhancement (P3)**

- **FR-016**: The team summary tool MUST support vendor name filtering in addition to existing category and group_by parameters.
- **FR-017**: System MUST intelligently route vendor-specific team queries (e.g., "team spending at Starbucks") to the team summary tool with vendor filter.

**Action Center Insight Scoping (P2)**

- **FR-019**: The `get_action_center_insight` tool MUST scope results by the requesting user's role:
  - **Manager**: All 3 insight types (duplicates, approvals_pending, overdue) but filtered to only the manager's direct reports. Duplicate detection shows only expense duplicates involving assigned employees — not invoice duplicates or other teams' expenses. Overdue insights are also scoped to direct reports' submissions.
  - **Finance admin/Owner**: All 3 insight types with business-wide scope (all employees, all invoices, all expense types).

**Multi-Business Consistency (P3)**

- **FR-018**: System MUST resolve the user's role from their current active business membership on every chat API request, not from cached or stale session data.

### Key Entities

- **UserContext**: The authenticated user's identity, role, and business context that flows through the entire agent pipeline. Key attributes: userId, convexUserId, businessId, role, homeCurrency.
- **ToolAccessTier**: A classification of tools by the minimum role required to access them. Three tiers: personal (all roles), manager (manager+), finance (finance_admin/owner only).
- **RoleCapabilities**: A role-to-permission mapping that determines which tools, data scopes, and query types each role can access.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero unauthorized data access — employee-role users cannot retrieve any data from finance-restricted tools (cash flow, invoices, anomalies, vendor risk) in any test scenario.
- **SC-002**: Role propagation is 100% reliable — `userContext.role` is never undefined across all API calls, verified by audit logs.
- **SC-003**: BusinessId injection is blocked — requests with mismatched businessId return 403 in 100% of test cases.
- **SC-004**: Manager team queries succeed on first attempt at least 80% of the time (correct tool routing without unnecessary clarification or wrong tool selection).
- **SC-005**: Finance admin invoice search returns relevant results for vendor/date/amount queries with less than 2 seconds response time.
- **SC-006**: AR and AP aging reports produce correct aging bucket totals that match manual calculation from the underlying data.
- **SC-007**: Business-wide transaction queries return data from all employees (not just the requesting user) when executed by finance_admin or owner roles.
- **SC-008**: The LLM proactively refuses unauthorized queries (based on system prompt role context) without attempting a tool call, in at least 90% of test scenarios.
- **SC-009**: All existing agent functionality continues to work — no regression in personal transaction queries, regulatory knowledge lookups, or document search.

## Assumptions

- The existing `business_memberships` table in Convex accurately reflects each user's role within each business and is the authoritative source for role resolution.
- The `managerId` field on business memberships correctly represents the manager-to-direct-report relationship and is maintained by administrators.
- The Convex `invoices` table has `paidAmount`, `paymentStatus`, `dueDate`, and `paymentHistory` fields available for AP aging calculations.
- The Convex `sales_invoices` table has `status`, `dueDate`, `total`, `outstandingBalance`, and `clientName` fields available for AR aging calculations.
- The existing Qwen3-8B model has sufficient reasoning capability to correctly interpret role-based system prompt instructions and refuse unauthorized queries.
- The four roles (employee, manager, finance_admin, owner) represent the complete set of roles in the system; no additional roles need to be supported.
