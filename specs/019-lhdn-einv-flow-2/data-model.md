# Data Model: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Branch**: `019-lhdn-einv-flow-2` | **Date**: 2026-02-25

## Entity: Expense Claim (Extended)

**Table**: `expense_claims` (existing — extend with new fields)
**File**: `convex/schema.ts`

### New Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `merchantFormUrl` | `v.optional(v.string())` | No | URL extracted from receipt QR code — merchant buyer-info form |
| `einvoiceRequestStatus` | `v.optional(v.union(...))` | No | Lifecycle: `"none"` → `"requesting"` → `"requested"` → `"received"` → `"failed"` |
| `einvoiceSource` | `v.optional(v.union(...))` | No | How the e-invoice was obtained: `"merchant_issued"`, `"manual_upload"`, `"not_applicable"` |
| `einvoiceAttached` | `v.optional(v.boolean())` | No | Quick filter flag — true when any e-invoice is attached |
| `lhdnReceivedDocumentUuid` | `v.optional(v.string())` | No | LHDN document UUID of matched received e-invoice |
| `lhdnReceivedLongId` | `v.optional(v.string())` | No | LHDN long ID — for verification QR code |
| `lhdnReceivedStatus` | `v.optional(v.union(v.literal("valid"), v.literal("cancelled")))` | No | Status of the received e-invoice on LHDN |
| `lhdnReceivedAt` | `v.optional(v.number())` | No | Timestamp when LHDN validated the received e-invoice |
| `einvoiceEmailRef` | `v.optional(v.string())` | No | Unique token used in `+` addressing for deterministic email matching |
| `einvoiceManualUploadPath` | `v.optional(v.string())` | No | S3/Convex storage path for manually uploaded e-invoice document |
| `einvoiceRequestedAt` | `v.optional(v.number())` | No | Timestamp when AI agent request was initiated |
| `einvoiceReceivedAt` | `v.optional(v.number())` | No | Timestamp when e-invoice was matched/attached |
| `einvoiceAgentError` | `v.optional(v.string())` | No | Error message from AI agent failure (for user display) |

### New Indexes

```typescript
.index("by_businessId_einvoiceRequestStatus", ["businessId", "einvoiceRequestStatus"])
.index("by_einvoiceEmailRef", ["einvoiceEmailRef"])
```

### State Transitions: `einvoiceRequestStatus`

```
                    ┌─── Employee clicks "Request E-Invoice"
                    │
  none ──────── requesting ──────── requested ──────── received
    │               │                    │                 │
    │               └── Agent fails ──► failed            │
    │                                    │                 │
    │                                    └── Retry ──► requesting
    │
    └── Manual upload ──────────────────────────────► received
```

| Transition | Trigger | Fields Updated |
|-----------|---------|----------------|
| `none` → `requesting` | Employee clicks "Request E-Invoice" | `einvoiceRequestStatus`, `einvoiceRequestedAt`, `einvoiceEmailRef` |
| `requesting` → `requested` | AI agent submits form successfully | `einvoiceRequestStatus`, `einvoiceSource = "merchant_issued"` |
| `requesting` → `failed` | AI agent fails | `einvoiceRequestStatus`, `einvoiceAgentError` |
| `failed` → `requesting` | Employee retries request | `einvoiceRequestStatus`, `einvoiceAgentError = null` |
| `requested` → `received` | LHDN polling or email match | `einvoiceRequestStatus`, `lhdnReceivedDocumentUuid`, `lhdnReceivedLongId`, `lhdnReceivedStatus`, `lhdnReceivedAt`, `einvoiceReceivedAt`, `einvoiceAttached = true` |
| `none` → `received` | Manual upload | `einvoiceRequestStatus`, `einvoiceSource = "manual_upload"`, `einvoiceManualUploadPath`, `einvoiceReceivedAt`, `einvoiceAttached = true` |
| `received` → `received` | LHDN cancellation detected | `lhdnReceivedStatus = "cancelled"` |

---

## Entity: E-Invoice Received Document (New Table)

**Table**: `einvoice_received_documents` (new)
**Purpose**: Tracks all received LHDN e-invoices for a business, including match status

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `v.id("businesses")` | Yes | Owning business |
| `lhdnDocumentUuid` | `v.string()` | Yes | LHDN document UUID (26-char) |
| `lhdnSubmissionUid` | `v.optional(v.string())` | No | LHDN submission UID |
| `lhdnLongId` | `v.optional(v.string())` | No | For verification QR code |
| `lhdnInternalId` | `v.optional(v.string())` | No | Merchant's own invoice reference |
| `supplierTin` | `v.optional(v.string())` | No | Merchant TIN |
| `supplierName` | `v.optional(v.string())` | No | Merchant name |
| `buyerTin` | `v.optional(v.string())` | No | Our business TIN |
| `buyerEmail` | `v.optional(v.string())` | No | Buyer email from UBL — may contain `+` suffix for matching |
| `total` | `v.optional(v.number())` | No | Invoice total amount |
| `dateTimeIssued` | `v.optional(v.string())` | No | ISO date-time of issue |
| `status` | `v.union(v.literal("valid"), v.literal("cancelled"))` | Yes | LHDN document status |
| `matchedExpenseClaimId` | `v.optional(v.id("expense_claims"))` | No | Linked expense claim (if matched) |
| `matchTier` | `v.optional(v.union(v.literal("tier1_email"), v.literal("tier2_tin_amount"), v.literal("tier3_fuzzy"), v.literal("manual")))` | No | How the match was determined |
| `matchConfidence` | `v.optional(v.number())` | No | Confidence score (0-1) |
| `matchCandidateClaimIds` | `v.optional(v.array(v.id("expense_claims")))` | No | Candidate claims for Tier 3 / ambiguous matches |
| `processedAt` | `v.number()` | Yes | When this document was processed |
| `rawDocumentSnapshot` | `v.optional(v.any())` | No | Key fields from raw UBL (audit trail) |

### Indexes

```typescript
.index("by_businessId_status", ["businessId", "status"])
.index("by_lhdnDocumentUuid", ["lhdnDocumentUuid"])
.index("by_matchedExpenseClaimId", ["matchedExpenseClaimId"])
.index("by_businessId_processedAt", ["businessId", "processedAt"])
```

---

## Entity: E-Invoice Request Log (New Table)

**Table**: `einvoice_request_logs` (new)
**Purpose**: Audit log for AI agent form-fill requests. Tracks each attempt for debugging and analytics.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `v.id("businesses")` | Yes | Owning business |
| `expenseClaimId` | `v.id("expense_claims")` | Yes | The expense claim this request is for |
| `userId` | `v.id("users")` | Yes | Employee who initiated the request |
| `merchantFormUrl` | `v.string()` | Yes | The URL the agent visited |
| `emailRefToken` | `v.string()` | Yes | The `+` suffix token used in the system email |
| `status` | `v.union(v.literal("pending"), v.literal("in_progress"), v.literal("success"), v.literal("failed"))` | Yes | Request status |
| `errorMessage` | `v.optional(v.string())` | No | Error details on failure |
| `browserbaseSessionId` | `v.optional(v.string())` | No | Browserbase session ID (for debugging) |
| `durationMs` | `v.optional(v.number())` | No | How long the agent took |
| `startedAt` | `v.number()` | Yes | Request start timestamp |
| `completedAt` | `v.optional(v.number())` | No | Completion timestamp |

### Indexes

```typescript
.index("by_expenseClaimId", ["expenseClaimId"])
.index("by_businessId_status", ["businessId", "status"])
```

---

## Relationships

```
expense_claims (extended)
    │
    ├── merchantFormUrl ──────── detected from receipt QR code
    │
    ├── einvoiceEmailRef ─────── unique token → used in email + addressing
    │
    ├── lhdnReceivedDocumentUuid ──► einvoice_received_documents.lhdnDocumentUuid
    │
    └── einvoiceManualUploadPath ── S3/Convex file storage path

einvoice_received_documents
    │
    ├── businessId ──────────────► businesses._id
    │
    ├── matchedExpenseClaimId ──► expense_claims._id
    │
    └── matchCandidateClaimIds ── array of expense_claims._id (for review)

einvoice_request_logs
    │
    ├── businessId ──────────────► businesses._id
    │
    ├── expenseClaimId ──────────► expense_claims._id
    │
    └── userId ──────────────────► users._id
```

---

## Validation Rules

### Expense Claim E-Invoice Fields
- `merchantFormUrl`: Must be a valid HTTP/HTTPS URL. Must NOT match `myinvois.hasil.gov.my/*` pattern (LHDN validation QR).
- `einvoiceEmailRef`: 6-character alphanumeric token. Unique per business (enforced via index lookup before generation).
- `lhdnReceivedDocumentUuid`: 26-character LHDN UUID format.
- `einvoiceRequestStatus` transitions: Only valid transitions allowed (see state diagram above).

### E-Invoice Received Documents
- `lhdnDocumentUuid`: Unique per business (enforced via index — no duplicate processing).
- `matchTier`: Required when `matchedExpenseClaimId` is set.
- `matchCandidateClaimIds`: Only populated when match is ambiguous (no auto-attach).

### E-Invoice Request Logs
- One active request (status `pending` or `in_progress`) per expense claim at any time.
- `emailRefToken` must match the `einvoiceEmailRef` on the parent expense claim.
