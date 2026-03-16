# Quickstart: LHDN E-Invoice Buyer Rejection Flow

**Date**: 2026-03-16
**Feature**: 023-einv-buyer-rejection-flow
**For**: Developers implementing or extending the rejection flow

## Overview

This guide helps you quickly understand and work with the LHDN e-invoice buyer rejection feature. Use this to:
- Integrate rejection UI into new domains
- Extend rejection logic for new entity types
- Troubleshoot rejection failures
- Add custom rejection workflows

---

## Quick Architecture

```
User clicks "Reject" button
    ↓
Opens rejection dialog (UI component)
    ↓
User enters reason + confirms
    ↓
POST /api/v1/einvoice-received/{uuid}/reject
    ↓
API route validates auth + role + window
    ↓
Calls LHDN API: PUT /documents/state/{uuid}/state
    ↓
Convex mutation: rejectReceivedDocument
    ↓
Updates linked invoice/claim + creates notification
    ↓
Real-time UI update via Convex subscription
```

**Key Files**:
- LHDN client: `src/lib/lhdn/client.ts` (line 186+)
- API route: `src/app/api/v1/einvoice-received/[uuid]/reject/route.ts`
- Convex mutation: `convex/functions/einvoiceReceivedDocuments.ts`
- UI dialog: `src/domains/expense-claims/components/einvoice-reject-dialog.tsx`

---

## Getting Started (5 minutes)

### 1. Install Dependencies

```bash
npm install  # All dependencies already in package.json
```

### 2. Configure LHDN Credentials

**Development** (`.env.local`):
```bash
NEXT_PUBLIC_LHDN_ENVIRONMENT=sandbox
# Credentials stored in AWS SSM (fetched by API route)
```

**Production** (AWS SSM):
```bash
# Already configured, no action needed
# Credentials: /lhdn/prod/client_id, /lhdn/prod/client_secret
```

### 3. Start Development Server

```bash
# Terminal 1: Start Convex
npx convex dev

# Terminal 2: Start Next.js
npm run dev
```

### 4. Test Rejection Flow

1. Navigate to: `http://localhost:3000/expense-claims`
2. Find an expense claim with a linked e-invoice (status = "valid")
3. Click "Reject E-Invoice" button
4. Enter reason: "Test rejection - wrong amount"
5. Confirm → Should see success message
6. Verify in MyInvois portal: Document status = "Rejected"

---

## Common Integration Patterns

### Pattern 1: Add Rejection to New Domain

**Use case**: You're building a new module (e.g., "Purchase Orders") and want to support e-invoice rejection.

**Steps**:
1. Import rejection dialog component:
   ```typescript
   import { EinvoiceRejectDialog } from '@/domains/expense-claims/components/einvoice-reject-dialog'
   ```

2. Add rejection button to your detail page:
   ```typescript
   <EinvoiceRejectDialog
     documentUuid={receivedDoc.lhdnDocumentUuid}
     currentStatus={receivedDoc.status}
     dateTimeValidated={receivedDoc.dateTimeValidated}
     onSuccess={() => {
       // Refetch your data or navigate
       router.refresh()
     }}
     onCancel={() => setDialogOpen(false)}
   />
   ```

3. Query received documents in your Convex function:
   ```typescript
   const receivedDoc = await ctx.db
     .query("einvoice_received_documents")
     .withIndex("by_businessId_status", (q) =>
       q.eq("businessId", businessId).eq("status", "valid")
     )
     .first()
   ```

4. Link your entity to the e-invoice:
   ```typescript
   // Add field to your table schema
   matchedPurchaseOrderId: v.optional(v.id("purchase_orders"))

   // Update in your matching logic
   await ctx.db.patch(receivedDocId, {
     matchedPurchaseOrderId: poId
   })
   ```

5. Extend rejection mutation to handle your entity:
   ```typescript
   // In convex/functions/einvoiceReceivedDocuments.ts
   if (doc.matchedPurchaseOrderId) {
     await updatePurchaseOrderRejectionStatus(doc.matchedPurchaseOrderId, reason)
     // Notify PO creator
   }
   ```

---

### Pattern 2: Custom Rejection Validation

**Use case**: You need additional validation rules (e.g., only reject if invoice unpaid).

**Steps**:
1. Add validation to API route:
   ```typescript
   // In src/app/api/v1/einvoice-received/[uuid]/reject/route.ts
   const linkedInvoice = await getLinkedInvoice(documentUuid)
   if (linkedInvoice?.paymentStatus === "paid") {
     return NextResponse.json(
       { error: "Cannot reject: invoice already paid" },
       { status: 400 }
     )
   }
   ```

2. Add validation to Convex mutation:
   ```typescript
   // In convex/functions/einvoiceReceivedDocuments.ts
   if (doc.matchedInvoiceId) {
     const invoice = await ctx.db.get(doc.matchedInvoiceId)
     if (invoice?.paymentStatus === "paid") {
       throw new Error("Cannot reject paid invoice")
     }
   }
   ```

---

### Pattern 3: Batch Rejection

**Use case**: Admin wants to reject multiple e-invoices at once.

**Steps**:
1. Create batch API route:
   ```typescript
   // src/app/api/v1/einvoice-received/batch-reject/route.ts
   export async function POST(request: Request) {
     const { documentUuids, reason } = await request.json()
     const results = await Promise.allSettled(
       documentUuids.map(uuid => rejectSingleDocument(uuid, reason))
     )
     return NextResponse.json({ results })
   }
   ```

2. Add rate limiting:
   ```typescript
   // Respect LHDN 12 RPM limit
   const BATCH_SIZE = 10
   const DELAY_MS = 5000  // 5 seconds between batches

   for (let i = 0; i < documentUuids.length; i += BATCH_SIZE) {
     const batch = documentUuids.slice(i, i + BATCH_SIZE)
     await Promise.all(batch.map(uuid => rejectDocument(uuid, reason)))
     if (i + BATCH_SIZE < documentUuids.length) {
       await sleep(DELAY_MS)
     }
   }
   ```

---

## API Reference

### Reject E-Invoice

**Endpoint**: `POST /api/v1/einvoice-received/{uuid}/reject`

**Request**:
```typescript
{
  reason: string  // Required, non-empty
}
```

**Response**:
```typescript
{
  success: true,
  document: {
    _id: string,
    lhdnDocumentUuid: string,
    status: "rejected",
    rejectedAt: number,
    rejectionReason: string,
    rejectedByUserId: string
  }
}
```

**Errors**:
- `401`: Not authenticated (missing Clerk token)
- `403`: Insufficient permissions (role not owner/finance_admin/manager)
- `400`: Validation failed (window expired, invalid status, empty reason)
- `404`: Document not found
- `429`: Rate limit exceeded (retry after 5s)
- `500`: LHDN API error or Convex failure

---

### LHDN Client Method

```typescript
import { rejectDocument } from '@/lib/lhdn/client'

await rejectDocument(
  documentUuid: string,      // LHDN document UUID (26 chars)
  reason: string,            // Rejection reason
  accessToken: string        // LHDN access token (from auth flow)
)
```

**Returns**: `Promise<void>` (throws on error)

**Rate Limit**: 12 requests per minute (shared with `cancelDocument`)

---

### Convex Mutation

```typescript
import { api } from "convex/_generated/api"

await convex.mutation(api.functions.einvoiceReceivedDocuments.rejectReceivedDocument, {
  documentUuid: "ABCD1234567890EFGH12345678",
  reason: "Wrong amount",
  userId: "user_2abcDefGHIjklMNO"
})
```

**Note**: This is an `internalMutation` — only call from API routes, not frontend.

---

## Troubleshooting

### Issue: "Rejection window expired" error

**Cause**: Document was validated more than 72 hours ago.

**Solution**:
1. Check `dateTimeValidated` field in database
2. Verify server time is correct (LHDN uses UTC)
3. If genuinely expired, user must contact supplier for corrected invoice

---

### Issue: "LHDN API error 400 - Invalid state transition"

**Cause**: Document status on LHDN side changed (supplier cancelled, already rejected).

**Solution**:
1. Refresh document status from LHDN API: `GET /documents/{uuid}`
2. Update local status in Convex to match LHDN
3. Show user updated status ("This invoice was already rejected by another user")

---

### Issue: "Rate limit exceeded" error

**Cause**: Too many rejection requests (>12 per minute).

**Solution**:
1. Implement exponential backoff in UI (5s, 10s, 20s delays)
2. Show user retry countdown: "Rate limit reached. Retry in 5 seconds..."
3. For batch operations, use queue with delays (see Pattern 3 above)

---

### Issue: Notification not received

**Cause**: Notification delivery failed (Convex subscription issue).

**Solution**:
1. Check Convex logs for errors
2. Verify recipient user ID matches Clerk user ID
3. Test notification query: `convex query notifications.list --args '{"userId":"user_xxx"}'`
4. Fallback: User can see rejection status on expense claim/invoice detail page

---

### Issue: 72-hour countdown shows wrong time

**Cause**: `dateTimeValidated` is stored in different timezone or format.

**Solution**:
1. Verify `dateTimeValidated` is ISO 8601 UTC string (e.g., "2026-03-14T10:30:00Z")
2. Check countdown calculation: `new Date(dateTimeValidated).getTime() + (72 * 60 * 60 * 1000)`
3. Use `Date.now()` for current time (UTC milliseconds)

---

## Testing

### Unit Tests

**LHDN Client** (`tests/unit/lhdn-client.test.ts`):
```typescript
import { rejectDocument } from '@/lib/lhdn/client'

test('rejectDocument sends correct request', async () => {
  const mockFetch = jest.fn().mockResolvedValue({ status: 204 })
  global.fetch = mockFetch

  await rejectDocument('test-uuid-123', 'Test reason', 'token-abc')

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/documents/state/test-uuid-123/state'),
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ status: 'rejected', reason: 'Test reason' })
    })
  )
})
```

### Integration Tests

**API Route + Convex** (`tests/integration/reject-einvoice-flow.test.ts`):
```typescript
test('rejection updates document and creates notification', async () => {
  // Create test document
  const docId = await createTestDocument({ status: 'valid' })

  // Call API route
  const response = await fetch('/api/v1/einvoice-received/test-uuid/reject', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clerkToken}` },
    body: JSON.stringify({ reason: 'Test rejection' })
  })

  // Verify response
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(data.document.status).toBe('rejected')

  // Verify database update
  const doc = await getDocument(docId)
  expect(doc.status).toBe('rejected')
  expect(doc.rejectionReason).toBe('Test rejection')

  // Verify notification created
  const notifications = await getNotifications(testUserId)
  expect(notifications).toHaveLength(1)
  expect(notifications[0].title).toBe('E-Invoice Rejected')
})
```

---

## Performance Optimization

### 1. Reduce API Calls

**Problem**: Every rejection button render queries document status.

**Solution**: Use Convex subscriptions (real-time updates, no polling):
```typescript
const receivedDoc = useQuery(api.functions.einvoiceReceivedDocuments.getById, {
  documentId: docId
})
// Auto-updates when status changes
```

### 2. Countdown Optimization

**Problem**: 30-second countdown updates cause re-renders.

**Solution**: Use `useMemo` and `useInterval`:
```typescript
const remainingMs = useMemo(() => {
  const expiryMs = new Date(dateTimeValidated).getTime() + (72 * 60 * 60 * 1000)
  return Math.max(0, expiryMs - Date.now())
}, [dateTimeValidated])

useInterval(() => {
  setCurrentTime(Date.now())
}, 30000)  // Update every 30s, not every second
```

### 3. Batch Notification Delivery

**Problem**: Batch rejection creates many individual notifications.

**Solution**: Create single summary notification:
```typescript
await ctx.db.insert("notifications", {
  userId: adminUserId,
  title: "Batch Rejection Complete",
  message: `${successCount} e-invoices rejected, ${failCount} failed`,
  severity: successCount > 0 ? "info" : "error"
})
```

---

## Security Checklist

Before deploying rejection feature:

- [ ] API route has Clerk auth check
- [ ] API route validates user role (owner/finance_admin/manager)
- [ ] API route validates 72-hour window (server-side)
- [ ] Convex mutation is `internalMutation` (not public)
- [ ] LHDN credentials fetched from AWS SSM (not Convex env vars)
- [ ] Rejection reason sanitized (no XSS injection)
- [ ] Rate limiting implemented (12 RPM max)
- [ ] Idempotency check prevents duplicate API calls
- [ ] Audit log records all rejections (via Convex mutations)

---

## Resources

- **Feature Spec**: [spec.md](./spec.md)
- **Implementation Plan**: [plan.md](./plan.md)
- **Data Model**: [data-model.md](./data-model.md)
- **API Contract**: [contracts/reject-api.yml](./contracts/reject-api.yml)
- **LHDN API Docs**: `/api/v1.0/documents/state/{uuid}/state` endpoint
- **Codebase Patterns**: `src/lib/lhdn/client.ts` (cancelDocument method)
- **GitHub Issue**: #309 (original feature request)

---

## Next Steps

1. **Read the spec**: [spec.md](./spec.md) for full requirements
2. **Review the plan**: [plan.md](./plan.md) for architecture decisions
3. **Check the data model**: [data-model.md](./data-model.md) for database schema
4. **Run tests**: `npm test` to verify rejection flow
5. **Test in sandbox**: Use LHDN sandbox environment before production

**Questions?** Check the troubleshooting section above or contact the team.
