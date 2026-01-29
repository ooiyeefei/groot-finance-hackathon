# API Contract Changes: Manager Approval Workflow

**Feature**: 001-manager-approval
**Date**: 2026-01-29

## Overview

This document specifies changes to existing Convex queries/mutations and REST API behavior.

---

## Convex Function Changes

### 1. `findNextApprover` Query

**File**: `convex/functions/expenseClaims.ts`
**Type**: Query (read-only)

#### Current Signature (unchanged)
```typescript
export const findNextApprover = query({
  args: {
    businessId: v.string(),
    submitterId: v.string(),
  },
  returns: v.union(v.object({ ... }), v.null()),
  handler: async (ctx, args) => { ... }
});
```

#### Behavior Change

| Step | Current | New |
|------|---------|-----|
| 1 | Return manager if `managerId` exists | No change |
| 2 | Find other finance_admin/owner | **Skip if submitter is employee** |
| 3 | Return null if none found | **Return submitter if manager/admin** |
| 4 | - | Return null only if employee without manager |

#### New Response Semantics

| Submitter Role | Has Manager | Result |
|----------------|-------------|--------|
| employee | yes | assigned manager |
| employee | no | `null` (blocked at submission) |
| manager | yes | assigned manager |
| manager | no | other admin/owner OR self |
| finance_admin | yes | assigned manager |
| finance_admin | no | other admin/owner OR self |
| owner | yes | assigned manager |
| owner | no | other admin/owner OR self |

---

### 2. `assignManager` Mutation

**File**: `convex/functions/memberships.ts`
**Type**: Mutation

#### Current Signature (unchanged)
```typescript
export const assignManager = mutation({
  args: {
    userId: v.id("users"),
    businessId: v.id("businesses"),
    managerId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => { ... }
});
```

#### New Validation

```typescript
// Add after existing permission checks
const targetMembership = await ctx.db
  .query("business_memberships")
  .withIndex("by_userId_businessId", q =>
    q.eq("userId", args.userId).eq("businessId", args.businessId))
  .first();

if (targetMembership?.role === 'employee' && args.managerId === null) {
  throw new Error("Employees must have a manager assigned");
}
```

#### New Error Response

```json
{
  "error": "Employees must have a manager assigned"
}
```

---

### 3. `updateRole` Mutation (if exists)

**File**: `convex/functions/memberships.ts`
**Type**: Mutation

#### New Validation

When changing role TO `employee`:
- Check if current `managerId` is null
- If null, reject with error requiring manager assignment first

```typescript
if (args.newRole === 'employee') {
  const membership = await ctx.db.get(membershipId);
  if (!membership.managerId) {
    throw new Error("Cannot assign employee role without a manager. Assign a manager first.");
  }
}
```

---

## REST API Changes

### POST `/api/v1/expense-claims/[id]/status`

**File**: `src/domains/expense-claims/lib/data-access.ts`

#### New Pre-Submission Validation

When `status: 'submitted'`:

```typescript
// Before calling findNextApprover
const submitterMembership = await convexClient.query(
  api.functions.memberships.getByUserAndBusiness,
  { userId: existingClaim.userId, businessId: userProfile.business_id }
);

if (submitterMembership.role === 'employee' && !submitterMembership.managerId) {
  return {
    success: false,
    error: 'MANAGER_REQUIRED',
    message: 'You cannot submit expense claims without an assigned manager. Please contact your administrator to assign you a manager.',
  };
}
```

#### New Error Response

```json
{
  "success": false,
  "error": "MANAGER_REQUIRED",
  "message": "You cannot submit expense claims without an assigned manager. Please contact your administrator to assign you a manager."
}
```

---

## UI Component Changes

### Team Management Select (Manager Dropdown)

**File**: `src/domains/account-management/components/teams-management-client.tsx`

#### New Validation Behavior

| User Role | Manager Select | Validation |
|-----------|---------------|------------|
| employee | Required | Block save if "No Manager" selected |
| manager | Optional | Allow "No Assignment" |
| finance_admin | Optional | Allow "No Assignment" |
| owner | N/A | No manager dropdown shown |

#### Visual Indicators

- Employee row without manager: Show warning icon
- Save button: Disabled when employee has no manager selected
- Error toast: "Employees must have a manager assigned"

---

## Backwards Compatibility

### Existing Claims
- Claims already in `submitted` status: No change
- Claims with `reviewed_by: null`: Will continue to exist (legacy)

### Existing Memberships
- Employees without managers: Can still exist in database
- Validation only enforced on NEW saves/role changes
- Submission blocked until manager assigned

### Migration (Optional)
Not required. Enforcement is at operation-time, not data-level.
