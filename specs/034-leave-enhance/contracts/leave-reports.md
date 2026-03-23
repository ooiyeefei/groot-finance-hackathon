# Contract: Leave Reports

## Convex Actions (all use `action` + `internalQuery` pattern)

### `leaveReports.balanceSummary`

**Type**: `action`

#### Input
```typescript
args: {
  businessId: v.string(),
  year: v.optional(v.number()), // defaults to current leave year
}
```

#### Output
```typescript
{
  year: number,
  yearLabel: string, // e.g., "2026" or "Apr 2026 - Mar 2027"
  employees: Array<{
    userId: string,
    userName: string,
    teamName: string,
    balances: Array<{
      leaveTypeName: string,
      leaveTypeColor: string,
      entitled: number,
      used: number,
      adjustments: number,
      carryover: number,
      remaining: number,
    }>,
  }>,
}
```

### `leaveReports.utilization`

**Type**: `action`

#### Input
```typescript
args: {
  businessId: v.string(),
  year: v.optional(v.number()),
}
```

#### Output
```typescript
{
  year: number,
  yearLabel: string,
  teams: Array<{
    teamName: string,
    managerId: string,
    managerName: string,
    memberCount: number,
    leaveTypes: Array<{
      leaveTypeName: string,
      totalEntitled: number,
      totalUsed: number,
      utilizationRate: number, // 0-100 percentage
    }>,
    overallUtilizationRate: number,
  }>,
  businessOverallRate: number,
}
```

### `leaveReports.absenceTrends`

**Type**: `action`

#### Input
```typescript
args: {
  businessId: v.string(),
  year: v.optional(v.number()),
}
```

#### Output
```typescript
{
  year: number,
  yearLabel: string,
  months: Array<{
    month: string, // "Jan", "Feb", etc.
    monthNumber: number,
    totalAbsenceDays: number,
    byLeaveType: Array<{
      leaveTypeName: string,
      leaveTypeColor: string,
      days: number,
    }>,
  }>,
  peakMonth: string,
  totalAbsenceDays: number,
}
```

### Access Control (all reports)
- Admin/Owner: sees all employees in business
- Manager: sees only direct reports
- Employee: no access (reports tab hidden)

### Role Filtering
Reports accept the caller's role and filter accordingly:
- If role is manager: filter `business_memberships` where `managerId = callerId`
- If role is admin/owner: no filter (all members)
