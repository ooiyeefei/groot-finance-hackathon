# Data Model: LHDN E-Invoice Buyer Rejection Flow

**Date**: 2026-03-16
**Feature**: 023-einv-buyer-rejection-flow

## Entity Relationship Diagram

```
┌─────────────────────────────────┐
│ einvoice_received_documents     │
│─────────────────────────────────│
│ _id: Id<"...">                  │
│ businessId: Id<"businesses">    │
│ lhdnDocumentUuid: string        │◄──── Primary key for LHDN API operations
│ status: "valid" | "rejected"    │
│ dateTimeValidated: string       │◄──── ISO 8601, used for 72-hour window
│                                 │
│ // Rejection metadata           │
│ rejectedAt?: number             │◄──── Unix timestamp (ms)
│ rejectionReason?: string        │◄──── Free-text reason (required at rejection)
│ rejectedByUserId?: string       │◄──── Clerk user ID of rejector
│                                 │
│ // Links to other entities      │
│ matchedInvoiceId?: Id<"...">    │◄──── NEW: Links to AP invoice (primary)
│ matchedExpenseClaimId?: Id<..>  │◄──── Links to expense claim (secondary)
└─────────────────────────────────┘
           │                  │
           │ 0..1             │ 0..1
           ▼                  ▼
┌──────────────────┐   ┌──────────────────┐
│ invoices         │   │ expense_claims   │
│  (AP module)     │   │  (Expense module)│
│──────────────────│   │──────────────────│
│ _id              │   │ _id              │
│ vendorId         │   │ createdBy        │
│ amount           │   │ amount           │
│ status           │   │ status           │
│                  │   │                  │
│ // E-invoice ref │   │ // E-invoice ref │
│ einvoiceUuid?    │   │ einvoiceAttached │
│ einvoiceRejected?│   │ lhdnReceivedStatus
│                  │   │ lhdnReceivedDocumentUuid
└──────────────────┘   └──────────────────┘
           │                  │
           └──────┬───────────┘
                  │ notifyOn(rejection)
                  ▼
         ┌─────────────────┐
         │ notifications   │
         │─────────────────│
         │ _id             │
         │ userId          │◄──── invoice.createdBy OR claim.createdBy
         │ type            │◄──── "lhdn_submission"
         │ severity        │◄──── "warning"
         │ title           │◄──── "E-Invoice Rejected"
         │ message         │◄──── "{supplier} e-invoice rejected: {reason}"
         │ link            │◄──── Deep link to invoice/claim
         │ createdAt       │
         └─────────────────┘
```

---

## Entity Definitions

### 1. `einvoice_received_documents` (Convex Table)

**Purpose**: Stores e-invoices received from suppliers via LHDN MyInvois API.

**Schema** (already defined in 022-einvoice-lhdn-buyer-flows):
```typescript
{
  businessId: v.id("businesses"),
  lhdnDocumentUuid: v.string(),                      // LHDN UUID (26-char)
  lhdnLongId: v.optional(v.string()),                // For QR code verification
  supplierTin: v.optional(v.string()),
  supplierName: v.optional(v.string()),
  buyerTin: v.optional(v.string()),
  total: v.optional(v.number()),
  dateTimeIssued: v.optional(v.string()),            // ISO 8601
  dateTimeValidated: v.optional(v.string()),         // ISO 8601 — CRITICAL for 72-hour window
  status: v.union(v.literal("valid"), v.literal("cancelled"), v.literal("rejected")),

  // Rejection metadata (NEW in this feature)
  rejectedAt: v.optional(v.number()),                // Unix timestamp (ms)
  rejectionReason: v.optional(v.string()),           // Free-text reason
  rejectedByUserId: v.optional(v.string()),          // Clerk user ID

  // Matching links
  matchedExpenseClaimId: v.optional(v.id("expense_claims")),  // Existing
  matchedInvoiceId: v.optional(v.id("invoices")),             // NEW (planned, not yet in schema)
  matchTier: v.optional(v.union(...)),               // Matching algorithm tier
  matchConfidence: v.optional(v.number()),           // 0-1 confidence score

  processedAt: v.number(),
}
```

**Indexes**:
- `by_businessId_status`: Query valid/rejected documents for a business
- `by_lhdnDocumentUuid`: Lookup by LHDN UUID (for API route)
- `by_matchedExpenseClaimId`: Find e-invoice for a claim
- `by_matchedInvoiceId`: (NEW) Find e-invoice for an AP invoice

**Validation Rules**:
1. **Rejection requires**: `status === "valid"` before transition to `"rejected"`
2. **72-hour window**: `Date.now() <= new Date(dateTimeValidated).getTime() + (72 * 60 * 60 * 1000)`
3. **Reason non-empty**: `rejectionReason.trim().length > 0`
4. **Idempotency**: If `status === "rejected"`, reject request succeeds immediately (no LHDN API call)

**State Transitions**:
```
         ┌────────┐
   ┌────►│ valid  │────┐
   │     └────────┘    │
   │                   │ reject()
   │                   ▼
   │              ┌───────────┐
   │              │ rejected  │ (terminal)
   │              └───────────┘
   │
   │ cancel()
   ▼
┌───────────┐
│ cancelled │ (terminal)
└───────────┘
```

**Lifecycle**:
1. Created by LHDN polling Lambda with `status: "valid"`
2. Matched to expense claim or AP invoice (async process)
3. User rejects within 72 hours → `status: "rejected"`, metadata populated
4. After 72 hours: `status` remains "valid" (no rejection allowed)

---

### 2. `invoices` (Convex Table — AP Module)

**Purpose**: Tracks supplier invoices (Accounts Payable).

**Relevant Fields** (existing table, extend with e-invoice references):
```typescript
{
  _id: v.id("invoices"),
  businessId: v.id("businesses"),
  vendorId: v.id("vendors"),
  amount: v.number(),
  invoiceNumber: v.string(),
  status: v.union(...),                  // "draft", "approved", "paid", etc.
  createdBy: v.string(),                 // Clerk user ID — recipient of rejection notification

  // E-invoice reference (NEW fields, not yet in schema)
  einvoiceUuid: v.optional(v.string()),           // Link to LHDN document
  einvoiceRejected: v.optional(v.boolean()),      // Quick flag for UI
  einvoiceRejectionReason: v.optional(v.string()),
  einvoiceRejectedAt: v.optional(v.number()),
}
```

**Update Pattern on Rejection**:
```typescript
// When einvoice_received_documents.matchedInvoiceId points to this invoice
await ctx.db.patch(invoiceId, {
  einvoiceRejected: true,
  einvoiceRejectionReason: reason,
  einvoiceRejectedAt: Date.now(),
})
```

**UI Impact**:
- Invoice detail page shows "E-Invoice Rejected" badge
- Rejection reason displayed to user
- User can request corrected e-invoice from vendor

---

### 3. `expense_claims` (Convex Table — Expense Claims Module)

**Purpose**: Tracks employee expense reimbursement requests.

**Relevant Fields** (existing table, no schema changes needed):
```typescript
{
  _id: v.id("expense_claims"),
  businessId: v.id("businesses"),
  createdBy: v.string(),                 // Clerk user ID — recipient of rejection notification
  amount: v.number(),
  status: v.union(...),                  // "draft", "pending", "approved", etc.

  // E-invoice reference (existing fields from 019-lhdn-einv-flow-2)
  einvoiceAttached: v.optional(v.boolean()),
  lhdnReceivedDocumentUuid: v.optional(v.string()),
  lhdnReceivedStatus: v.optional(v.string()),     // "valid", "rejected", "cancelled"
  lhdnReceivedAt: v.optional(v.number()),
  einvoiceRequestStatus: v.optional(v.string()),  // "requested", "received", etc.
}
```

**Update Pattern on Rejection**:
```typescript
// When einvoice_received_documents.matchedExpenseClaimId points to this claim
await ctx.db.patch(claimId, {
  einvoiceAttached: false,                  // Clear attachment flag
  lhdnReceivedStatus: "rejected",           // Update status
  // lhdnReceivedDocumentUuid preserved for audit trail
})
```

**UI Impact**:
- Expense claim detail page shows "E-Invoice Rejected" status
- Rejection reason shown (fetched from `einvoice_received_documents`)
- Employee can request new e-invoice or upload manual receipt

---

### 4. `notifications` (Convex Table)

**Purpose**: In-app notification system (real-time updates via Convex subscriptions).

**Schema** (existing table, no changes needed):
```typescript
{
  _id: v.id("notifications"),
  userId: v.string(),                    // Clerk user ID (recipient)
  businessId: v.id("businesses"),
  type: v.string(),                      // "lhdn_submission" (covers rejection events)
  severity: v.string(),                  // "info", "warning", "error"
  title: v.string(),
  message: v.string(),
  link: v.optional(v.string()),          // Deep link to related resource
  read: v.boolean(),
  createdAt: v.number(),
}
```

**Notification Creation Pattern**:
```typescript
await ctx.db.insert("notifications", {
  userId: recipientUserId,               // invoice.createdBy OR claim.createdBy
  businessId: businessId,
  type: "lhdn_submission",
  severity: "warning",                   // Rejection is non-blocking
  title: "E-Invoice Rejected",
  message: `E-invoice from ${supplierName} was rejected: ${reason}`,
  link: `/expense-claims/${claimId}`,    // OR `/invoices/${invoiceId}`
  read: false,
  createdAt: Date.now(),
})
```

**Recipient Determination Logic**:
```typescript
// In rejectReceivedDocument mutation
if (doc.matchedInvoiceId) {
  const invoice = await ctx.db.get(doc.matchedInvoiceId)
  if (invoice) {
    await createRejectionNotification(invoice.createdBy, `/invoices/${invoice._id}`)
  }
} else if (doc.matchedExpenseClaimId) {
  const claim = await ctx.db.get(doc.matchedExpenseClaimId)
  if (claim) {
    await createRejectionNotification(claim.createdBy, `/expense-claims/${claim._id}`)
  }
}
// If neither linked, no notification (orphan document)
```

---

## Data Integrity Constraints

### 1. Rejection Window Enforcement
- **Rule**: Rejection only allowed within 72 hours of `dateTimeValidated`
- **Enforcement**: Server-side validation in API route AND Convex mutation (defense-in-depth)
- **Edge case**: If `dateTimeValidated` is missing, reject with error (data quality issue)

### 2. Status Transition Integrity
- **Rule**: Only `"valid"` documents can be rejected
- **Enforcement**: Mutation checks `doc.status === "valid"` before LHDN API call
- **Idempotency**: If `doc.status === "rejected"`, return success immediately (already rejected)

### 3. Reason Required
- **Rule**: `rejectionReason` must be non-empty
- **Enforcement**: API route validates `reason.trim().length > 0` before mutation call
- **UI**: Textarea required field, submit button disabled if empty

### 4. Link Consistency
- **Rule**: A document can link to AP invoice OR expense claim, not both simultaneously (in practice)
- **Note**: Schema allows both links for grey area cases (defer duplicate detection to separate feature)
- **Handling**: Mutation updates whichever link is present; if both exist, updates both

### 5. Audit Trail Preservation
- **Rule**: Never delete rejection metadata once set
- **Rationale**: Regulatory compliance, audit requirements
- **Implementation**: No mutation deletes `rejectedAt`, `rejectionReason`, `rejectedByUserId` fields

---

## Performance Considerations

### Query Optimization
- **Index coverage**: All queries use existing indexes (no full table scans)
- **Pagination**: List queries limited to 100 documents per page
- **Real-time updates**: Convex subscriptions automatically push status changes to UI

### LHDN API Rate Limiting
- **Limit**: 12 requests per minute (shared with cancellation)
- **Mitigation**: Idempotency check prevents duplicate API calls
- **Retry strategy**: Exponential backoff (5s, 10s, 20s) for 429 errors

### Notification Delivery
- **Target**: <10s from rejection to notification display
- **Mechanism**: Convex real-time subscriptions (WebSocket-based)
- **Fallback**: Polling every 30s if WebSocket connection lost

---

## Migration Notes

**Schema Changes Required**:
1. Add `matchedInvoiceId` field to `einvoice_received_documents` (new index)
2. Add e-invoice reference fields to `invoices` table (optional fields, no migration needed)

**Data Backfill**:
- No backfill needed — all new fields are optional
- Existing `einvoice_received_documents` records remain valid

**Backward Compatibility**:
- Existing expense claim rejection flow unchanged
- New AP invoice rejection flow is additive (no breaking changes)

---

## Testing Data Setup

### Test Scenarios

**Scenario 1: Valid rejection within window**
```typescript
{
  lhdnDocumentUuid: "test-doc-001",
  status: "valid",
  dateTimeValidated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
  matchedExpenseClaimId: "test-claim-001",
}
// Expected: Rejection succeeds, claim updated, notification sent
```

**Scenario 2: Rejection after window expired**
```typescript
{
  lhdnDocumentUuid: "test-doc-002",
  status: "valid",
  dateTimeValidated: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(), // 73 hours ago
  matchedExpenseClaimId: "test-claim-002",
}
// Expected: Rejection fails with "window expired" error
```

**Scenario 3: Idempotent rejection**
```typescript
{
  lhdnDocumentUuid: "test-doc-003",
  status: "rejected",
  rejectedAt: Date.now() - 1000,
  rejectionReason: "Duplicate invoice",
  matchedExpenseClaimId: "test-claim-003",
}
// Expected: Rejection succeeds immediately (no LHDN API call), returns existing data
```

**Scenario 4: Orphan document rejection**
```typescript
{
  lhdnDocumentUuid: "test-doc-004",
  status: "valid",
  dateTimeValidated: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
  matchedInvoiceId: undefined,
  matchedExpenseClaimId: undefined,
}
// Expected: Rejection succeeds, no side effects (no linked records), no notification
```

---

## References

- Convex Schema: `convex/schema.ts` (line 610: `einvoice_received_documents`)
- Existing Mutations: `convex/functions/einvoiceReceivedDocuments.ts`
- AP Invoices: `convex/functions/invoices.ts`
- Expense Claims: `convex/functions/expenseClaims.ts` (line 2691: `resolveEinvoiceMatch`)
- Notifications: `convex/functions/notifications.ts`
