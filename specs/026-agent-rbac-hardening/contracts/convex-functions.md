# Convex Function Contracts

## New Queries

### invoices.searchForAI
```typescript
// Enhanced version of existing getCompletedForAI with search params
query({
  args: {
    businessId: v.string(),
    vendorName: v.optional(v.string()),     // partial match, case-insensitive
    invoiceNumber: v.optional(v.string()),  // exact or partial match
    startDate: v.optional(v.string()),      // YYYY-MM-DD
    endDate: v.optional(v.string()),        // YYYY-MM-DD
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    limit: v.optional(v.number()),          // default 20, max 50
  },
  returns: {
    invoices: Array<{
      _id, vendorName, invoiceNumber, invoiceDate, amount, currency,
      isPosted, paymentStatus, confidenceScore,
      lineItems: Array<{ description, quantity, unitPrice, totalAmount }>
    }>,
    totalCount: number,
    summary: { totalAmount, currency }
  }
})
```

### financialIntelligence.getARSummary
```typescript
// AR aging and revenue summary — uses action + internalQuery
action({
  args: {
    businessId: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  returns: {
    totalRevenue: number,
    totalOutstanding: number,
    totalOverdue: number,
    currency: string,
    statusBreakdown: Array<{ status, count, totalAmount }>,
    agingBuckets: Array<{ bucket: 'current'|'1-30'|'31-60'|'61-90'|'90+', amount, count }>,
    topCustomers: Array<{ clientName, outstanding, overdueDays? }>,
  }
})
```

### financialIntelligence.getAPAging
```typescript
// AP aging and vendor balance — uses action + internalQuery
action({
  args: {
    businessId: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  returns: {
    totalOutstanding: number,
    totalOverdue: number,
    currency: string,
    agingBuckets: Array<{ bucket: 'current'|'1-30'|'31-60'|'61-90'|'90+', amount, count }>,
    vendorBreakdown: Array<{ vendorName, outstanding, oldestDueDate }>,
    upcomingDues: Array<{ vendorName, invoiceNumber, amount, dueDate }>,
  }
})
```

### financialIntelligence.getBusinessTransactions
```typescript
// Business-wide transactions (not personal-scoped) — uses action + internalQuery
action({
  args: {
    businessId: v.string(),
    query: v.optional(v.string()),           // vendor/description search
    category: v.optional(v.string()),
    transactionType: v.optional(v.string()), // Income, Expense, COGS
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),           // default 50, max 100
  },
  returns: {
    transactions: Array<{
      transactionDate, vendorName, amount, currency, homeCurrencyAmount,
      category, description, transactionType, employeeName?
    }>,
    totalAmount: number,
    totalCount: number,
    currency: string,
  }
})
```

### financialIntelligence.getTeamExpenseSummary (modified)
```typescript
// Add vendor filter to existing function
action({
  args: {
    businessId: v.string(),
    requestingUserId: v.string(),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      category: v.optional(v.string()),
      vendorName: v.optional(v.string()),  // NEW: vendor filter
      groupBy: v.optional(v.string()),
    })),
  },
  // returns: same as current
})
```

### actionCenter.getInsightsScoped (modified or new)
```typescript
// Scoped version of getInsights
query({
  args: {
    businessId: v.string(),
    requestingUserId: v.string(),
    role: v.string(),  // manager, finance_admin, owner
    insightType: v.optional(v.string()), // duplicates, approvals_pending, overdue
  },
  returns: {
    insights: Array<{ type, severity, title, description, resourceIds?, actionUrl? }>,
    authorized: boolean,
  }
})
```

## Modified Queries

### memberships.validateBusinessAccess (new)
```typescript
// Validates user has active membership for a given business
query({
  args: {
    clerkUserId: v.string(),
    businessId: v.string(),
  },
  returns: {
    hasAccess: boolean,
    role: v.optional(v.string()),
  }
})
```
