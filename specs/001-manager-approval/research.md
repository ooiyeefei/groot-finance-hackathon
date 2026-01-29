# Research: Manager Approval Workflow Enforcement

**Feature**: 001-manager-approval
**Date**: 2026-01-29

## Executive Summary

This research validates the technical approach for implementing manager approval workflow enforcement. All unknowns have been resolved through codebase analysis.

---

## Research 1: Existing Approver Routing Logic

### Question
How does the current `findNextApprover` logic work and what changes are needed for self-approval?

### Investigation

**File**: `convex/functions/expenseClaims.ts` (lines 1075-1136)

Current flow:
1. Get submitter's membership to find `managerId`
2. If `managerId` exists → return that manager
3. Else find any `finance_admin` or `owner` (excluding submitter)
4. If found → return first active one
5. Else → return `null`

**Key Finding**: The code already excludes the submitter when looking for finance_admin/owner:
```typescript
if (membership.userId !== submitter._id && membership.status === "active")
```

### Decision
Add self-approval as Step 4.5: If submitter is manager/admin and no other approver found, return submitter.

### Rationale
- Maintains separation of duties (prefers external approvers)
- Prevents orphaned claims for solo managers
- Standard industry practice for small businesses

### Alternatives Rejected
1. **Always require external approver**: Blocks legitimate solo-manager scenarios
2. **Create a special "owner-escalation" path**: Overcomplicated, owner may be the submitter

---

## Research 2: Submission Validation Location

### Question
Where should the "block employee without manager" validation be implemented?

### Investigation

**Current submission path**:
1. UI calls `updateExpenseClaimStatus({ status: 'submitted' })`
2. `src/domains/expense-claims/lib/data-access.ts` handles RPC
3. Calls `findNextApprover` to get reviewer
4. Calls Convex mutation to update status

**File**: `src/domains/expense-claims/lib/data-access.ts` (lines 773-800)

### Decision
Add validation in data-access.ts before the Convex mutation, after permission checks.

### Rationale
- Single point of validation for all submission paths
- Can return detailed error with guidance message
- Consistent with existing permission check pattern

### Alternatives Rejected
1. **Convex mutation validation**: Limited error message customization
2. **UI-only validation**: Can be bypassed, not secure
3. **Schema-level constraint**: Convex doesn't support conditional constraints

---

## Research 3: Approval Queue Filtering

### Question
Does the existing approval queue filtering correctly show self-submitted claims to managers?

### Investigation

**File**: `convex/functions/expenseClaims.ts` (lines 98-115)

```typescript
} else if (role === "manager") {
  const directReports = allMemberships.filter((m) => m.managerId === user._id);
  const reportIds = new Set(directReports.map((m) => m.userId));
  reportIds.add(user._id); // Include own claims  <-- KEY LINE
  claims = claims.filter((claim) => reportIds.has(claim.userId));
}
```

### Decision
**No changes needed** - existing code already includes `user._id` in the filter set.

### Rationale
The line `reportIds.add(user._id)` ensures managers see their own claims.

---

## Research 4: Team Management Validation Points

### Question
Where should manager-requirement validation be added in Team Management?

### Investigation

**Files analyzed**:
- `src/domains/account-management/components/teams-management-client.tsx`
- `src/hooks/useTeamMembersRealtime.ts`
- `convex/functions/memberships.ts` (assignManager mutation)

**Current flow**:
1. UI Select component allows "none" value for manager
2. `handleAssignManager` converts "none" to `null`
3. Convex `assignManager` mutation accepts any `managerId`

### Decision
Add validation at two levels:
1. **UI (teams-management-client.tsx)**: Disable save/show error when employee has no manager
2. **Convex (memberships.ts)**: Reject `assignManager` when role is employee and managerId is null

### Rationale
- UI provides immediate feedback to admins
- Server-side prevents API bypass
- Consistent with existing validation patterns

---

## Research 5: Role Detection for Routing

### Question
How to determine if submitter is a manager/admin for self-approval eligibility?

### Investigation

**Role structure** (from schema):
```typescript
membershipRoleValidator = v.union(
  v.literal("owner"),
  v.literal("finance_admin"),
  v.literal("manager"),
  v.literal("employee")
)
```

**Role hierarchy**: owner > finance_admin > manager > employee

### Decision
Check `submitterMembership.role` in `findNextApprover`:
- If role is `owner`, `finance_admin`, or `manager` → eligible for self-approval
- If role is `employee` → NOT eligible (must have manager)

### Rationale
Employees should never self-approve; all other roles have approval authority.

---

## Resolved Unknowns Summary

| Unknown | Resolution |
|---------|------------|
| Self-approval logic location | `findNextApprover` query in Convex |
| Submission blocking location | `data-access.ts` before Convex mutation |
| Queue filtering for self-claims | Already works correctly |
| Team management validation | UI + Convex mutation dual validation |
| Role-based eligibility | Check membership role for non-employee |

---

## Dependencies Confirmed

| Dependency | Status | Notes |
|------------|--------|-------|
| Convex `business_memberships` | ✅ Exists | Has `managerId` and `role` fields |
| Convex `findNextApprover` | ✅ Exists | Needs modification |
| Team Management UI | ✅ Exists | Needs validation added |
| `assignManager` mutation | ✅ Exists | Needs validation added |
