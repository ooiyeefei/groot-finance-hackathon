# UAT Test Cases: Manager Cross-Employee Financial Queries

**Feature Branch**: `008-manager-agent-queries`
**Date**: 2026-02-07
**Spec**: `specs/008-manager-agent-queries/spec.md`

## Prerequisites

- Deployed to staging/production (Convex + CDK Lambda)
- Test users with the following roles in the same business:
  - **Manager** (role: `manager`) with 2+ assigned direct reports
  - **Finance Admin** (role: `finance_admin`)
  - **Owner** (role: `owner`)
- Test data: Direct reports must have approved expense claims and accounting entries with:
  - Known vendor names (e.g., Starbucks, Grab, McDonald's)
  - Known categories (e.g., meals, travel, office supplies)
  - Known date ranges (e.g., January 2026, Q4 2025)
  - Known total amounts (verified against database)

---

## Section 1: Manager Employee Expense Queries (US1 - P1)

### TC-001: Manager queries employee spending by vendor

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct report "Sarah" with 3 Starbucks transactions in January 2026 totaling SGD 45.00 |
| **Input** | "How much did Sarah spend at Starbucks in January 2026?" |
| **Expected** | Response includes: total amount (SGD 45.00), record count (3), date range (2026-01-01 to 2026-01-31), and individual transaction list |
| **Verify** | Amounts match database records exactly. Only approved/posted records shown. |
| **Pass/Fail** | |

### TC-002: Manager queries employee with no matching transactions

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct report "John" with zero Grab transactions in January 2026 |
| **Input** | "How much did John spend at Grab in January 2026?" |
| **Expected** | Response states no transactions found for John at Grab in January 2026, following the structured response format (zero total, empty items list) |
| **Verify** | No hallucinated amounts. Structured format maintained. |
| **Pass/Fail** | |

### TC-003: Manager queries non-direct-report (authorization denial)

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct reports Sarah and John. "Alice" exists in the business but is NOT a direct report. |
| **Input** | "How much did Alice spend at McDonald's this month?" |
| **Expected** | System denies the query, explaining that Alice is not a direct report. Lists the manager's actual direct reports. |
| **Verify** | No financial data for Alice is returned. Authorization denial is clear. |
| **Pass/Fail** | |

### TC-004: Manager queries with vendor name variations (case-insensitive partial match)

| Field | Value |
|-------|-------|
| **Precondition** | Direct report has transactions with vendors "STARBUCKS COFFEE SDN BHD", "Starbucks", "starbucks coffee" |
| **Input** | "Show me Sarah's starbucks expenses this month" |
| **Expected** | All vendor name variations are matched and aggregated into a single total |
| **Verify** | Case-insensitive partial matching works. All variations included in results. |
| **Pass/Fail** | |

### TC-005: Manager queries with ambiguous employee name

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct reports "Sarah Lee" and "Sarah Tan" |
| **Input** | "How much did Sarah spend this month?" |
| **Expected** | System asks for clarification, listing both "Sarah Lee" and "Sarah Tan" as options |
| **Verify** | No data is returned until clarification is provided. Both matching names shown. |
| **Pass/Fail** | |

---

## Section 2: Manager Employee Expense by Category (US2 - P1)

### TC-006: Manager queries employee spending by category

| Field | Value |
|-------|-------|
| **Precondition** | Direct report "John" has 5 meal-related expense claims in Q1 2026 totaling SGD 150.00 |
| **Input** | "How much did John spend on meals in Q1 2026?" |
| **Expected** | Response includes: total amount (SGD 150.00), record count (5), date range (2026-01-01 to 2026-03-31), and individual claim details filtered to meal category |
| **Verify** | Only meal-category transactions returned. Amounts match database. |
| **Pass/Fail** | |

### TC-007: Natural language category mapping (fuzzy category)

| Field | Value |
|-------|-------|
| **Precondition** | Direct report has expenses in "meals_and_entertainment" category |
| **Input** | "How much did Sarah spend on coffee this quarter?" |
| **Expected** | System maps "coffee" to the closest category (e.g., "meals_and_entertainment" or "food_and_beverages") and queries accordingly. Response notes the category mapping used. |
| **Verify** | Category mapping is reasonable. Mapping assumption documented in response. |
| **Pass/Fail** | |

### TC-008: Empty category results

| Field | Value |
|-------|-------|
| **Precondition** | Direct report "John" has no travel expenses in the specified period |
| **Input** | "Show me John's travel expenses in December 2025" |
| **Expected** | Response follows structured format with zero total, zero record count, empty items list. Date range: 2025-12-01 to 2025-12-31. |
| **Verify** | Structured format maintained even with empty results. No hallucinated data. |
| **Pass/Fail** | |

---

## Section 3: Aggregate Team Spending (US3 - P2)

### TC-009: Manager queries total team spending

| Field | Value |
|-------|-------|
| **Precondition** | Manager has 3 direct reports with combined spending of SGD 5,000 this month |
| **Input** | "What's the total team spending this month?" |
| **Expected** | Response includes: total team spending (SGD 5,000), per-employee breakdown with amounts, top spending categories, date range for "this month" |
| **Verify** | Total matches sum of individual employee totals. All direct reports included. |
| **Pass/Fail** | |

### TC-010: Manager queries employee spending rankings

| Field | Value |
|-------|-------|
| **Precondition** | Manager has 3 direct reports with varying travel spending |
| **Input** | "Who spent the most on travel last quarter?" |
| **Expected** | Ranked list of direct reports by travel spending. Includes amounts and percentages. Date range correctly calculated for "last quarter". |
| **Verify** | Rankings are correct. Amounts match database. Category filter applied. |
| **Pass/Fail** | |

### TC-011: Manager with no direct reports

| Field | Value |
|-------|-------|
| **Precondition** | User has "manager" role but no direct reports assigned in business_memberships |
| **Input** | "What's the total team spending this month?" |
| **Expected** | System responds that no direct reports are assigned and suggests contacting an administrator |
| **Verify** | No data returned. Helpful guidance provided. |
| **Pass/Fail** | |

### TC-012: Team summary grouped by category

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct reports with expenses across multiple categories |
| **Input** | "Show me team expenses by category this month" |
| **Expected** | Breakdown by category with totals, record counts, and percentages. All categories with spending are represented. |
| **Verify** | Category breakdown totals sum to overall team total. Percentages sum to ~100%. |
| **Pass/Fail** | |

---

## Section 4: Deterministic Date Range Calculation (US4 - P1)

### TC-013: Named month resolution

| Field | Value |
|-------|-------|
| **Precondition** | Today is 2026-02-07 |
| **Input** | "Show me Sarah's expenses in January 2026" |
| **Expected** | Date range resolved to 2026-01-01 to 2026-01-31 |
| **Verify** | Check tool call parameters for exact start_date/end_date values |
| **Pass/Fail** | |

### TC-014: "Last quarter" resolution

| Field | Value |
|-------|-------|
| **Precondition** | Today is 2026-02-07 |
| **Input** | "What's the team spending last quarter?" |
| **Expected** | Date range resolved to 2025-10-01 to 2025-12-31 |
| **Verify** | Correct quarter boundary calculation (Q4 2025) |
| **Pass/Fail** | |

### TC-015: "Past N days" resolution

| Field | Value |
|-------|-------|
| **Precondition** | Today is 2026-02-07 |
| **Input** | "Show me John's expenses in the past 60 days" |
| **Expected** | Date range resolved to 2025-12-09 to 2026-02-07 |
| **Verify** | Exact 60-day calculation from server date. Not hallucinated by LLM. |
| **Pass/Fail** | |

### TC-016: "This year" resolution

| Field | Value |
|-------|-------|
| **Precondition** | Today is 2026-02-07 |
| **Input** | "What's the total team spending this year?" |
| **Expected** | Date range resolved to 2026-01-01 to 2026-02-07 |
| **Verify** | Start of year to today (server date), not LLM-guessed |
| **Pass/Fail** | |

### TC-017: "This month" resolution

| Field | Value |
|-------|-------|
| **Precondition** | Today is 2026-02-07 |
| **Input** | "Show me Sarah's expenses this month" |
| **Expected** | Date range resolved to 2026-02-01 to 2026-02-07 |
| **Verify** | Start of current month to today |
| **Pass/Fail** | |

### TC-018: Explicit date range

| Field | Value |
|-------|-------|
| **Precondition** | N/A |
| **Input** | "How much did John spend between December 15 2025 and January 15 2026?" |
| **Expected** | Date range resolved to 2025-12-15 to 2026-01-15 |
| **Verify** | Explicit dates passed through correctly, not reinterpreted |
| **Pass/Fail** | |

---

## Section 5: Role-Based Tool Access (US6 - P2)

### TC-019: Manager sees team query tools

| Field | Value |
|-------|-------|
| **Precondition** | User logged in with "manager" role |
| **Input** | "How much did Sarah spend at Starbucks this month?" |
| **Expected** | System uses `get_employee_expenses` tool. Tool is available in the tool schema. |
| **Verify** | Tool call is made to get_employee_expenses (check server logs) |
| **Pass/Fail** | |

### TC-020: Manager personal query still works

| Field | Value |
|-------|-------|
| **Precondition** | User logged in with "manager" role |
| **Input** | "What are my transactions this month?" |
| **Expected** | System uses `get_transactions` (personal tool), not `get_employee_expenses`. Returns the manager's own data. |
| **Verify** | Existing personal query functionality unaffected by new tools |
| **Pass/Fail** | |

### TC-021: Finance admin queries any employee

| Field | Value |
|-------|-------|
| **Precondition** | User logged in with "finance_admin" role. Target employee is NOT a direct report of this user. |
| **Input** | "How much did [any employee] spend at Grab in January 2026?" |
| **Expected** | Query succeeds. Finance admin can access any employee's data within the business. |
| **Verify** | No direct-report restriction applied. Data returned for any business employee. |
| **Pass/Fail** | |

### TC-022: Owner queries any employee

| Field | Value |
|-------|-------|
| **Precondition** | User logged in with "owner" role |
| **Input** | "Show me [any employee]'s expenses this quarter" |
| **Expected** | Query succeeds. Owner has same access as finance admin (all employees). |
| **Verify** | Full business-wide employee access |
| **Pass/Fail** | |

### TC-023: Employee role has no AI assistant access

| Field | Value |
|-------|-------|
| **Precondition** | User logged in with "employee" role |
| **Input** | Navigate to AI assistant |
| **Expected** | AI assistant is not available (access denied or hidden from navigation) |
| **Verify** | No tool schemas for employee-expense or team-summary tools are exposed |
| **Pass/Fail** | |

---

## Section 6: Structured Response Formatting (US5 - P2)

### TC-024: Consistent response structure with data

| Field | Value |
|-------|-------|
| **Precondition** | Query returns multiple transactions |
| **Input** | "How much did Sarah spend at Starbucks in January 2026?" |
| **Expected** | Response contains: (1) summary line with total + currency, (2) date range queried, (3) record count, (4) individual item details in chronological order |
| **Verify** | All four sections present. Fields consistent (date, description, vendor, amount, category). |
| **Pass/Fail** | |

### TC-025: Consistent response structure with zero results

| Field | Value |
|-------|-------|
| **Precondition** | Query returns no matching transactions |
| **Input** | "How much did John spend at Hilton in 2020?" |
| **Expected** | Response follows same structure: zero total, date range, zero record count, empty items list |
| **Verify** | Structure maintained even with empty results. Not a free-form "no results" message. |
| **Pass/Fail** | |

### TC-026: Response truncation for large datasets

| Field | Value |
|-------|-------|
| **Precondition** | Employee has >50 transactions matching the query criteria |
| **Input** | "Show me all of Sarah's expenses this year" |
| **Expected** | Summary reflects ALL matching records (complete total and count). Items list shows 50 most recent entries with a note about additional records. |
| **Verify** | Summary total covers all records, not just the 50 shown. Truncation note present. |
| **Pass/Fail** | |

---

## Section 7: Authorization & Security

### TC-027: Cross-business isolation

| Field | Value |
|-------|-------|
| **Precondition** | Manager belongs to Business A. Employee belongs to Business B. |
| **Input** | Manager queries employee from Business B by name |
| **Expected** | Employee not found. No cross-business data leakage. |
| **Verify** | Query is scoped to manager's business only |
| **Pass/Fail** | |

### TC-028: Real-time direct report verification

| Field | Value |
|-------|-------|
| **Precondition** | Employee "Sarah" was the manager's direct report but was just reassigned to another manager |
| **Input** | "How much did Sarah spend this month?" |
| **Expected** | Query is denied (Sarah is no longer a direct report). Current direct report list is used, not cached. |
| **Verify** | Authorization check happens at query time, not session start |
| **Pass/Fail** | |

### TC-029: Audit logging for cross-employee queries

| Field | Value |
|-------|-------|
| **Precondition** | Manager queries a direct report's expenses |
| **Input** | "How much did John spend at Grab this month?" |
| **Expected** | Server logs contain: manager user ID, target employee ID, query parameters (vendor, date range), timestamp |
| **Verify** | Check server/Convex logs for audit trail |
| **Pass/Fail** | |

---

## Section 8: MCP Server Integration

### TC-030: MCP analyze_team_spending tool

| Field | Value |
|-------|-------|
| **Precondition** | MCP server deployed with new analyze_team_spending tool. Valid API key. |
| **Input** | Call `analyze_team_spending` via MCP with: business_id, manager_user_id, date_range |
| **Expected** | Returns structured JSON with employee_summary (rankings), category_breakdown, vendor_breakdown |
| **Verify** | Response validates against AnalyzeTeamSpendingOutput schema. Amounts match database. |
| **Pass/Fail** | |

### TC-031: MCP tool authorization

| Field | Value |
|-------|-------|
| **Precondition** | MCP API key associated with a specific business |
| **Input** | Call `analyze_team_spending` with a manager_user_id who is NOT a manager in the business |
| **Expected** | Tool returns error indicating insufficient permissions |
| **Verify** | Authorization is enforced at MCP tool level |
| **Pass/Fail** | |

---

## Section 9: Backward Compatibility

### TC-032: Existing get_transactions tool works unchanged

| Field | Value |
|-------|-------|
| **Precondition** | Any user with AI assistant access |
| **Input** | "What are my transactions this month?" |
| **Expected** | Returns user's own transactions using existing get_transactions tool. Same behavior as before the feature. |
| **Verify** | No regression in personal transaction queries |
| **Pass/Fail** | |

### TC-033: Existing get_vendors tool works unchanged

| Field | Value |
|-------|-------|
| **Precondition** | Any user with AI assistant access |
| **Input** | "Show me my vendors" |
| **Expected** | Returns user's vendor list using existing get_vendors tool. Same behavior as before. |
| **Verify** | No regression in personal vendor queries |
| **Pass/Fail** | |

### TC-034: Existing search_documents tool works unchanged

| Field | Value |
|-------|-------|
| **Precondition** | Any user with AI assistant access |
| **Input** | "Search for invoice from ABC Corp" |
| **Expected** | Returns document search results using existing search_documents tool |
| **Verify** | No regression in document search |
| **Pass/Fail** | |

### TC-035: Regulatory knowledge base tool works unchanged

| Field | Value |
|-------|-------|
| **Precondition** | Any user with AI assistant access |
| **Input** | "What are the GST registration requirements in Singapore?" |
| **Expected** | Uses searchRegulatoryKnowledgeBase tool. Returns regulatory info with citations. |
| **Verify** | No regression in knowledge base queries |
| **Pass/Fail** | |

---

## Section 10: Edge Cases & Error Handling

### TC-036: Employee name in different language/partial form

| Field | Value |
|-------|-------|
| **Precondition** | Manager has direct report "Muhammad Ali bin Hassan" |
| **Input** | "How much did Ali spend this month?" |
| **Expected** | System performs partial match and either resolves to the employee or asks for clarification if multiple matches |
| **Verify** | Partial name matching works for SEA naming conventions |
| **Pass/Fail** | |

### TC-037: Date range spanning before employee joined

| Field | Value |
|-------|-------|
| **Precondition** | Employee joined on 2025-06-15. Manager queries from January 2025. |
| **Input** | "How much did [employee] spend in 2025?" |
| **Expected** | Returns data only for the period after the employee joined (2025-06-15 onwards). Optionally notes the employee's start date. |
| **Verify** | No data from before the employee's membership start date |
| **Pass/Fail** | |

### TC-038: Mixed currencies in results

| Field | Value |
|-------|-------|
| **Precondition** | Employee has expenses in SGD and MYR |
| **Input** | "Show me Sarah's expenses this month" |
| **Expected** | Amounts reported in the business's home currency (using homeCurrencyAmount). Original currency amounts shown alongside when different. |
| **Verify** | Currency handling is consistent and correct |
| **Pass/Fail** | |

### TC-039: Concurrent session - direct report list changes

| Field | Value |
|-------|-------|
| **Precondition** | Manager has ongoing AI chat session. Admin reassigns one direct report to another manager mid-session. |
| **Input** | Manager queries the reassigned employee |
| **Expected** | Query is denied (employee is no longer a direct report). System uses current assignment, not cached. |
| **Verify** | Real-time authorization check, not session-cached |
| **Pass/Fail** | |

### TC-040: Very large team query

| Field | Value |
|-------|-------|
| **Precondition** | Manager or finance admin queries team with many employees and hundreds of transactions |
| **Input** | "What's the total team spending this year?" |
| **Expected** | Response returns within reasonable time. Summary covers all records. Item list truncated at 50. No timeout errors. |
| **Verify** | Performance is acceptable. No data loss in aggregation. |
| **Pass/Fail** | |

---

## Test Execution Log

| TC ID | Tester | Date | Environment | Result | Notes |
|-------|--------|------|-------------|--------|-------|
| TC-001 | | | | | |
| TC-002 | | | | | |
| TC-003 | | | | | |
| TC-004 | | | | | |
| TC-005 | | | | | |
| TC-006 | | | | | |
| TC-007 | | | | | |
| TC-008 | | | | | |
| TC-009 | | | | | |
| TC-010 | | | | | |
| TC-011 | | | | | |
| TC-012 | | | | | |
| TC-013 | | | | | |
| TC-014 | | | | | |
| TC-015 | | | | | |
| TC-016 | | | | | |
| TC-017 | | | | | |
| TC-018 | | | | | |
| TC-019 | | | | | |
| TC-020 | | | | | |
| TC-021 | | | | | |
| TC-022 | | | | | |
| TC-023 | | | | | |
| TC-024 | | | | | |
| TC-025 | | | | | |
| TC-026 | | | | | |
| TC-027 | | | | | |
| TC-028 | | | | | |
| TC-029 | | | | | |
| TC-030 | | | | | |
| TC-031 | | | | | |
| TC-032 | | | | | |
| TC-033 | | | | | |
| TC-034 | | | | | |
| TC-035 | | | | | |
| TC-036 | | | | | |
| TC-037 | | | | | |
| TC-038 | | | | | |
| TC-039 | | | | | |
| TC-040 | | | | | |
