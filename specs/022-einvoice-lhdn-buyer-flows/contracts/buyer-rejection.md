# Contract: Buyer Rejection of Received E-Invoices

## API Route: POST /api/v1/einvoice-received/[uuid]/reject

**Auth**: Clerk (owner, finance_admin, manager)

**Request**:
```typescript
{
  businessId: string
  reason: string  // required, min 1 char
}
```

**Response (200)**:
```typescript
{
  success: true
  data: {
    documentUuid: string
    status: "rejected"
    rejectedAt: string  // ISO timestamp
  }
}
```

**Response (400)**: Rejection window expired, missing reason
**Response (401)**: Not authenticated
**Response (403)**: Insufficient role
**Response (404)**: Document not found
**Response (502)**: LHDN API error (with error details)

**Flow**:
1. Validate user role (owner/finance_admin/manager)
2. Load document from `einvoice_received_documents` by UUID
3. Validate status is "valid"
4. Validate within 72-hour window (from document's `dateTimeValidated`)
5. Authenticate with LHDN (business TIN via intermediary mode)
6. Call LHDN: `PUT /api/v1.0/documents/state/{uuid}/state` with `{ status: "rejected", reason }`
7. Update Convex: `rejectReceivedDocument` mutation
8. If linked to expense claim: add `einvoiceRejectionWarning: true`, clear e-invoice reference
9. Send notification to claim submitter

## LHDN Client Method: rejectDocument

```typescript
async rejectDocument(
  documentUuid: string,
  reason: string,
  accessToken: string
): Promise<void>
```

Mirrors existing `cancelDocument()`. Rate limit: 12 RPM.

## Convex Mutation: rejectReceivedDocument

**Input**:
```typescript
{
  documentId: Id<"einvoice_received_documents">
  reason: string
  rejectedByUserId: string
}
```

**Side effects**:
- Update document: `status: "rejected"`, `rejectedAt`, `rejectionReason`, `rejectedByUserId`
- If `matchedExpenseClaimId` exists:
  - Set `einvoiceRejectionWarning: true` on expense claim
  - Clear `lhdnReceivedDocumentUuid`, `einvoiceAttached: false`
- Create notification for claim submitter
