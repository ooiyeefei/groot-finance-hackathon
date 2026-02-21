# API Contracts: Peppol InvoiceNow Integration

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20

## 1. Peppol Transmission API Route

**Path**: `POST /api/v1/sales-invoices/[invoiceId]/peppol/transmit`

**Purpose**: Initiate Peppol transmission for a sales invoice or credit note.

**Authentication**: Clerk session (finance admin role required)

**Request**:
```typescript
// Path params
invoiceId: string  // Convex document ID

// No request body — all data derived from the invoice record
```

**Response (success — 200)**:
```typescript
{
  success: true,
  data: {
    peppolDocumentId: string,  // Storecove submission GUID
    status: "pending"
  }
}
```

**Response (validation error — 400)**:
```typescript
{
  success: false,
  error: string,  // Human-readable message
  validationErrors?: Array<{
    field: string,
    message: string
  }>
}
```

**Response (usage limit — 403)**:
```typescript
{
  success: false,
  error: "E-invoice limit reached. Upgrade your plan.",
  code: "USAGE_LIMIT_EXCEEDED"
}
```

**Response (Storecove error — 502)**:
```typescript
{
  success: false,
  error: string,  // Storecove error message
  peppolErrors?: Array<{ code: string, message: string }>
}
```

**Flow**:
1. Authenticate user (Clerk) → verify finance admin role
2. Load invoice from Convex
3. Validate: invoice status is "sent"/"paid"/"overdue", no existing peppolStatus, business + customer have Peppol IDs
4. Check e-invoice usage limit (with grace buffer)
5. Map invoice data to Storecove JSON payload
6. POST to Storecove `/api/v2/document_submissions`
7. On success: update invoice in Convex (peppolDocumentId, peppolStatus="pending", peppolTransmittedAt)
8. Increment e-invoice usage counter
9. Return success with Storecove GUID

---

## 2. Peppol Retry API Route

**Path**: `POST /api/v1/sales-invoices/[invoiceId]/peppol/retry`

**Purpose**: Retry a failed Peppol transmission.

**Authentication**: Clerk session (finance admin role required)

**Request**: No body.

**Response**: Same as transmit endpoint.

**Flow**:
1. Same auth + validation as transmit
2. Additional check: peppolStatus MUST be "failed"
3. Clear peppolErrors
4. Re-execute transmission flow (steps 5-9 from transmit)

---

## 3. Peppol Webhook Handler

**Path**: `POST /api/v1/peppol/webhook`

**Purpose**: Receive status notifications from Storecove.

**Authentication**: Custom header verification (`X-Storecove-Secret`)

**Request** (from Storecove):
```typescript
{
  guid: string,       // Webhook instance GUID
  body: string         // Stringified JSON — needs JSON.parse
}
// Parsed body contains:
{
  guid: string,        // Document submission GUID (matches peppolDocumentId)
  status: "transmitted" | "delivered" | "failed",
  timestamp?: string,
  errors?: Array<{ code: string, message: string }>
}
```

**Response**: `200 OK` (empty body — acknowledgement)

**Flow**:
1. Verify webhook secret header
2. Parse webhook body
3. Find invoice by `peppolDocumentId` matching the submission GUID
4. Update invoice status based on event:
   - `transmitted`: set peppolStatus, peppolTransmittedAt
   - `delivered`: set peppolStatus, peppolDeliveredAt
   - `failed`: set peppolStatus, peppolErrors
5. Return 200

**Idempotency**: If invoice already has a later status (e.g., delivered), ignore earlier events (e.g., transmitted arriving late). Status transitions are one-directional: pending → transmitted → delivered/failed.

---

## 4. Peppol Discovery API Route

**Path**: `GET /api/v1/peppol/discovery?peppolId={participantId}`

**Purpose**: Verify a receiver's Peppol participant ID is active on the network.

**Authentication**: Clerk session

**Request**:
```typescript
// Query params
peppolId: string  // e.g., "0195:T08GA1234A"
```

**Response (found — 200)**:
```typescript
{
  success: true,
  data: {
    active: true,
    network: "peppol",
    participantId: string
  }
}
```

**Response (not found — 200)**:
```typescript
{
  success: true,
  data: {
    active: false,
    participantId: string
  }
}
```

**Flow**:
1. Parse scheme and identifier from peppolId (split on ":")
2. POST to Storecove `/api/v2/discovery/receives`
3. Return active/inactive based on response

---

## 5. Credit Note Creation — Convex Mutation

**Function**: `createCreditNote` in `convex/functions/salesInvoices.ts`

**Input**:
```typescript
{
  originalInvoiceId: Id<"sales_invoices">,
  businessId: Id<"businesses">,
  lineItems: Array<{
    description: string,
    quantity: number,
    unitPrice: number,
    amount: number,
    taxRate?: number,
    taxCategory?: string
  }>,
  creditNoteReason: string,
  notes?: string
}
```

**Output**:
```typescript
{
  creditNoteId: Id<"sales_invoices">  // The new credit note document ID
}
```

**Validation**:
- User must be finance admin for the business
- Original invoice must exist and belong to the business
- Original invoice status must be "sent", "paid", or "overdue" (not "draft" or "void")
- Sum of credit note amount + existing credit notes must not exceed original invoice total
- At least one line item required
- Each line item amount must be > 0

**Behavior**:
- Creates a new `sales_invoices` record with `einvoiceType = "credit_note"`
- Sets `originalInvoiceId` to link to the parent invoice
- Generates a credit note number (format: "CN-{originalInvoiceNumber}-{sequence}")
- Copies customer snapshot from original invoice
- Sets status to "draft" initially (user must finalize before Peppol transmission)

---

## 6. Credit Note Queries — Convex Queries

**Function**: `getCreditNotesForInvoice` in `convex/functions/salesInvoices.ts`

**Input**:
```typescript
{
  invoiceId: Id<"sales_invoices">,
  businessId: Id<"businesses">
}
```

**Output**:
```typescript
Array<{
  _id: Id<"sales_invoices">,
  invoiceNumber: string,  // "CN-INV001-1"
  totalAmount: number,
  status: string,
  peppolStatus?: string,
  creditNoteReason: string,
  _creationTime: number
}>
```

**Function**: `getNetOutstandingAmount` in `convex/functions/salesInvoices.ts`

**Input**: `{ invoiceId: Id<"sales_invoices"> }`

**Output**: `{ originalAmount: number, totalCredited: number, netOutstanding: number }`
