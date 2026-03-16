# Research: LHDN E-Invoice Buyer Rejection Flow

**Date**: 2026-03-16
**Feature**: 023-einv-buyer-rejection-flow

## Overview

This document consolidates research findings for implementing the LHDN e-invoice buyer rejection flow. All technical unknowns from the planning phase have been resolved through codebase analysis and LHDN API documentation review.

---

## 1. LHDN API Rejection Endpoint

### Decision
Use `PUT /api/v1.0/documents/state/{uuid}/state` with `{ status: "rejected", reason: string }` body.

### Rationale
- Same endpoint as cancellation (already implemented in codebase)
- LHDN API design: Single state-change endpoint handles both cancellation and rejection
- Status field differentiates: `"cancelled"` (issuer-initiated) vs `"rejected"` (buyer-initiated)
- Rate limit is shared (12 RPM) across all document state operations

### Alternatives Considered
- **Separate rejection endpoint**: LHDN does not provide one; must use state-change endpoint
- **Manual MyInvois portal flow**: User friction, breaks Groot workflow (the problem we're solving)

### Implementation Notes
- Reuse existing `lhdnFetch()` helper from `src/lib/lhdn/client.ts`
- Follow `cancelDocument()` pattern (line 186): same signature, different status value
- Error handling: 400 (invalid state), 404 (document not found), 429 (rate limit)

---

## 2. Convex Mutation Pattern for Rejection

### Decision
Use `internalMutation` for `rejectReceivedDocument` + public API route pattern.

### Rationale
- Security: Prevents direct Convex mutation calls bypassing role-based access control
- Auth boundary: API route enforces Clerk auth + role validation (owner/finance_admin/manager only)
- Audit trail: All rejections go through API layer, easier to log and monitor
- Consistency: Matches existing expense claims pattern (`resolveEinvoiceMatch` is internal, called by API route)

### Alternatives Considered
- **Public mutation**: Security risk — any authenticated user could call directly
- **Convex action**: Cannot use `ctx.db` for transactional updates, requires separate mutation calls

### Implementation Notes
- Mutation signature: `rejectReceivedDocument({ documentUuid, reason, userId })`
- Validation: Check status = "valid", within 72-hour window, reason non-empty
- Side effects: Update linked AP invoice OR expense claim (conditional based on `matchedInvoiceId` vs `matchedExpenseClaimId`)
- Notification: Call `createRejectionNotification()` helper after successful update

---

## 3. 72-Hour Window Calculation

### Decision
Store `dateTimeValidated` (ISO 8601 string from LHDN), calculate expiry client-side and server-side.

### Rationale
- LHDN provides validation timestamp in API response (`dateTimeValidated` field)
- 72-hour rule is LHDN regulatory requirement (cannot be changed)
- Client-side: For UI countdown display (UX requirement from spec)
- Server-side: For enforcement validation (security — prevent expired rejections)

### Alternatives Considered
- **Store expiry timestamp directly**: Redundant storage, harder to debug if LHDN changes rules
- **Client-side validation only**: Security risk — users could bypass with browser dev tools

### Implementation Notes
- Client calculation: `const expiryMs = new Date(dateTimeValidated).getTime() + (72 * 60 * 60 * 1000)`
- Server validation: `if (Date.now() > expiryMs) throw new Error("Rejection window expired")`
- Countdown update interval: 30 seconds (balance between UX freshness and performance)
- Edge case handling: Reject request if expiry occurs between dialog open and API call

---

## 4. Notification System Integration

### Decision
Use existing `notifications` table with type `"lhdn_submission"` and severity `"warning"`.

### Rationale
- Infrastructure already exists (real-time Convex subscriptions update UI)
- Type `"lhdn_submission"` covers all LHDN-related events (validation, cancellation, rejection)
- Severity `"warning"` is appropriate (rejection is non-blocking, user can obtain corrected invoice)
- Recipient determination: Query `matchedInvoiceId` → get `createdBy` OR query `matchedExpenseClaimId` → get `createdBy`

### Alternatives Considered
- **New notification type**: Unnecessary complexity, increases maintenance burden
- **Email notifications**: Out of scope (spec explicitly defers to separate notification preferences feature)

### Implementation Notes
- Notification title: `"E-Invoice Rejected"`
- Notification message: `"E-invoice from {supplierName} was rejected: {reason}"`
- Link: `/expense-claims/{claimId}` OR `/invoices/{invoiceId}` (deep link to affected record)
- No email fallback in initial implementation (deferred per spec scope boundaries)

---

## 5. AP Invoice vs Expense Claim Link Determination

### Decision
Check `matchedInvoiceId` first (AP primary), fallback to `matchedExpenseClaimId` (expense claims secondary).

### Rationale
- Clarification session confirmed: AP invoices are primary use case (B2B supplier e-invoices)
- Expense claims are secondary (grey area — small merchants issuing LHDN e-invoices for employee purchases)
- Schema supports both: `einvoice_received_documents` has both fields (line 628: `matchedExpenseClaimId`, future: `matchedInvoiceId`)

### Alternatives Considered
- **Expense claims only**: Misses primary B2B use case (buyer rejecting vendor invoices)
- **Force single link**: Prevents handling grey area cases where small merchants use LHDN

### Implementation Notes
- Mutation logic:
  ```typescript
  if (doc.matchedInvoiceId) {
    await updateInvoiceRejectionStatus(doc.matchedInvoiceId, reason)
    const invoice = await getInvoice(doc.matchedInvoiceId)
    await notifyUser(invoice.createdBy, "Invoice e-invoice rejected")
  } else if (doc.matchedExpenseClaimId) {
    await updateClaimRejectionStatus(doc.matchedExpenseClaimId)
    const claim = await getClaim(doc.matchedExpenseClaimId)
    await notifyUser(claim.createdBy, "Claim e-invoice rejected")
  }
  // If neither linked, no side effects (orphan rejection)
  ```

---

## 6. Idempotency for Concurrent Rejections

### Decision
Check document status at start of API route handler; return early if already rejected.

### Rationale
- Prevents duplicate LHDN API calls if user clicks "Reject" multiple times rapidly
- Protects against LHDN rate limit violations (12 RPM shared with cancellation)
- Provides better UX (immediate success response if already rejected, no LHDN roundtrip)

### Alternatives Considered
- **Pessimistic locking**: Convex doesn't support row-level locks, would need complex workaround
- **No idempotency**: Risk of LHDN rate limit errors, poor UX if user double-clicks

### Implementation Notes
- API route logic:
  ```typescript
  const doc = await getDocument(uuid)
  if (doc.status === "rejected") {
    return { success: true, message: "Already rejected", document: doc }
  }
  // Proceed with LHDN API call + Convex update
  ```
- LHDN API call still made for "valid" status (LHDN is source of truth for state changes)

---

## 7. Error Handling Strategy

### Decision
Layer error handling: LHDN API errors, Convex mutation errors, UI error display.

### Rationale
- LHDN API can fail (network, rate limit, invalid state transition)
- Convex mutations can fail (validation, concurrent updates, database errors)
- User must see actionable error messages (not raw API error codes)

### Error Mapping

| Error Source | Code | User Message | Action |
|--------------|------|--------------|--------|
| LHDN API | 400 | "Cannot reject: document not in valid state" | Refresh page |
| LHDN API | 404 | "Document not found on LHDN" | Contact support |
| LHDN API | 429 | "Service temporarily busy, please try again" | Retry after 5s |
| LHDN API | 500 | "LHDN service error, please try again later" | Retry later |
| Convex | Validation | "Rejection window expired" | No action |
| Convex | Not found | "Document not found in Groot" | Refresh page |
| Network | Timeout | "Network error, please check connection" | Retry |

### Implementation Notes
- API route: Try-catch with specific error handling for each type
- UI: Display error in dialog (Radix Alert), allow user to close and retry
- Logging: Log all errors to console (development) and error tracking service (production)

---

## 8. Testing Strategy

### Decision
Three-tier testing: Unit (LHDN client), Integration (API route + mutations), E2E (UI flow).

### Rationale
- Unit tests: Isolate LHDN client logic, mock HTTP responses, fast execution
- Integration tests: Verify API route auth, Convex mutation side effects, notification dispatch
- E2E tests: Validate full user journey (click button → see confirmation → verify status change)

### Test Scenarios

**Unit Tests** (`tests/unit/lhdn-client.test.ts`):
- `rejectDocument()` sends correct request body
- `rejectDocument()` handles 400/404/429 errors
- `rejectDocument()` respects rate limit

**Integration Tests** (`tests/integration/reject-einvoice-flow.test.ts`):
- API route requires Clerk auth
- API route validates user role (owner/finance_admin/manager)
- API route validates 72-hour window
- Convex mutation updates document status
- Convex mutation triggers notification

**E2E Tests** (defer to /speckit.implement for specific tooling):
- User opens rejection dialog
- User enters reason and confirms
- UI shows success message
- Document status updates in list view
- Linked expense claim/invoice shows rejection

---

## 9. Deployment Checklist

### Pre-Deployment
- [ ] Run `npm run build` — must pass with zero errors
- [ ] Run `npx convex deploy --yes` — deploy mutations to production
- [ ] Verify LHDN credentials in AWS SSM (`/lhdn/prod/client_id`, `/lhdn/prod/client_secret`)
- [ ] Test rejection flow in staging with LHDN sandbox environment

### Post-Deployment
- [ ] Monitor LHDN API rate limit usage (should not exceed 10 RPM sustained)
- [ ] Verify notifications delivered within 10s (check Convex logs)
- [ ] Test 72-hour countdown UI at various window stages
- [ ] Validate rejection appears correctly in MyInvois portal

---

## References

- LHDN API Documentation: `/api/v1.0/documents/state/{uuid}/state`
- Existing LHDN Client: `src/lib/lhdn/client.ts` (line 186: `cancelDocument`)
- Convex Mutations: `convex/functions/einvoiceReceivedDocuments.ts`
- Expense Claims Domain: `src/domains/expense-claims/`
- GitHub Issue #309: Original feature request
