# API Contracts: LHDN e-Invoice Flow 2

**Branch**: `019-lhdn-einv-flow-2` | **Date**: 2026-02-25

## Next.js API Routes

### POST `/api/v1/expense-claims/[id]/request-einvoice`

**Purpose**: Trigger AI agent to fill merchant buyer-info form (FR-004, FR-005)
**Auth**: Clerk session (employee must own the expense claim)

**Request**:
```typescript
// No body required — all data sourced from expense claim + business settings
```

**Response (202 Accepted)**:
```typescript
{
  requestId: string;           // einvoice_request_logs._id
  emailRef: string;            // The +token used for email matching
  status: "requesting";        // Initial status
}
```

**Error Responses**:
- `400` — Expense claim has no `merchantFormUrl`
- `400` — Business settings incomplete (missing TIN, BRN, or address)
- `409` — E-invoice already requested or attached for this claim
- `404` — Expense claim not found or not owned by user

**Side Effects**:
1. Creates `einvoice_request_logs` record (status: "pending")
2. Updates `expense_claims.einvoiceRequestStatus` to "requesting"
3. Generates unique `einvoiceEmailRef` token, stores on expense claim
4. Invokes Stagehand REST API asynchronously (does not wait for completion)
5. On completion/failure: updates expense claim and request log, sends notification

---

### POST `/api/v1/expense-claims/[id]/upload-einvoice`

**Purpose**: Manual e-invoice document upload (FR-012)
**Auth**: Clerk session (employee must own the expense claim)
**Content-Type**: `multipart/form-data`

**Request**:
```typescript
{
  file: File;  // PDF or image (max 10MB)
}
```

**Response (200 OK)**:
```typescript
{
  storagePath: string;         // Where the document was stored
  einvoiceSource: "manual_upload";
}
```

**Error Responses**:
- `400` — Invalid file type (must be PDF, PNG, JPG)
- `400` — File too large (>10MB)
- `409` — E-invoice already attached
- `404` — Expense claim not found

**Side Effects**:
1. Uploads file to S3/Convex storage
2. Updates expense claim: `einvoiceSource = "manual_upload"`, `einvoiceManualUploadPath`, `einvoiceAttached = true`, `einvoiceRequestStatus = "received"`

---

### POST `/api/v1/expense-claims/[id]/resolve-match`

**Purpose**: Employee resolves ambiguous e-invoice match (FR-011, Tier 3)
**Auth**: Clerk session (employee must own the expense claim)

**Request**:
```typescript
{
  receivedDocumentId: string;  // einvoice_received_documents._id
  action: "accept" | "reject";
}
```

**Response (200 OK)**:
```typescript
{
  matched: boolean;
  einvoiceRequestStatus: string;
}
```

**Side Effects**:
- On accept: Links received document to expense claim, updates all e-invoice fields
- On reject: Removes candidate from `matchCandidateClaimIds`

---

## Convex Functions

### Queries

#### `expenseClaims.getEinvoiceStatus`
**Purpose**: Get e-invoice details for an expense claim (FR-013)
**Input**: `{ claimId: Id<"expense_claims"> }`
**Output**:
```typescript
{
  einvoiceRequestStatus: string | null;
  einvoiceSource: string | null;
  einvoiceAttached: boolean;
  merchantFormUrl: string | null;
  lhdnReceivedDocumentUuid: string | null;
  lhdnReceivedLongId: string | null;
  lhdnReceivedStatus: string | null;
  lhdnReceivedAt: number | null;
  einvoiceRequestedAt: number | null;
  einvoiceReceivedAt: number | null;
  einvoiceAgentError: string | null;
  // Pending match candidates (for Tier 3 review)
  pendingMatchCandidates: Array<{
    receivedDocId: string;
    supplierName: string;
    total: number;
    dateTimeIssued: string;
    matchTier: string;
    matchConfidence: number;
  }>;
}
```

#### `einvoiceReceivedDocuments.listUnmatched`
**Purpose**: List unmatched received documents for admin review
**Input**: `{ businessId: Id<"businesses"> }`
**Output**: Array of unmatched documents with key metadata

---

### Mutations

#### `expenseClaims.updateEinvoiceStatus` (internal)
**Purpose**: Update e-invoice fields on expense claim after matching or agent completion
**Input**:
```typescript
{
  claimId: Id<"expense_claims">;
  einvoiceRequestStatus: string;
  einvoiceSource?: string;
  einvoiceAttached?: boolean;
  lhdnReceivedDocumentUuid?: string;
  lhdnReceivedLongId?: string;
  lhdnReceivedStatus?: string;
  lhdnReceivedAt?: number;
  einvoiceReceivedAt?: number;
  einvoiceAgentError?: string;
}
```

#### `einvoiceReceivedDocuments.upsert` (internal)
**Purpose**: Insert or update a received LHDN document record
**Input**: All fields from `einvoice_received_documents` table
**Deduplication**: By `lhdnDocumentUuid` + `businessId`

---

### Actions

#### `einvoiceJobs.pollReceivedDocuments` (internal)
**Purpose**: Cron-triggered action to poll LHDN received documents (FR-009)
**Schedule**: Every 15 minutes via `convex/crons.ts`
**Logic**:
1. For each active business with LHDN configuration:
   a. Authenticate with LHDN (reuse cached token)
   b. Fetch recent received documents (`InvoiceDirection=Received`)
   c. For each new document (not in `einvoice_received_documents`):
      - Fetch raw UBL document
      - Extract buyer email, supplier details
      - Run 3-tier matching algorithm
      - Store in `einvoice_received_documents`
      - If matched: update expense claim, send notification
      - If ambiguous: store candidates, send notification for review

#### `einvoiceJobs.processIncomingEmail` (internal)
**Purpose**: Process an e-invoice email received via SES (FR-008)
**Input**:
```typescript
{
  s3Key: string;      // S3 key of the raw email
  messageId: string;  // Email Message-ID for deduplication
}
```
**Logic**:
1. Download raw email from S3
2. Parse MIME: extract `To:` header, attachments
3. Parse `+{claimRef}` suffix from `To:` address
4. Look up expense claim by `einvoiceEmailRef`
5. Store attachment (e-invoice document) in Convex storage
6. Update expense claim status to "received (pending LHDN confirmation)"
7. Send notification to employee

#### `einvoiceJobs.executeFormFill` (internal)
**Purpose**: Execute the AI agent form-fill via Stagehand REST API (FR-005)
**Input**:
```typescript
{
  requestLogId: Id<"einvoice_request_logs">;
  expenseClaimId: Id<"expense_claims">;
  merchantFormUrl: string;
  companyDetails: {
    name: string;
    tin: string;
    brn: string;
    address: string;
    email: string;  // einvoice+{ref}@hellogroot.com
    phone: string;
  };
}
```
**Logic**:
1. Create Stagehand session (Browserbase REST API)
2. Navigate to `merchantFormUrl`
3. Act: fill form with company details and submit
4. End session
5. On success: update request log (status: "success"), update expense claim (status: "requested")
6. On failure: update request log (status: "failed", error), update expense claim (status: "failed", agent error)
7. Send notification to employee

---

## Webhook / Trigger

### SES Email Receiving → Lambda → Convex

**Trigger**: AWS SES receives email at `einvoice*@hellogroot.com`
**Flow**: SES → S3 (raw email) → Lambda trigger → calls Convex action `einvoiceJobs.processIncomingEmail`

---

## External API Dependencies

### LHDN MyInvois API (Shared with Flow 1)

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `POST /connect/token` | POST | OAuth authentication | 12 RPM |
| `GET /api/v1.0/documents/recent?InvoiceDirection=Received` | GET | Poll received e-invoices | 60 RPM |
| `GET /api/v1.0/documents/{uuid}/raw` | GET | Get full UBL document | 60 RPM |

### Stagehand REST API (Browserbase)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/sessions/start` | POST | Create browser session |
| `/v1/sessions/{id}/navigate` | POST | Navigate to URL |
| `/v1/sessions/{id}/act` | POST | AI agent action (fill form) |
| `/v1/sessions/{id}/end` | POST | Close session |
