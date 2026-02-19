# Data Model: e-Invoice Schema Changes

**Branch**: `016-e-invoice-schema-change` | **Date**: 2026-02-19

## Overview

Additive schema changes to 3 existing Convex tables. No new tables. All fields optional. Zero migration required.

## Entity Changes

### 1. `sales_invoices` — Extended

**New fields** (all `v.optional()`):

```
LHDN MyInvois Tracking:
  lhdnSubmissionId      string       LHDN 26-char submission UID
  lhdnDocumentUuid      string       LHDN 26-char document UUID
  lhdnLongId            string       For QR code URL generation
  lhdnStatus            enum         pending | submitted | valid | invalid | cancelled
  lhdnSubmittedAt       number       Unix timestamp (ms)
  lhdnValidatedAt       number       Unix timestamp (ms)
  lhdnValidationErrors  array        [{code: string, message: string, target?: string}]
  lhdnDocumentHash      string       SHA256 hash of submitted document

Peppol InvoiceNow Tracking:
  peppolDocumentId      string       Peppol document identifier
  peppolStatus          enum         pending | transmitted | delivered | failed
  peppolTransmittedAt   number       Unix timestamp (ms)
  peppolDeliveredAt     number       Unix timestamp (ms)
  peppolErrors          array        [{code: string, message: string}]

Shared:
  einvoiceType          enum         invoice | credit_note | debit_note | refund_note
```

**Extended embedded object** — `customerSnapshot`:

```
Existing fields (unchanged):
  businessName          string       (required)
  contactPerson         string       (optional)
  email                 string       (required)
  phone                 string       (optional)
  address               string       (optional)
  taxId                 string       (optional)

New fields (all optional):
  tin                   string       Customer TIN at invoice creation
  brn                   string       Customer BRN at invoice creation
  addressLine1          string       Structured address line 1
  addressLine2          string       Structured address line 2
  addressLine3          string       Structured address line 3
  city                  string       City/town
  stateCode             string       MY state code / SG region
  postalCode            string       Postal/ZIP code
  countryCode           string       ISO 3166-1 alpha-2
```

**New indexes**:
- `by_businessId_lhdnStatus` → `["businessId", "lhdnStatus"]`
- `by_businessId_peppolStatus` → `["businessId", "peppolStatus"]`

### 2. `businesses` — Extended

**New fields** (all `v.optional()`):

```
LHDN Compliance:
  msicCode                    string    5-digit MSIC activity code
  msicDescription             string    Business activity description
  sstRegistrationNumber       string    SST registration number
  lhdnTin                     string    LHDN Tax Identification Number
  businessRegistrationNumber  string    BRN (ROB/ROC number)
  lhdnClientId                string    LHDN OAuth client ID

Peppol:
  peppolParticipantId         string    e.g., "0195:T08GA1234A"
```

**No new indexes** — business e-invoice fields accessed via existing `_id` lookup.

### 3. `customers` — Extended

**New fields** (all `v.optional()`):

```
Tax Identifiers:
  tin                   string       Tax Identification Number
  brn                   string       Business Registration Number
  sstRegistration       string       SST registration number

Peppol:
  peppolParticipantId   string       Peppol endpoint ID

Structured Address (LHDN requirement):
  addressLine1          string       Address line 1
  addressLine2          string       Address line 2
  addressLine3          string       Address line 3
  city                  string       City/town
  stateCode             string       MY state code / SG region
  postalCode            string       Postal/ZIP code
  countryCode           string       ISO 3166-1 alpha-2
```

**New index**:
- `by_businessId_tin` → `["businessId", "tin"]`

## State Transitions

### LHDN Status Lifecycle

```
pending → submitted → valid → cancelled
                    → invalid
```

- `pending`: Queued for submission
- `submitted`: Sent to LHDN API
- `valid`: LHDN validated successfully (triggers longId, hash storage)
- `invalid`: LHDN rejected (triggers validation errors storage)
- `cancelled`: Cancelled after validation

### Peppol Status Lifecycle

```
pending → transmitted → delivered
                      → failed
```

- `pending`: Queued for Peppol transmission
- `transmitted`: Sent via Peppol network
- `delivered`: Delivery confirmed by recipient
- `failed`: Transmission failed (triggers errors storage)

### e-Invoice Type (Classification Only)

```
invoice | credit_note | debit_note | refund_note
```

No transitions — set once at invoice creation/submission time.

## Relationship to Existing Fields

| Existing Field | New Field | Relationship |
|---------------|-----------|-------------|
| `businesses.taxId` | `businesses.lhdnTin` | Coexist — `taxId` is generic, `lhdnTin` is LHDN-specific |
| `customers.taxId` | `customers.tin` | Coexist — `taxId` is generic, `tin` is LHDN-specific TIN |
| `customers.address` | `customers.addressLine1-3, city, stateCode, postalCode, countryCode` | Coexist — free-text `address` kept for backward compat |
| `customerSnapshot.address` | `customerSnapshot.addressLine1-3, city, stateCode, postalCode, countryCode` | Coexist — free-text preserved, structured fields added |
| `customerSnapshot.taxId` | `customerSnapshot.tin`, `customerSnapshot.brn` | Coexist — `taxId` is generic, `tin`/`brn` are LHDN-specific |
