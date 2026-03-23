# Contract: Leave Balance Bulk Import

## CSV Schema Type: `leave_balance`

### Required Columns
| Field | Label | Type | Required | Aliases |
|-------|-------|------|----------|---------|
| employeeEmail | Employee Email | string | yes | email, employee, staff email, emp email |
| leaveTypeCode | Leave Type Code | string | yes | leave type, type, code, leave code |
| year | Year | number | yes | year, period, fiscal year, leave year |
| entitled | Entitled Days | number | yes | entitled, allocation, total days, annual entitlement |

### Optional Columns
| Field | Label | Type | Required | Aliases |
|-------|-------|------|----------|---------|
| used | Used Days | number | no | used, taken, consumed, days used |
| carryover | Carry Over Days | number | no | carryover, carry over, brought forward, bf |
| adjustments | Adjustments | number | no | adjustment, adj, manual adjustment |

## Convex Mutation: `leaveBalances.bulkUpsert`

**Type**: `internalMutation` (called from an action, not exposed to frontend)

### Input
```typescript
args: {
  businessId: v.id("businesses"),
  balances: v.array(v.object({
    userId: v.id("users"),
    leaveTypeId: v.id("leave_types"),
    year: v.number(),
    entitled: v.number(),
    used: v.optional(v.number()),
    carryover: v.optional(v.number()),
    adjustments: v.optional(v.number()),
  })),
}
```

### Output
```typescript
{
  created: number,
  updated: number,
}
```

### Behavior
1. For each balance entry:
   a. Query `leave_balances` by `by_businessId_userId_leaveTypeId_year` index
   b. If exists: patch with new values (entitled, used, carryover, adjustments)
   c. If not exists: insert new record with all fields + `importSource: "csv_import"`, `importedAt: Date.now()`
2. Return counts of created vs. updated records

## Convex Action: `leaveBalances.importFromCsv`

**Type**: `action` (public, called from frontend after CSV parsing)

### Input
```typescript
args: {
  businessId: v.string(),
  rows: v.array(v.object({
    employeeEmail: v.string(),
    leaveTypeCode: v.string(),
    year: v.number(),
    entitled: v.number(),
    used: v.optional(v.number()),
    carryover: v.optional(v.number()),
    adjustments: v.optional(v.number()),
  })),
}
```

### Output
```typescript
{
  created: number,
  updated: number,
  skipped: number,
  errors: Array<{ row: number, reason: string }>,
}
```

### Behavior
1. Validate caller is admin/owner for the business
2. For each row:
   a. Look up user by email in business → skip if not found
   b. Look up leave type by code in business → skip if not found
   c. Validate year is reasonable (e.g., within last 5 years to next year)
   d. Add to valid batch or error list
3. Call `bulkUpsert` internal mutation with valid batch
4. Return combined result with error details
