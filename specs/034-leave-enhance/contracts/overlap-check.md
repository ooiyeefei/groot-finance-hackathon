# Contract: Overlap Check for Approval

## Convex Query: `leaveRequests.checkOverlapsForApproval`

**Type**: `query` (non-reactive, called on-demand before approval)

### Input
```typescript
args: {
  businessId: v.string(),
  leaveRequestId: v.id("leave_requests"),
}
```

### Output
```typescript
{
  hasOverlaps: boolean,
  overlappingMembers: Array<{
    userId: string,
    userName: string,
    leaveTypeName: string,
    leaveStatus: "approved" | "submitted",
    overlapDates: string[], // ISO date strings
  }>,
  totalOverlapDays: number,
}
```

### Behavior
1. Load the target leave request (get startDate, endDate, approverId)
2. Query all leave_requests for the same businessId where:
   - status is "approved" OR "submitted"
   - userId is a direct report of the same manager (approverId)
   - date range overlaps with target request
   - excludes the target request itself
   - excludes the approver's own leave
3. For each overlapping request, compute the specific overlapping dates
4. Return structured overlap data

### Access Control
- Caller must be the approverId of the target request, OR an admin/owner
