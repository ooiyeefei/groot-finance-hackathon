# API Contracts: LHDN e-Invoice Submission Pipeline

**Feature Branch**: `001-lhdn-einvoice-submission`
**Date**: 2026-02-25

## Next.js API Routes

### POST `/api/v1/sales-invoices/[invoiceId]/lhdn/submit`

Submit a single sales invoice to LHDN.

**Request**:
```json
{
  "businessId": "string (Convex ID)"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "jobId": "string (lhdn_submission_jobs ID)",
    "lhdnStatus": "pending"
  }
}
```

**Error (400)** — Missing business config:
```json
{
  "success": false,
  "error": "LHDN settings incomplete",
  "missingFields": ["lhdnTin", "msicCode"]
}
```

**Error (400)** — Missing customer TIN (requires confirmation):
```json
{
  "success": false,
  "error": "BUYER_TIN_MISSING",
  "message": "Customer has no TIN. Use general public TIN (EI00000000000)?",
  "requiresConfirmation": true
}
```

**Auth**: Clerk — Owner or Finance Admin only

---

### POST `/api/v1/sales-invoices/[invoiceId]/lhdn/submit` (with TIN confirmation)

Submit with general public TIN override.

**Request**:
```json
{
  "businessId": "string",
  "useGeneralBuyerTin": true
}
```

**Response**: Same as above.

---

### POST `/api/v1/sales-invoices/batch/lhdn/submit`

Batch submit multiple invoices to LHDN.

**Request**:
```json
{
  "businessId": "string",
  "invoiceIds": ["string", "string", "..."],
  "useGeneralBuyerTin": false
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "jobId": "string",
    "accepted": [{ "invoiceId": "string", "status": "pending" }],
    "rejected": [{ "invoiceId": "string", "reason": "string" }]
  }
}
```

**Auth**: Clerk — Owner or Finance Admin only

---

### PUT `/api/v1/sales-invoices/[invoiceId]/lhdn/cancel`

Cancel a validated e-invoice (within 72-hour window).

**Request**:
```json
{
  "businessId": "string",
  "reason": "string (required)"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "lhdnStatus": "cancelled"
  }
}
```

**Error (400)** — 72-hour window expired:
```json
{
  "success": false,
  "error": "CANCELLATION_WINDOW_EXPIRED",
  "validatedAt": 1740000000,
  "windowExpiresAt": 1740259200
}
```

**Auth**: Clerk — Owner or Finance Admin only

---

### POST `/api/v1/expense-claims/[claimId]/lhdn/self-bill`

Generate and submit a self-billed e-invoice from an expense claim.

**Request**:
```json
{
  "businessId": "string"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "jobId": "string",
    "lhdnStatus": "pending",
    "documentType": "11"
  }
}
```

**Auth**: Clerk — Owner or Finance Admin only

---

### POST `/api/v1/invoices/[invoiceId]/lhdn/self-bill`

Generate and submit a self-billed e-invoice from an AP/vendor invoice.

**Request**:
```json
{
  "businessId": "string"
}
```

**Response**: Same as expense claim self-bill above.

**Auth**: Clerk — Owner or Finance Admin only

---

## Convex Mutations

### `salesInvoices.initiateLhdnSubmission`

Validates invoice readiness, sets `lhdnStatus` to "pending", records e-invoice usage.

**Input**: `{ id: Id<"sales_invoices">, businessId: Id<"businesses">, useGeneralBuyerTin?: boolean }`
**Output**: `{ success: boolean }`
**Side effects**: Creates `lhdn_submission_jobs` record, sets `lhdnStatus: "pending"`, `lhdnSubmittedAt`.

### `salesInvoices.updateLhdnStatus`

Updates LHDN status from polling/submission results. Called by scheduled poll function.

**Input**: `{ invoiceId: Id<"sales_invoices">, status: LhdnStatus, documentUuid?: string, longId?: string, validationErrors?: array, validatedAt?: number, documentHash?: string }`
**Output**: `{ success: boolean }`

### `salesInvoices.cancelLhdnSubmission`

Cancels a validated e-invoice. Validates 72-hour window.

**Input**: `{ id: Id<"sales_invoices">, businessId: Id<"businesses">, reason: string }`
**Output**: `{ success: boolean }`

### `expenseClaims.initiateSelfBill`

Generates self-billed e-invoice data from an approved expense claim.

**Input**: `{ id: Id<"expense_claims">, businessId: Id<"businesses"> }`
**Output**: `{ success: boolean, jobId: string }`
**Side effects**: Sets `lhdnStatus: "pending"`, creates `lhdn_submission_jobs` record.

### `invoices.initiateSelfBill`

Generates self-billed e-invoice data from an AP/vendor invoice.

**Input**: `{ id: Id<"invoices">, businessId: Id<"businesses"> }`
**Output**: `{ success: boolean, jobId: string }`

### `lhdnTokens.getOrRefresh`

Returns a cached LHDN token or fetches a new one. Internal only.

**Input**: `{ businessId: Id<"businesses"> }`
**Output**: `{ accessToken: string, expiresAt: number }`

### `lhdnJobs.updateJobStatus`

Updates submission job status during the async pipeline. Internal only.

**Input**: `{ jobId: Id<"lhdn_submission_jobs">, status: string, submissionUid?: string, error?: string }`

### `lhdnJobs.pollForResults`

Scheduled function: polls LHDN for validation results. Reschedules itself until resolved or timeout.

**Input**: `{ jobId: Id<"lhdn_submission_jobs"> }`
**Side effects**: Updates source record with LHDN status, creates notification on completion.

---

## LHDN External API Calls (via `src/lib/lhdn/client.ts`)

### `authenticate(tenantTin: string): Promise<LhdnToken>`
- `POST /connect/token` with intermediary credentials + `onbehalfof` header
- Rate limit: 12 RPM

### `submitDocuments(documents: LhdnDocument[]): Promise<LhdnSubmissionResponse>`
- `POST /api/v1.0/documentsubmissions/`
- Rate limit: 100 RPM
- Max 100 docs, 5MB total, 300KB per doc

### `getSubmissionStatus(submissionUid: string): Promise<LhdnSubmissionStatus>`
- `GET /api/v1.0/documentsubmissions/{submissionUid}`
- Rate limit: 300 RPM

### `cancelDocument(documentUuid: string, reason: string): Promise<void>`
- `PUT /api/v1.0/documents/state/{documentUuid}/state`
- Rate limit: 12 RPM

### `validateTin(tin: string): Promise<boolean>`
- `GET /api/v1.0/taxpayer/validate/{tin}`
- Rate limit: 60 RPM

---

## Digital Signature Lambda Call

### Invoke `finanseal-digital-signature`

**Input**:
```json
{
  "action": "sign",
  "document": "<UBL 2.1 JSON string>",
  "environment": "production"
}
```

**Output**:
```json
{
  "success": true,
  "signedDocument": "<signed UBL 2.1 JSON string>",
  "documentHash": "<SHA256 hash>"
}
```
