# Data Model: Batch Expense Submission

**Feature Branch**: `009-batch-receipt-submission`
**Date**: 2026-02-09

## Entity Overview

```
┌─────────────────────┐         ┌─────────────────────┐
│  expense_submissions │ 1 ──── * │   expense_claims     │
│  (NEW)              │         │   (EXTENDED)         │
└─────────────────────┘         └─────────────────────┘
        │                               │
        │ designatedApproverId          │ accountingEntryId
        ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│       users          │         │ accounting_entries   │
└─────────────────────┘         └─────────────────────┘
```

## Entity: `expense_submissions` (NEW)

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `v.id("businesses")` | Yes | Tenant scoping |
| `userId` | `v.id("users")` | Yes | Submitter/owner |
| `title` | `v.string()` | Yes | Display name (auto-generated or custom, e.g., "Submission - Feb 2026") |
| `description` | `v.optional(v.string())` | No | Optional notes about the submission |
| `status` | `submissionStatusValidator` | Yes | Workflow state (see State Transitions) |
| `rejectionReason` | `v.optional(v.string())` | No | Manager's reason for rejection |
| `claimNotes` | `v.optional(v.array(v.object({ claimId: v.id("expense_claims"), note: v.string() })))` | No | Per-claim notes from manager (on rejection) |
| `designatedApproverId` | `v.optional(v.id("users"))` | No | Target approver (set on submission) |
| `approvedBy` | `v.optional(v.id("users"))` | No | Who approved |
| `submittedAt` | `v.optional(v.number())` | No | Unix ms when submitted |
| `approvedAt` | `v.optional(v.number())` | No | Unix ms when approved |
| `rejectedAt` | `v.optional(v.number())` | No | Unix ms when rejected |
| `reimbursedAt` | `v.optional(v.number())` | No | Unix ms when all claims reimbursed (auto-set) |
| `deletedAt` | `v.optional(v.number())` | No | Soft delete timestamp |
| `updatedAt` | `v.optional(v.number())` | No | Last modification timestamp |

### Status Validator

```typescript
const submissionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("reimbursed"),
)
```

### Indexes

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_businessId` | `["businessId"]` | Tenant-scoped queries |
| `by_userId` | `["userId"]` | Employee's submissions list |
| `by_status` | `["status"]` | Status filtering |
| `by_designatedApproverId` | `["designatedApproverId"]` | Manager approval queue |
| `by_businessId_status` | `["businessId", "status"]` | Manager dashboard (all submitted in business) |
| `by_businessId_userId` | `["businessId", "userId"]` | Employee dashboard (my submissions in business) |

### Validation Rules

- `title`: 1-200 characters, auto-generated as "Submission - {MMM YYYY}" if not provided
- `status`: Must follow valid state transitions (see below)
- `businessId` + `userId`: User must be active member of business
- `designatedApproverId`: Set automatically on submission using existing routing logic
- Cannot submit if submission has zero claims
- Cannot submit if any claims are still in processing states (uploading, classifying, analyzing, extracting)
- Maximum 50 claims per submission

### State Transitions

```
                    ┌──────────────┐
                    │    draft     │ ← Initial state / Rejected resets here
                    └──────┬───────┘
                           │ submit (employee)
                           ▼
                    ┌──────────────┐
                    │  submitted   │
                    └──────┬───────┘
                          ╱ ╲
            approve      ╱   ╲      reject
           (manager)    ╱     ╲    (manager)
                       ▼       ▼
              ┌──────────┐  ┌──────────┐
              │ approved  │  │ rejected │──→ draft (employee corrects & resubmits)
              └─────┬─────┘  └──────────┘
                    │ auto (all claims reimbursed)
                    ▼
              ┌──────────────┐
              │  reimbursed  │ ← Terminal state (derived)
              └──────────────┘
```

**Transition Rules:**

| From | To | Actor | Conditions |
|------|----|-------|------------|
| `draft` | `submitted` | Employee | ≥1 claim, all claims processed (no uploading/analyzing states), sets `submittedAt`, resolves `designatedApproverId` |
| `submitted` | `approved` | Manager | Only `designatedApproverId` can approve, sets `approvedBy` + `approvedAt`, creates accounting entries for each claim |
| `submitted` | `rejected` | Manager | Only `designatedApproverId` can reject, sets `rejectedAt` + `rejectionReason`, resets all claims to draft |
| `rejected` | `draft` | System | Automatic on rejection — submission returns to draft, employee can edit and resubmit |
| `approved` | `reimbursed` | System | Automatic when all contained claims reach `reimbursed` status, sets `reimbursedAt` |

**Derived Properties (computed, not stored):**

| Property | Computation |
|----------|-------------|
| `claimCount` | Count of `expense_claims` where `submissionId === this._id` |
| `totalsByCurrency` | Group claims by `currency`, sum `totalAmount` per group |
| `reimbursementProgress` | `{reimbursed: N, total: M}` — count claims with status "reimbursed" vs total |
| `hasProcessingClaims` | Any claim in uploading/classifying/analyzing/extracting/processing state |
| `hasFailedClaims` | Any claim in failed/classification_failed state |

## Entity: `expense_claims` (EXTENDED)

### New/Modified Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `submissionId` | `v.optional(v.id("expense_submissions"))` | No* | Reference to parent submission. Required for new claims, optional for pre-migration claims. |

*Note: `v.optional()` for backward compatibility. New claims MUST have a `submissionId`. Pre-existing claims without `submissionId` are either migrated (draft) or left as-is (non-draft terminal states).

### New Index

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_submissionId` | `["submissionId"]` | Fetch all claims in a submission |

### Behavioral Changes

- **Status transitions on submission-level actions:**
  - When submission is submitted: all claims transition `draft → submitted`
  - When submission is approved: all claims transition `submitted → approved` (with accounting entry creation per claim)
  - When submission is rejected: all claims transition `submitted → draft`
- **Individual claim processing** (upload, classify, extract) remains unchanged — operates on individual claims as before
- **Individual claim editing** only allowed when parent submission is in `draft` status
- **Claim deletion** from a submission: removes `submissionId` reference and soft-deletes the claim

## Migration Plan

### Phase 1: Schema Extension
1. Add `expense_submissions` table to `convex/schema.ts`
2. Add `submissionId` field (optional) to `expense_claims` table
3. Add `by_submissionId` index to `expense_claims`
4. Deploy schema changes via `npx convex deploy`

### Phase 2: Data Migration
1. Run `internalMutation` to query all `expense_claims` where `submissionId === undefined` and `status === "draft"`
2. For each draft claim: create an `expense_submission` with auto-generated title, link claim via `submissionId`
3. Non-draft claims (submitted, approved, reimbursed, rejected) are NOT migrated — they're in terminal/processing states and don't need the batch UX

### Phase 3: Frontend Cutover
1. Replace `ExpenseSubmissionFlow` modal with redirect to new submission page
2. Update `PersonalExpenseDashboard` to show submissions list instead of individual claims
3. Update `ExpenseApprovalDashboard` to show submissions in approval queue
