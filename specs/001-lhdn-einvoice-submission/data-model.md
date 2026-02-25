# Data Model: LHDN e-Invoice Submission Pipeline

**Feature Branch**: `001-lhdn-einvoice-submission`
**Date**: 2026-02-25

## Schema Changes Summary

### Modified Tables

#### `businesses` — Add auto-trigger setting

| Field | Type | Description |
|-------|------|-------------|
| `autoSelfBillExemptVendors` | `optional(boolean)` | When true, self-billed e-invoices auto-trigger on approval of expense claims/AP invoices from exempt vendors. Default: false (manual confirmation). |

> Note: Existing LHDN fields (`lhdnTin`, `lhdnClientId`, `msicCode`, `sstRegistrationNumber`, `businessRegistrationNumber`) are already deployed.

#### `vendors` — Add exempt flag

| Field | Type | Description |
|-------|------|-------------|
| `isLhdnExempt` | `optional(boolean)` | When true, all purchases from this vendor suggest/auto-trigger self-billing. Undefined = unknown. |

#### `customers` — Add exempt flag

| Field | Type | Description |
|-------|------|-------------|
| `isLhdnExempt` | `optional(boolean)` | When true, all purchases from this customer (when acting as vendor) suggest/auto-trigger self-billing. Undefined = unknown. |

#### `expense_claims` — Add LHDN tracking fields (self-billed)

| Field | Type | Description |
|-------|------|-------------|
| `lhdnSubmissionId` | `optional(string)` | LHDN 26-char submission UID |
| `lhdnDocumentUuid` | `optional(string)` | LHDN 26-char document UUID |
| `lhdnLongId` | `optional(string)` | For QR code generation |
| `lhdnStatus` | `optional(lhdnStatusValidator)` | pending/submitted/valid/invalid/cancelled |
| `lhdnSubmittedAt` | `optional(number)` | Unix timestamp of submission |
| `lhdnValidatedAt` | `optional(number)` | Unix timestamp of validation |
| `lhdnValidationErrors` | `optional(array({code, message, target?}))` | LHDN rejection details |
| `lhdnDocumentHash` | `optional(string)` | SHA256 hash of submitted document |
| `selfBillRequired` | `optional(boolean)` | True if system detected self-billing needed (no QR / exempt vendor) |
| `receiptQrCodeDetected` | `optional(boolean)` | Whether QR code was found on receipt image |

#### `invoices` (AP) — Add LHDN tracking fields (self-billed)

| Field | Type | Description |
|-------|------|-------------|
| `lhdnSubmissionId` | `optional(string)` | LHDN 26-char submission UID |
| `lhdnDocumentUuid` | `optional(string)` | LHDN 26-char document UUID |
| `lhdnLongId` | `optional(string)` | For QR code generation |
| `lhdnStatus` | `optional(lhdnStatusValidator)` | pending/submitted/valid/invalid/cancelled |
| `lhdnSubmittedAt` | `optional(number)` | Unix timestamp of submission |
| `lhdnValidatedAt` | `optional(number)` | Unix timestamp of validation |
| `lhdnValidationErrors` | `optional(array({code, message, target?}))` | LHDN rejection details |
| `lhdnDocumentHash` | `optional(string)` | SHA256 hash of submitted document |

### New Tables

#### `lhdn_tokens` — Cached LHDN OAuth tokens per tenant

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | `Id<"businesses">` | Owning business |
| `tenantTin` | `string` | Tenant TIN used in `onbehalfof` header |
| `accessToken` | `string` | JWT access token |
| `expiresAt` | `number` | Unix timestamp when token expires |
| `createdAt` | `number` | Unix timestamp of token creation |

**Indexes**: `by_businessId` → `["businessId"]`

#### `lhdn_submission_jobs` — Async submission job tracking

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | `Id<"businesses">` | Owning business |
| `sourceType` | `string` | "sales_invoice" / "expense_claim" / "invoice" |
| `sourceId` | `string` | ID of the source record |
| `documentType` | `string` | LHDN type code: "01", "02", "03", "04", "11" |
| `status` | `string` | "queued" / "signing" / "submitting" / "polling" / "completed" / "failed" |
| `submissionUid` | `optional(string)` | LHDN submission UID (once submitted) |
| `pollAttempts` | `number` | Number of poll attempts made |
| `retryCount` | `number` | Number of full retry cycles (max 3) |
| `lastPollAt` | `optional(number)` | Timestamp of last poll |
| `error` | `optional(string)` | Error message if failed |
| `createdAt` | `number` | Job creation timestamp |
| `completedAt` | `optional(number)` | Job completion timestamp |

**Indexes**: `by_businessId_status` → `["businessId", "status"]`, `by_status` → `["status"]`

## State Transitions

### LHDN Status (on source records)

```
[none] → pending     (user clicks Submit / auto-trigger)
pending → submitted  (document signed & sent to LHDN API)
submitted → valid    (LHDN validates successfully, longId assigned)
submitted → invalid  (LHDN rejects, validation errors stored)
valid → cancelled    (user cancels within 72 hours)
invalid → pending    (user corrects & resubmits)
cancelled → pending  (user corrects & resubmits)
```

### Submission Job Status

```
queued → signing      (Lambda invoked for digital signature)
signing → submitting  (signed doc sent to LHDN API)
submitting → polling  (LHDN accepted, polling for validation)
polling → completed   (final status received: valid or invalid)
polling → failed      (30-min timeout + 3 retries exhausted)
signing → failed      (signing error — certificate issue)
submitting → failed   (LHDN API error — network/auth)
```

## Entity Relationships

```
businesses (1) ──── (*) sales_invoices     [LHDN submission fields]
businesses (1) ──── (*) expense_claims     [LHDN self-billed fields]
businesses (1) ──── (*) invoices (AP)      [LHDN self-billed fields]
businesses (1) ──── (*) lhdn_tokens        [cached OAuth tokens]
businesses (1) ──── (*) lhdn_submission_jobs [async job tracking]
businesses (1) ──── (*) vendors            [isLhdnExempt flag]
businesses (1) ──── (*) customers          [isLhdnExempt flag]

lhdn_submission_jobs (*) ──── (1) sales_invoices   [via sourceType + sourceId]
lhdn_submission_jobs (*) ──── (1) expense_claims    [via sourceType + sourceId]
lhdn_submission_jobs (*) ──── (1) invoices (AP)     [via sourceType + sourceId]
```
