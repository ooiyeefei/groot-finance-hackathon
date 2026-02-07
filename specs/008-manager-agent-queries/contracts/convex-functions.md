# Convex Function Contracts

## New Query Functions

### financialIntelligence.getEmployeeExpensesForManager

**Purpose**: Fetch approved accounting entries for a specific employee, authorized by manager relationship.

```typescript
Args:
  businessId: v.string()           // Business ID for tenant isolation
  requestingUserId: v.string()     // Convex user ID of the manager/admin making the request
  targetEmployeeId: v.string()     // Convex user ID of the target employee
  filters: v.optional(v.object({
    vendorName: v.optional(v.string()),         // Case-insensitive partial match
    category: v.optional(v.string()),            // IFRS category ID (exact match)
    startDate: v.optional(v.string()),           // YYYY-MM-DD
    endDate: v.optional(v.string()),             // YYYY-MM-DD
    transactionType: v.optional(v.string()),     // Income | Expense | Cost of Goods Sold
    limit: v.optional(v.number()),               // Max 50
  }))

Returns:
  {
    authorized: boolean
    error?: string
    entries: Array<{
      id: string
      transactionDate: string
      description: string
      vendorName: string
      originalAmount: number
      homeCurrencyAmount: number
      originalCurrency: string
      homeCurrency: string
      category: string
      transactionType: string
      sourceDocumentType: string
    }>
    totalCount: number           // Count of ALL matches (before limit)
    totalAmount: number          // Sum of ALL matches (before limit)
    currency: string             // Business home currency
    employeeName: string
  }
```

**Authorization logic**:
1. Resolve `requestingUserId` → get membership with role
2. If role is `manager`: verify `targetEmployeeId` has `managerId === requestingUserId`
3. If role is `finance_admin` or `owner`: allow any employee in business
4. If role is `employee`: deny with error

**Query logic**:
1. Use `by_businessId` index on accounting_entries
2. Filter: `userId === targetEmployeeId`
3. Filter: `!deletedAt`
4. Apply optional filters (vendorName partial match, category exact, date range, type)
5. Sort by transactionDate descending
6. Compute totalCount and totalAmount BEFORE applying limit
7. Return limited items + full totals

---

### financialIntelligence.getTeamExpenseSummary

**Purpose**: Aggregate approved accounting entries across all direct reports for a manager.

```typescript
Args:
  businessId: v.string()
  requestingUserId: v.string()
  filters: v.optional(v.object({
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    category: v.optional(v.string()),
    groupBy: v.optional(v.string()),   // "employee" | "category" | "vendor"
  }))

Returns:
  {
    authorized: boolean
    error?: string
    summary: {
      totalAmount: number
      currency: string
      employeeCount: number
      recordCount: number
    }
    breakdown: Array<{
      groupKey: string           // Employee name, category name, or vendor name
      groupId: string            // User ID, category ID, or vendor name
      totalAmount: number
      recordCount: number
      percentage: number
    }>
    topCategories: Array<{
      category: string
      categoryName: string
      totalAmount: number
      percentage: number
    }>
  }
```

**Authorization logic**: Same as getEmployeeExpensesForManager, but scope is all direct reports (or all business for admin/owner).

**Query logic**:
1. Get all direct report user IDs (or all employees for admin/owner)
2. Use `by_businessId` index on accounting_entries
3. Filter: `userId IN directReportIds`
4. Filter: `!deletedAt` + optional date/category filters
5. Group by requested dimension (employee/category/vendor)
6. Compute totals, percentages, sort by amount descending

---

### memberships.resolveEmployeeByName

**Purpose**: Match a natural language name query to specific employee records within the manager's direct reports.

```typescript
Args:
  businessId: v.id("businesses")
  requestingUserId: v.id("users")
  nameQuery: v.string()            // Partial name to search

Returns:
  {
    matches: Array<{
      userId: string              // Convex user ID
      clerkUserId: string
      fullName: string
      email: string
      confidence: "exact" | "partial" | "ambiguous"
    }>
    totalDirectReports: number
  }
```

**Match logic**:
1. Get direct reports for requestingUserId (or all employees for admin/owner)
2. Load user records for each direct report
3. Match `nameQuery` against `fullName` and `email`:
   - Exact: fullName equals nameQuery (case-insensitive)
   - Partial: fullName contains nameQuery (case-insensitive)
   - Email: email prefix matches nameQuery
4. Sort: exact matches first, then partial
5. Return all matches (tool decides whether to ask for clarification)

---

## New MCP Query Functions

### financialIntelligence.getMcpTeamExpenses

**Purpose**: Fetch team expense data for MCP server analytics tool.

```typescript
Args:
  businessId: v.string()
  managerUserId: v.string()
  employeeIds: v.optional(v.array(v.string()))
  startDate: v.optional(v.string())
  endDate: v.optional(v.string())
  categoryFilter: v.optional(v.array(v.string()))

Returns:
  Array<{
    _id: string
    userId: string
    userName: string
    transactionDate: string
    vendorName: string
    category: string
    categoryName: string
    originalAmount: number
    homeCurrencyAmount: number
    currency: string
    transactionType: string
  }>
```

**Authorization**: Validates managerUserId has manager/finance_admin/owner role. Filters to direct reports if manager role.
