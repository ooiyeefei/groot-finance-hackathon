# Data Model: Manager Cross-Employee Financial Queries

**Branch**: `008-manager-agent-queries` | **Date**: 2026-02-07

## Existing Entities (No Schema Changes)

### accounting_entries
Primary data source for manager queries. Only approved/posted entries are queried.

Key fields for this feature:
- `userId` (id → users) — the employee who incurred the expense
- `businessId` (id → businesses) — tenant isolation
- `vendorName` (string, optional) — vendor name from OCR/manual entry
- `category` (string, optional) — IFRS category ID (e.g., "travel_entertainment")
- `transactionDate` (string, ISO date) — when the expense occurred
- `homeCurrencyAmount` (number, optional) — amount in business home currency
- `originalAmount` (number) — amount in original currency
- `originalCurrency` (string) — currency code
- `transactionType` (enum) — Income | Cost of Goods Sold | Expense
- `description` (string, optional) — expense description
- `sourceDocumentType` (enum, optional) — expense_claim | invoice | manual
- `deletedAt` (number, optional) — soft delete timestamp

Relevant indexes: `by_businessId`, `by_userId`, `by_transactionDate`, `by_category`

### business_memberships
Authorization source for manager-employee relationships.

Key fields for this feature:
- `userId` (id → users) — the member
- `businessId` (id → businesses) — which business
- `managerId` (id → users, optional) — the assigned manager
- `role` (enum) — owner | finance_admin | manager | employee
- `status` (enum) — active | suspended | pending

Relevant indexes: `by_userId_businessId`, `by_businessId`

### users
Name resolution source.

Key fields for this feature:
- `clerkUserId` (string) — Clerk authentication ID
- `fullName` (string, optional) — display name for matching
- `email` (string) — fallback for matching
- `businessId` (id → businesses, optional)
- `homeCurrency` (string, optional) — user's home currency

Relevant indexes: `by_clerkUserId`, `by_businessId`

### expense_claims
Secondary data source (only for finance admin/owner queries).

Key fields for this feature:
- `userId` (id → users) — submitter
- `businessId` (id → businesses) — tenant isolation
- `vendorName` (string, optional)
- `expenseCategory` (string, optional)
- `totalAmount` (number, optional)
- `status` (enum) — draft | submitted | approved | rejected | ...
- `transactionDate` (string, optional)

Relevant indexes: `by_businessId`, `by_userId`, `by_status`

## New Types (No Schema Changes — Application-Level Only)

### EmployeeExpenseQueryParams (Zod Schema)
Input schema for the `get_employee_expenses` tool.

```
Fields:
- employee_name: string (required) — natural language name reference
- vendor: string (optional) — vendor name filter (partial match)
- category: string (optional) — natural language category (mapped to IFRS)
- date_range: string (optional) — natural language date expression
- start_date: string (optional) — explicit YYYY-MM-DD
- end_date: string (optional) — explicit YYYY-MM-DD
- transaction_type: enum (optional) — Income | Expense | Cost of Goods Sold
- limit: number (optional, default 50, max 50)
```

### TeamSummaryQueryParams (Zod Schema)
Input schema for the `get_team_summary` tool.

```
Fields:
- date_range: string (optional) — natural language date expression
- start_date: string (optional) — explicit YYYY-MM-DD
- end_date: string (optional) — explicit YYYY-MM-DD
- category: string (optional) — category filter
- group_by: enum (optional) — employee | category | vendor (default: employee)
```

### EmployeeExpenseResponse (Zod Schema)
Structured output schema for `get_employee_expenses`.

```
Fields:
- summary:
    - total_amount: number
    - currency: string
    - record_count: number
    - date_range: { start: string, end: string }
- employee:
    - name: string
    - id: string
- items: Array (max 50):
    - date: string (YYYY-MM-DD)
    - description: string
    - vendor_name: string
    - amount: number
    - currency: string
    - category: string
    - transaction_type: string
- truncated: boolean
- truncated_count: number (0 if not truncated)
```

### TeamSummaryResponse (Zod Schema)
Structured output schema for `get_team_summary`.

```
Fields:
- summary:
    - total_amount: number
    - currency: string
    - employee_count: number
    - record_count: number
    - date_range: { start: string, end: string }
- breakdown: Array:
    - group_key: string (employee name, category, or vendor)
    - total_amount: number
    - record_count: number
    - percentage: number (of total)
- top_categories: Array (top 5):
    - category: string
    - total_amount: number
    - percentage: number
```

### EmployeeMatch
Internal type for name resolution results.

```
Fields:
- user_id: string (Convex user ID)
- clerk_user_id: string
- full_name: string
- email: string
- confidence: enum — exact | partial | ambiguous
```

### DateRangeResult
Shared type for deterministic date resolution.

```
Fields:
- start_date: string (YYYY-MM-DD)
- end_date: string (YYYY-MM-DD)
- original_expression: string (what the user said)
- reference_date: string (server date used)
```

## Entity Relationships (for this feature)

```
Manager (users) ──managerId──> Employee (business_memberships)
                                    │
Employee (users) ──userId──> accounting_entries
                                    │
accounting_entries ──vendorName──> (text match, no FK)
accounting_entries ──category──> (IFRS category ID, no FK)
```

## Authorization Matrix

| Role          | Own Data | Direct Reports | All Employees | Invoice Data |
|---------------|----------|----------------|---------------|--------------|
| Employee      | Yes      | No             | No            | No           |
| Manager       | Yes      | Yes            | No            | No           |
| Finance Admin | Yes      | Yes            | Yes           | Yes          |
| Owner         | Yes      | Yes            | Yes           | Yes          |

Note: Employees do not have AI assistant access (FR-005a).
