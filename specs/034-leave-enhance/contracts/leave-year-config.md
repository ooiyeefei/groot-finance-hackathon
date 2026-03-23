# Contract: Leave Year Configuration

## Convex Mutation: `businesses.updateLeaveYearStartMonth`

**Type**: `mutation` (admin/owner only)

### Input
```typescript
args: {
  businessId: v.id("businesses"),
  leaveYearStartMonth: v.number(), // 1-12
}
```

### Output
```typescript
{ success: boolean }
```

### Validation
- `leaveYearStartMonth` must be integer 1-12
- Caller must be admin or owner of the business

### Behavior
1. Validate input
2. Patch businesses document with new `leaveYearStartMonth`
3. No retroactive changes to existing balances or requests

## Utility Module: `leave-year-utils.ts`

### Functions

```typescript
/**
 * Get the leave year boundaries for a given reference date.
 * @param startMonth - 1-12, the month the leave year starts
 * @param referenceDate - Date to calculate the leave year for (defaults to now)
 * @returns { yearStart: string, yearEnd: string, yearLabel: string, yearNumber: number }
 */
function getLeaveYearBoundaries(startMonth: number, referenceDate?: Date): LeaveYearBoundary

/**
 * Get the "year number" for the current leave year.
 * For Jan start: returns calendar year (2026).
 * For Apr start: returns the year the period starts in (Apr 2026 - Mar 2027 → 2026).
 */
function getCurrentLeaveYear(startMonth: number, referenceDate?: Date): number

/**
 * Format a leave year label for display.
 * Jan start: "2026"
 * Apr start: "Apr 2026 - Mar 2027"
 */
function formatLeaveYearLabel(startMonth: number, yearNumber: number): string
```

### Type
```typescript
interface LeaveYearBoundary {
  yearStart: string,  // ISO date: "2026-04-01"
  yearEnd: string,    // ISO date: "2027-03-31"
  yearLabel: string,  // "Apr 2026 - Mar 2027"
  yearNumber: number, // 2026
}
```

## UI: Settings Page Extension

### Location
`src/domains/leave-management/components/leave-management-settings.tsx`

### New Section: "General Settings"
- Dropdown: "Leave Year Start Month" (January - December)
- Default: January
- On change: show confirmation dialog warning that existing balances may need manual adjustment
- Save calls `businesses.updateLeaveYearStartMonth` mutation
