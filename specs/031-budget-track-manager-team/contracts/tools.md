# Tool Contracts: Budget Tracking + Manager Team Tools

## Tool: `check_budget_status`

**Access**: MANAGER_TOOLS (manager, finance_admin, owner)

### Input Schema
```typescript
{
  category?: string     // Optional: filter to specific category name
  period?: string       // Optional: "YYYY-MM" format, defaults to current month
}
```

### Output Schema
```typescript
{
  success: true
  data: {
    period: string              // "YYYY-MM"
    currency: string            // Business home currency
    categories: Array<{
      categoryId: string
      categoryName: string
      budgetLimit: number
      currentSpend: number
      remaining: number
      percentUsed: number
      status: 'on_track' | 'warning' | 'overspent'
    }>
    totalBudget: number
    totalSpend: number
    overallStatus: 'on_track' | 'warning' | 'overspent'
  }
}
```

### Action Card: `budget_status`

---

## Tool: `set_budget`

**Access**: MANAGER_TOOLS (manager, finance_admin, owner)

### Input Schema
```typescript
{
  category_name: string          // Must match an existing expense category name
  monthly_limit: number          // Budget amount (> 0), or 0 to remove budget
  currency?: string              // Optional: defaults to business home currency
}
```

### Output Schema
```typescript
{
  success: true
  data: {
    categoryId: string
    categoryName: string
    action: 'created' | 'updated' | 'removed'
    previousLimit?: number       // Only for update/remove
    newLimit?: number            // Only for create/update
    currency: string
  }
}
```

### No Action Card (confirmation via text response)

---

## Tool: `get_late_approvals`

**Access**: MANAGER_TOOLS (manager, finance_admin, owner)

### Input Schema
```typescript
{
  threshold_days?: number        // Optional: override default 3 business days
}
```

### Output Schema
```typescript
{
  success: true
  data: {
    lateSubmissions: Array<{
      submissionId: string       // Convex document ID
      submitterName: string
      submitterId: string
      title: string
      totalAmount: number
      currency: string
      submittedAt: string        // ISO timestamp
      waitingDays: number        // Business days waiting
      claimCount: number
    }>
    totalLate: number
    oldestWaitingDays: number
  }
}
```

### Action Card: `late_approvals`

---

## Tool: `compare_team_spending`

**Access**: MANAGER_TOOLS (manager, finance_admin, owner)

### Input Schema
```typescript
{
  period?: string                // Optional: "YYYY-MM" or "YYYY-Q1" format
  group_by?: 'employee' | 'category'  // Default: 'employee'
}
```

### Output Schema
```typescript
{
  success: true
  data: {
    period: string
    currency: string
    employees: Array<{
      employeeId: string
      employeeName: string
      totalSpend: number
      claimCount: number
      isOutlier: boolean         // > 1.5x team average
      topCategories: Array<{ name: string; amount: number }>
    }>
    teamAverage: number
    teamTotal: number
    outlierThreshold: number     // 1.5x average value
  }
}
```

### Action Card: `team_comparison`
