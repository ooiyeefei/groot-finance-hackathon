# Feature Specification: Manager Cross-Employee Financial Queries with Structured AI Agent I/O

**Feature Branch**: `008-manager-agent-queries`
**Created**: 2026-02-07
**Status**: Draft
**Input**: User description: "AI Agent Enhancement for Manager Cross-Employee Financial Queries with DSPy Structured I/O"

## Clarifications

### Session 2026-02-07

- Q: What data should manager queries search — all expense claims or only approved accounting entries? → A: Only approved accounting entries (official financial records).
- Q: What is the role-based access model for the AI assistant? → A: Employees do NOT have AI assistant access. Managers see their assigned employees' + own data (expense claims, leave, accounting entries). Finance admins see ALL business data (invoices, expense claims, leave, accounting entries for all members).
- Q: What is the maximum number of transactions to return in a single query response? → A: Return a summary (total, count) for all matching records plus a detailed list of up to 50 most recent items.
- Q: Should the feature include leave data queries, or focus on financial data only? → A: Financial data only for this feature. Leave queries will be a separate follow-up feature.
- Q: Should structured I/O apply to existing personal query tools too, or only new manager tools? → A: Apply structured date calculation to ALL tools (existing and new). Output schemas apply only to new manager/team query tools.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manager Queries Employee Spending by Vendor (Priority: P1)

A manager opens the AI Assistant and asks a question like "How much did Sarah spend at Starbucks in January 2026?" The system identifies the manager's role, resolves "Sarah" to a direct report, calculates the correct date range for "January 2026", queries approved accounting entries for that employee filtered by vendor name, and returns a structured summary with total amount, transaction count, and line-item breakdown. Only approved/posted financial records are queried — pending or draft expense claims are excluded to ensure financial accuracy.

**Why this priority**: This is the core use case that directly addresses the manager's need for team spending oversight. It exercises every layer of the enhancement: role verification, employee resolution, vendor filtering, date range calculation, and structured response formatting. Without this, no other manager query scenario works.

**Independent Test**: Can be fully tested by a manager user sending a natural language query about a specific employee's vendor spending and verifying the returned data matches the database records.

**Acceptance Scenarios**:

1. **Given** a manager with 3 direct reports, **When** the manager asks "How much did Sarah spend at Starbucks in January 2026?", **Then** the system returns a structured response showing total amount, number of transactions, date range queried, and individual transaction details for that employee and vendor only.
2. **Given** a manager with direct reports, **When** the manager asks about an employee who is NOT their direct report, **Then** the system responds that they can only view data for their direct reports and lists the names of their team members.
3. **Given** a manager with direct reports, **When** the manager asks about a vendor with no matching transactions, **Then** the system responds that no transactions were found for that vendor and employee in the specified period.
4. **Given** a manager with direct reports, **When** the manager types an ambiguous employee name matching multiple team members, **Then** the system asks for clarification by listing the matching names.

---

### User Story 2 - Manager Queries Employee Spending by Category (Priority: P1)

A manager asks "How much did John spend on meals this quarter?" or "What's John's travel expenses in December 2025?" The system resolves the employee, maps the natural language category (e.g., "meals", "travel") to the system's expense categories, calculates the date range, and returns spending totals with category breakdown.

**Why this priority**: Category-based queries are equally fundamental as vendor queries. Managers need to understand spending patterns by expense type (meals, travel, office supplies) for budget oversight and policy enforcement.

**Independent Test**: Can be tested by a manager querying a direct report's spending in a known expense category and verifying amounts match database records.

**Acceptance Scenarios**:

1. **Given** a manager with a direct report who has 5 meal-related expense claims in Q1 2026, **When** the manager asks "How much did John spend on meals in Q1 2026?", **Then** the system returns the total amount, transaction count, and individual claim details for meal-category expenses only.
2. **Given** a manager asking about "coffee expenses", **When** "coffee" does not match an exact system category, **Then** the system maps "coffee" to the most relevant category (e.g., "meals_and_entertainment" or "food_and_beverages") and queries accordingly, noting the category mapping in the response.
3. **Given** a manager querying a category with no expenses, **When** the result is empty, **Then** the system clearly states that no expenses were found in that category for the specified period.

---

### User Story 3 - Manager Queries Aggregate Team Spending (Priority: P2)

A manager asks "What's the total team spending on travel this quarter?" or "Which employee has the highest expense claims this month?" The system aggregates data across all direct reports to provide team-level summaries, rankings, and comparisons.

**Why this priority**: Team-level aggregation builds on the individual employee query capability (P1 stories) and provides the strategic oversight view that managers need for budget decisions. It depends on the per-employee query infrastructure being in place first.

**Independent Test**: Can be tested by a manager asking for team-wide spending summaries and verifying totals match the sum of individual direct report records.

**Acceptance Scenarios**:

1. **Given** a manager with 5 direct reports, **When** the manager asks "What's the total team spending this month?", **Then** the system returns a summary showing total team spending, per-employee breakdown, and top spending categories.
2. **Given** a manager with direct reports, **When** the manager asks "Who spent the most on travel last quarter?", **Then** the system returns a ranked list of direct reports by travel spending with amounts and percentages.
3. **Given** a manager with no direct reports assigned, **When** the manager asks a team spending question, **Then** the system responds that no direct reports are assigned and suggests contacting an administrator.

---

### User Story 4 - Structured Date Range Calculation (Priority: P1)

When any user (manager or employee) asks a question involving a time reference like "January 2026", "last quarter", "this month", or "past 60 days", the system deterministically calculates the exact date range (start and end dates) before passing it to any database query. The date calculation must not rely on the LLM guessing dates.

**Why this priority**: Deterministic date handling is foundational to all query accuracy. If the system hallucinates date boundaries (e.g., treating "January" as Jan 1-30 instead of Jan 1-31), all financial data will be wrong. This is critical for both manager and individual queries.

**Independent Test**: Can be tested by sending queries with various date expressions and verifying the calculated date range matches the expected calendar dates.

**Acceptance Scenarios**:

1. **Given** today is 2026-02-07, **When** a user asks about "January 2026", **Then** the system calculates the date range as 2026-01-01 to 2026-01-31.
2. **Given** today is 2026-02-07, **When** a user asks about "last quarter", **Then** the system calculates the date range as 2025-10-01 to 2025-12-31.
3. **Given** today is 2026-02-07, **When** a user asks about "past 60 days", **Then** the system calculates the date range as 2025-12-09 to 2026-02-07.
4. **Given** a user asks about "this year", **When** the query is processed, **Then** the system calculates the date range as 2026-01-01 to 2026-02-07 (today).

---

### User Story 5 - Structured Response Formatting (Priority: P2)

All financial query responses from the AI assistant follow a consistent, structured format that includes: summary line (total amount + currency), date range queried, number of records found, and a tabular or list breakdown of individual items. The format is enforced by output schemas rather than relying solely on the LLM to format naturally.

**Why this priority**: Consistent formatting prevents the LLM from sometimes showing amounts without currency, omitting date ranges, or presenting data in varying formats. This is essential for manager trust and usability but depends on the core query capability being built first.

**Independent Test**: Can be tested by sending the same query multiple times and verifying the response structure is identical across runs (same fields present, same ordering, same format).

**Acceptance Scenarios**:

1. **Given** a query that returns financial data, **When** the response is generated, **Then** it always includes: a summary line with total and currency, the date range queried, the record count, and individual item details.
2. **Given** a query about employee spending, **When** the response contains multiple transactions, **Then** transactions are presented in chronological order with consistent field ordering (date, description, vendor, amount, category).
3. **Given** a query with zero results, **When** the response is generated, **Then** it follows the same structure with zero totals and an empty items list, rather than a free-form "no results" message.

---

### User Story 6 - Role-Based Tool Access (Priority: P2)

The AI assistant is available only to managers, finance admins, and owners — employees do not have access to the AI assistant. Within the assistant, tool capabilities differ by role: managers see personal query tools plus team-query tools scoped to their direct reports (approved accounting entries and expense claims); finance admins and owners see business-wide query tools covering all employees' financial data (invoices, expense claims, and accounting entries).

**Why this priority**: Without role-based routing, managers might attempt business-wide queries they're not authorized for, or finance admins might miss capabilities they should have. Clear role-to-tool mapping is important for both security and discoverability.

**Independent Test**: Can be tested by logging in as different roles and verifying the AI assistant's tool availability and data scope differs appropriately.

**Acceptance Scenarios**:

1. **Given** a user with "employee" role, **When** they navigate to the AI assistant, **Then** the feature is not available to them (access denied or hidden from navigation).
2. **Given** a user with "manager" role, **When** they ask "How much did I spend on meals?", **Then** the system uses the personal query tools (existing behavior unchanged).
3. **Given** a user with "manager" role, **When** they ask about a direct report's spending, **Then** the system queries only that employee's approved accounting entries and expense claims.
4. **Given** a user with "finance_admin" role, **When** they ask about any employee's spending, **Then** the system can query any employee in the business across all financial data types (invoices, expense claims, accounting entries).
5. **Given** a user with "owner" role, **When** they ask about any employee's data, **Then** the system has the same access as finance admin (all employees, all financial data types).

---

### Edge Cases

- What happens when a manager's direct report list changes mid-conversation (employee transferred to another manager)?
  - The system should use the current direct report list at query time, not cache it for the session.
- What happens when a manager queries a date range that spans a period before an employee joined the company?
  - The system should return data only for the period the employee was active, noting the employee's start date.
- What happens when the employee name is given in a different language or partial form (e.g., "Ali" when the full name is "Muhammad Ali bin Hassan")?
  - The system should perform partial/fuzzy matching and ask for confirmation if multiple matches exist.
- How does the system handle currency conversion when employees submit expenses in different currencies?
  - Amounts should be reported in the business's home currency using the stored `homeCurrencyAmount` field. Original currency amounts should be shown alongside when different.
- What happens when a manager asks about spending on a vendor that has multiple name variations (e.g., "Starbucks", "STARBUCKS COFFEE", "Starbucks Coffee Sdn Bhd")?
  - The system should perform case-insensitive partial matching on vendor names and aggregate all variations.

## Requirements *(mandatory)*

### Functional Requirements

**Manager Query Capabilities**

- **FR-001**: System MUST allow managers to query individual direct reports' approved accounting entries and expense claims by specifying an employee name, vendor name, expense category, and/or date range in natural language. Only approved/posted financial records are included — pending or draft claims are excluded.
- **FR-002**: System MUST restrict manager queries to only their assigned direct reports (as defined by the `managerId` relationship in business memberships). Queries about non-assigned employees MUST be denied with a clear explanation.
- **FR-003**: System MUST allow managers to query aggregate team spending across all direct reports, including totals, rankings, and per-employee breakdowns.
- **FR-004**: System MUST resolve employee references from natural language (first name, last name, partial name, nickname) to specific database user records, requesting clarification when ambiguous.
- **FR-005**: System MUST allow owners and finance admins to query any employee's financial data within their business (not limited to direct reports), including: invoices, expense claims, and accounting entries.
- **FR-005a**: System MUST NOT provide AI assistant access to users with the "employee" role. The AI assistant is available only to managers, finance admins, and owners.

**Date Range Processing**

- **FR-006**: System MUST deterministically calculate date ranges from natural language expressions (e.g., "January 2026" = 2026-01-01 to 2026-01-31, "last quarter" = calculated relative to today's date) using a structured calculation step, not LLM inference alone. This applies to ALL tools (existing personal query tools and new manager tools).
- **FR-007**: System MUST use the server's current date (not a date guessed by the LLM) as the reference point for relative date expressions like "this month", "last quarter", "past 60 days". This applies to ALL tools.

**Structured Input/Output**

- **FR-008**: System MUST use defined input schemas for all tool parameters, validating that required fields (employee identifier, date range, query type) are present and correctly typed before executing any database query.
- **FR-009**: New manager/team query tools MUST use defined output schemas for all responses, ensuring consistent structure (summary, date range, record count, item details) regardless of the query or LLM model used. Existing personal query tools are not required to adopt output schemas in this iteration.
- **FR-010**: New manager/team query tools MUST NOT rely solely on prompt engineering for response formatting. Output structure MUST be enforced by validation schemas that reject malformed responses.
- **FR-010a**: System MUST return a complete summary (total amount, currency, record count) covering ALL matching records, plus a detailed item list of up to 50 most recent entries. If more than 50 records match, the summary reflects the full total while the item list shows the 50 most recent with a note indicating how many additional records exist.

**Vendor and Category Matching**

- **FR-011**: System MUST perform case-insensitive, partial-match vendor name resolution (e.g., "starbucks" matches "STARBUCKS COFFEE SDN BHD") and aggregate spending across all matching vendor name variations.
- **FR-012**: System MUST map natural language category references (e.g., "meals", "coffee", "travel") to the system's expense categories, using the closest match and noting any mapping assumptions in the response.

**Authorization and Security**

- **FR-013**: System MUST verify the requesting user's role and direct-report relationship on every query execution (not cached from session start).
- **FR-014**: System MUST scope all queries to the requesting user's business, preventing cross-business data access.
- **FR-015**: System MUST log all cross-employee queries with the requesting manager's identity, the target employee, and the query parameters for audit purposes.

**Backward Compatibility**

- **FR-016**: Existing individual user query tools (get_transactions, get_vendors, search_documents, etc.) MUST continue to function identically for all users.
- **FR-017**: The AI assistant MUST automatically detect whether a query is about the user's own data or about another employee's data and route to the appropriate tool without the user needing to specify.

**MCP Server Extensions**

- **FR-018**: The MCP server MUST be extended with employee-aware analytics tools that support filtering by employee, vendor, category, and date range for authorized manager queries.
- **FR-019**: MCP server employee-aware tools MUST verify the API key holder's authorization to access the target employee's data before executing.

### Key Entities

- **Manager-Employee Relationship**: Defines which employees a manager can query. Stored as `managerId` field on business membership records. A manager can query data for all employees where `managerId` matches the manager's user ID.
- **Employee Expense Query**: A structured query object containing: target employee identifier, optional vendor filter, optional category filter, date range (start/end dates), and query type (individual or aggregate).
- **Structured Query Response**: A standardized response object containing: summary (total amount, currency, record count covering ALL matches), date range queried, employee name, and an ordered list of up to 50 most recent matching transaction details (date, description, vendor, amount, category). When results exceed 50, the summary still reflects the complete total.
- **Date Range Resolution**: A deterministic mapping from natural language time expressions to concrete start/end date pairs, calculated using the server's current date as reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Managers can ask natural language questions about a specific employee's spending (by vendor, category, or date range) and receive accurate, data-backed answers within a single conversation turn — achieving 95% factual accuracy against database records.
- **SC-002**: Date range calculations are 100% correct for standard expressions (named months, "last quarter", "this year", "past N days") — verified by automated test cases covering all supported patterns.
- **SC-003**: All financial query responses follow the defined structured format (summary, date range, record count, item details) in 100% of cases, with no format drift across different queries or conversation contexts.
- **SC-004**: Manager queries are restricted to direct reports only — with 100% of unauthorized queries (non-direct-reports, cross-business) correctly denied and logged.
- **SC-005**: Employee name resolution handles partial names and ambiguity, successfully resolving 90% of queries without requiring user clarification (based on common name patterns in SEA markets).
- **SC-006**: Vendor name matching aggregates name variations (case, suffixes, abbreviations) correctly in 90% of cases — measured against manually verified vendor groupings.
- **SC-007**: Existing individual user queries (personal transactions, vendor lists, document search) continue to work identically, with zero regression in functionality or response quality.
- **SC-008**: Manager query responses are returned within the same response time envelope as existing personal queries (no more than 2x the current average response time).

## Assumptions

- The existing `managerId` field on `business_memberships` records is reliably populated for all manager-employee relationships. If not populated, the system will treat the manager as having no direct reports.
- Expense category names in the database are sufficiently descriptive to support natural language mapping (e.g., categories like "meals_and_entertainment" can be matched to user terms like "meals" or "food").
- Vendor names stored in accounting entries are the primary source of truth for vendor matching. No separate vendor normalization layer exists, so matching will be done on the raw stored names.
- Manager data scope covers: approved accounting entries and expense claims for their assigned direct reports. Finance admin/owner scope covers all financial data types (invoices, expense claims, accounting entries) for all business members.
- Leave data queries are explicitly out of scope for this feature and will be a separate follow-up.
- The existing LangGraph agent orchestration (topic guardrail, intent analysis, tool execution loop) is sufficient to support the new tools without architectural changes to the agent graph itself.
- MCP server API key permissions can be extended to include employee-query scopes without breaking existing API key consumers.
