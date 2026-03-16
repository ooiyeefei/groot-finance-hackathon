# Contract: Status Polling for Issued E-Invoices

## Lambda Extension (lhdn-polling/handler.ts)

### New Pass: Check Issued Document Status Changes

**Trigger**: EventBridge every 5 minutes (existing schedule)

**Input** (from Convex query):
```typescript
interface IssuedInvoiceForPolling {
  invoiceId: string
  businessId: string
  lhdnSubmissionId: string
  lhdnDocumentUuid: string
  lhdnStatus: "valid"
  lhdnValidatedAt: number  // must be within 72h
}
```

**Flow**:
1. Query Convex: `getIssuedInvoicesForStatusPolling` — returns invoices with `lhdnStatus: "valid"` and `lhdnValidatedAt > (now - 72h)`
2. Group by business
3. For each business: authenticate with LHDN, call `getSubmissionStatus(submissionUid)` per unique submission
4. For each document in response: check for rejection (`rejectRequestDateTime`) or cancellation (`cancelDateTime` + `status: "Cancelled"`)
5. If status changed: call Convex mutation `updateLhdnStatusFromPoll`

**Output** (Convex mutation):
```typescript
interface StatusChangeUpdate {
  invoiceId: string
  newStatus: "rejected" | "cancelled_by_buyer"
  reason?: string
  timestamp: number
  hasPostedJournalEntry: boolean  // determines if reviewRequired flag is set
}
```

## Convex Query: getIssuedInvoicesForStatusPolling

**Input**: none (internal query, all businesses)
**Output**: `IssuedInvoiceForPolling[]`
**Filter**: `lhdnStatus === "valid" AND lhdnValidatedAt > (Date.now() - 72 * 60 * 60 * 1000)`

## Convex Mutation: updateLhdnStatusFromPoll

**Input**: `StatusChangeUpdate`
**Side effects**:
- Update `sales_invoices` record
- Set `lhdnReviewRequired: true` if invoice has posted journal entries
- Create notification (type: `lhdn_submission`, severity: `warning`)
