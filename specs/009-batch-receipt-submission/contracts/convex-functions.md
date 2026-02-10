# Convex Function Contracts: Expense Submissions

**Feature Branch**: `009-batch-receipt-submission`
**File**: `convex/functions/expenseSubmissions.ts`

## Queries

### `list`

List expense submissions for a business with role-based filtering.

```typescript
export const list = query({
  args: {
    businessId: v.string(),         // Convex ID or legacy UUID
    status: v.optional(v.string()), // Filter by status
    limit: v.optional(v.number()),  // Default 20
    cursor: v.optional(v.string()), // Pagination
  },
  returns: v.array(v.object({
    _id: v.id("expense_submissions"),
    title: v.string(),
    status: v.string(),
    userId: v.id("users"),
    submitterName: v.string(),      // Enriched from users table
    claimCount: v.number(),         // Computed
    totalsByCurrency: v.array(v.object({
      currency: v.string(),
      total: v.number(),
    })),
    reimbursementProgress: v.optional(v.object({
      reimbursed: v.number(),
      total: v.number(),
    })),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    _creationTime: v.number(),
  })),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve businessId
    // 3. RBAC: employees see own, managers see direct reports, admins see all
    // 4. Query expense_submissions with filters
    // 5. Enrich with computed fields (claim count, totals)
    // 6. Return sorted by most recent
  },
})
```

### `getById`

Get a single submission with all details.

```typescript
export const getById = query({
  args: {
    id: v.string(),                 // Submission ID
  },
  returns: v.object({
    submission: v.object({/* full submission fields */}),
    claims: v.array(v.object({/* expense claim with brief fields */})),
    submitter: v.object({ name: v.string(), email: v.string() }),
    approver: v.optional(v.object({ name: v.string(), email: v.string() })),
  }),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve submission by ID
    // 3. Verify access (owner, manager, or admin)
    // 4. Fetch all claims via by_submissionId index
    // 5. Compute totals, reimbursement progress
    // 6. Enrich with user names
    // 7. Return submission + claims + actors
  },
})
```

### `getPendingApprovals`

List submissions awaiting the current user's approval.

```typescript
export const getPendingApprovals = query({
  args: {
    businessId: v.string(),
  },
  returns: v.array(v.object({
    _id: v.id("expense_submissions"),
    title: v.string(),
    submitterName: v.string(),
    claimCount: v.number(),
    totalsByCurrency: v.array(v.object({
      currency: v.string(),
      total: v.number(),
    })),
    submittedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Query submissions where designatedApproverId === currentUser and status === "submitted"
    // 3. Enrich with computed fields
    // 4. Sort by submittedAt ascending (oldest first)
  },
})
```

## Mutations

### `create`

Create a new draft submission.

```typescript
export const create = mutation({
  args: {
    businessId: v.string(),
    title: v.optional(v.string()),  // Auto-generated if not provided
  },
  returns: v.id("expense_submissions"),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve businessId, verify membership
    // 3. Generate title if not provided: "Submission - {MMM YYYY}"
    // 4. Insert expense_submissions record with status "draft"
    // 5. Return new submission ID
  },
})
```

### `update`

Update submission fields (draft only).

```typescript
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve submission, verify ownership
    // 3. Verify status === "draft"
    // 4. Patch fields
  },
})
```

### `submit`

Submit a draft submission for manager approval.

```typescript
export const submit = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user, verify ownership
    // 2. Verify status === "draft"
    // 3. Fetch all claims via by_submissionId index
    // 4. Validate: ≥1 claim, no claims in processing states
    // 5. Resolve designatedApproverId using existing routing logic:
    //    a. Check assigned manager from business_memberships
    //    b. Fallback to finance_admin/owner
    //    c. Self-approval for managers/admins
    // 6. Update submission: status → "submitted", set submittedAt, designatedApproverId
    // 7. Update all claims: status → "submitted", set submittedAt, designatedApproverId
    // 8. Send notification to designated approver
  },
})
```

### `approve`

Approve an entire submission (manager action).

```typescript
export const approve = mutation({
  args: {
    id: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve submission, verify designatedApproverId === currentUser
    // 3. Verify status === "submitted"
    // 4. Fetch all claims via by_submissionId index
    // 5. For each claim:
    //    a. Update status → "approved"
    //    b. Set approvedBy, approvedAt
    //    c. Create accounting entry (existing logic from expenseClaims.updateStatus)
    //    d. Link accountingEntryId back to claim
    // 6. Update submission: status → "approved", set approvedBy, approvedAt
    // 7. Send approval notification to employee
  },
})
```

### `reject`

Reject an entire submission (manager action).

```typescript
export const reject = mutation({
  args: {
    id: v.string(),
    reason: v.string(),
    claimNotes: v.optional(v.array(v.object({
      claimId: v.string(),
      note: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user
    // 2. Resolve submission, verify designatedApproverId === currentUser
    // 3. Verify status === "submitted"
    // 4. Fetch all claims, reset each to status → "draft"
    // 5. Update submission: status → "draft", set rejectionReason, claimNotes, rejectedAt
    //    Note: submission goes back to "draft" (not a separate "rejected" state for display purposes,
    //    but rejectedAt + rejectionReason indicate it was rejected)
    // 6. Send rejection notification to employee
  },
})
```

### `softDelete`

Soft-delete a draft submission and unlink its claims.

```typescript
export const softDelete = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user, verify ownership
    // 2. Verify status === "draft"
    // 3. Soft-delete all linked claims (set deletedAt)
    // 4. Set submission deletedAt
  },
})
```

### `removeClaim`

Remove a claim from a submission.

```typescript
export const removeClaim = mutation({
  args: {
    submissionId: v.string(),
    claimId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate user, verify submission ownership
    // 2. Verify submission status === "draft"
    // 3. Soft-delete the claim (set deletedAt, clear submissionId)
  },
})
```

## Internal Functions

### `cleanupEmptyDrafts`

Scheduled cleanup of abandoned empty submissions.

```typescript
export const cleanupEmptyDrafts = internalMutation({
  handler: async (ctx) => {
    // 1. Query expense_submissions where status === "draft"
    // 2. For each: count claims via by_submissionId index
    // 3. If count === 0 and _creationTime < Date.now() - 24h:
    //    a. Hard-delete the submission
    // 4. Log count of deleted submissions
  },
})
```

### `checkReimbursementComplete`

Check if all claims in a submission are reimbursed and auto-transition.

```typescript
export const checkReimbursementComplete = internalMutation({
  args: {
    submissionId: v.id("expense_submissions"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch submission
    // 2. Verify status === "approved"
    // 3. Fetch all claims via by_submissionId
    // 4. If all claims have status === "reimbursed":
    //    a. Update submission status → "reimbursed", set reimbursedAt
  },
})
```

### `migrateDraftClaims`

One-time migration for pre-existing draft claims.

```typescript
export const migrateDraftClaims = internalMutation({
  handler: async (ctx) => {
    // 1. Query expense_claims where submissionId === undefined and status === "draft"
    // 2. For each claim:
    //    a. Create expense_submission with auto-title
    //    b. Set claim.submissionId to new submission ID
    // 3. Log count of migrated claims
  },
})
```

## Cron Jobs

### Addition to `convex/crons.ts`

```typescript
// Empty draft submission cleanup — runs every hour
crons.interval(
  "cleanup empty draft submissions",
  { hours: 1 },
  internal.functions.expenseSubmissions.cleanupEmptyDrafts
)
```
