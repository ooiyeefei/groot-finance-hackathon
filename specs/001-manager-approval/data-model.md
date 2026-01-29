# Data Model: Manager Approval Workflow Enforcement

**Feature**: 001-manager-approval
**Date**: 2026-01-29

## Overview

No schema changes required. This feature leverages existing data structures with enhanced validation rules.

---

## Existing Entities (No Changes)

### business_memberships

**Purpose**: Links users to businesses with role and manager assignment

```typescript
// convex/schema.ts - existing structure
business_memberships: defineTable({
  userId: v.id("users"),
  businessId: v.id("businesses"),
  managerId: v.optional(v.id("users")),  // Manager assignment
  role: membershipRoleValidator,          // 'employee' | 'manager' | 'finance_admin' | 'owner'
  status: membershipStatusValidator,      // 'active' | 'inactive'
  joinedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
```

**Indexes used**:
- `by_userId_businessId` - lookup membership by user and business
- `by_businessId` - get all members of a business

### expense_claims

**Purpose**: Stores expense claim data including workflow status

```typescript
// convex/schema.ts - existing structure (relevant fields)
expense_claims: defineTable({
  userId: v.id("users"),           // Submitter
  businessId: v.id("businesses"),
  status: expenseStatusValidator,  // 'draft' | 'submitted' | 'approved' | 'rejected' | ...
  processingMetadata: v.optional(v.object({
    submitted_at: v.optional(v.string()),
    reviewed_by: v.optional(v.string()),  // Approver user ID
    // ... other metadata
  })),
  approvedBy: v.optional(v.id("users")),
  approvedAt: v.optional(v.number()),
  // ... other fields
})
```

---

## New Validation Rules

### Rule 1: Employee Manager Requirement

**Entity**: `business_memberships`
**Condition**: When `role === 'employee'`
**Requirement**: `managerId` MUST be non-null and reference an active user with approval permissions

**Enforcement Points**:
1. `assignManager` mutation - reject null managerId for employees
2. `updateRole` mutation - require managerId when changing to employee role
3. Team Management UI - disable save without manager selection

### Rule 2: Submission Eligibility

**Entity**: `expense_claims` (via `business_memberships`)
**Condition**: When status changes from `draft` to `submitted`
**Requirement**: If submitter role is `employee`, their `managerId` MUST be non-null

**Enforcement Points**:
1. `data-access.ts` - pre-submission validation
2. Error message with guidance returned to UI

### Rule 3: Approver Routing

**Entity**: `expense_claims.processingMetadata.reviewed_by`
**Condition**: When claim is submitted
**Requirement**: Must have valid approver (never null for submitted claims)

**Routing Logic**:
```
1. submitter.managerId exists → reviewed_by = managerId
2. submitter.role === 'employee' → BLOCK (no manager)
3. find other finance_admin/owner → reviewed_by = that user
4. submitter is manager/admin → reviewed_by = submitter (self-approval)
5. none found → BLOCK (edge case - should not happen)
```

---

## State Transitions

### Expense Claim Status

```
draft → submitted → approved → reimbursed
                 ↘ rejected
```

**New Constraint on `draft → submitted`**:
- Employee submitter MUST have managerId assigned
- Non-employee submitter: no constraint (self-approval available)

### Manager Assignment

```
none → assigned → changed → removed
```

**New Constraint on transitions TO `none`**:
- If user role is `employee`: BLOCKED
- If user role is non-employee: ALLOWED

---

## Relationships

```
business_memberships
    ├── userId → users._id
    ├── businessId → businesses._id
    └── managerId → users._id (optional, required for employees)

expense_claims
    ├── userId → users._id (submitter)
    ├── businessId → businesses._id
    ├── approvedBy → users._id (optional)
    └── processingMetadata.reviewed_by → users.legacyId (string, for routing)
```

---

## Query Patterns

### Check Employee Has Manager

```typescript
// Used before submission
const membership = await ctx.db
  .query("business_memberships")
  .withIndex("by_userId_businessId", q =>
    q.eq("userId", userId).eq("businessId", businessId))
  .first();

const hasManager = membership?.role !== 'employee' || membership?.managerId != null;
```

### Find Next Approver (Updated Logic)

```typescript
// Step 1: Check for assigned manager
if (submitterMembership.managerId) {
  return ctx.db.get(submitterMembership.managerId);
}

// Step 2: Block employees without manager
if (submitterMembership.role === 'employee') {
  return null; // Will be blocked at submission layer
}

// Step 3: Find other admin/owner
const otherApprover = allMemberships.find(m =>
  (m.role === 'owner' || m.role === 'finance_admin') &&
  m.userId !== submitter._id &&
  m.status === 'active'
);
if (otherApprover) {
  return ctx.db.get(otherApprover.userId);
}

// Step 4: Self-approval for managers/admins
return submitter; // Self-approval fallback
```

### Get Manager's Approval Queue

```typescript
// Existing logic - already correct
const directReports = allMemberships.filter(m => m.managerId === user._id);
const reportIds = new Set(directReports.map(m => m.userId));
reportIds.add(user._id); // Include own claims for self-approval
claims = claims.filter(claim => reportIds.has(claim.userId));
```
