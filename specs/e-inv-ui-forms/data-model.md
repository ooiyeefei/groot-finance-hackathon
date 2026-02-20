# Data Model: e-Invoice UI Forms

**Branch**: `e-inv-ui-forms` | **Date**: 2026-02-20

## Overview

This feature is primarily UI-only, extending existing forms to expose e-invoice fields that already exist in the Convex schema. One schema addition is required: structured address fields on the `businesses` table. No new tables. No data migrations.

## Entity Changes

### 1. `businesses` — Schema Addition Required

**New fields** (all `v.optional()`, to be added to `convex/schema.ts`):

```
Structured Address (NOT present in PR #203):
  addressLine1          string       Street address line 1
  addressLine2          string       Street address line 2
  addressLine3          string       Street address line 3
  city                  string       City/town
  stateCode             string       MY state code / SG region
  postalCode            string       Postal/ZIP code
  countryCode           string       ISO 3166-1 alpha-2
```

Note: `countryCode` already exists on the businesses table but is generic. The structured address fields above are NEW.

**Fields already in schema** (from PR #203, need UI + API wiring only):

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

**Legacy field deprecation** (schema retained, UI removed):
- `address` — free-form string, replaced by structured fields in UI

### 2. `customers` — No Schema Changes

All fields already in schema from PR #203. Changes are UI-only:

**Fields to expose in UI** (already in schema):

```
Tax Identifiers:
  tin                   string       Tax Identification Number (replaces taxId in UI)
  brn                   string       Business Registration Number
  sstRegistration       string       SST registration number

Peppol:
  peppolParticipantId   string       Peppol endpoint ID

Structured Address:
  addressLine1          string       Address line 1
  addressLine2          string       Address line 2
  addressLine3          string       Address line 3
  city                  string       City/town
  stateCode             string       MY state code / SG region
  postalCode            string       Postal/ZIP code
  countryCode           string       ISO 3166-1 alpha-2
```

**Legacy field deprecation** (schema retained, UI removed):
- `taxId` — generic tax ID, replaced by `tin` in UI
- `address` — free-form string, replaced by structured fields in UI

### 3. `customerSnapshot` (embedded in `sales_invoices`) — No Schema Changes

Already includes all e-invoice fields from PR #203. Template rendering needs updating.

**Fields available but not rendered in templates**:

```
tin, brn, addressLine1, addressLine2, addressLine3,
city, stateCode, postalCode, countryCode
```

### 4. New Static Data Files

```
MSIC Codes (~500 entries):
  code                  string       5-digit MSIC code
  description           string       Business activity description

Malaysian State Codes (16 entries):
  code                  string       3-letter state code (JHR, KDH, etc.)
  name                  string       Full state name

Country Codes (~249 entries):
  code                  string       ISO 3166-1 alpha-2
  name                  string       Country name
```

## API Layer Changes

### `updateBusinessByStringId` Convex Mutation

**Current args** (snake_case):
```
businessId, name, tax_id, address, contact_email,
contact_phone, home_currency, country_code, logo_url, logo_fallback_color
```

**Args to add** (snake_case → camelCase mapping):
```
lhdn_tin          → lhdnTin
business_registration_number → businessRegistrationNumber
msic_code         → msicCode
msic_description  → msicDescription
sst_registration_number → sstRegistrationNumber
lhdn_client_id   → lhdnClientId
peppol_participant_id → peppolParticipantId
address_line1     → addressLine1
address_line2     → addressLine2
address_line3     → addressLine3
city              → city
state_code        → stateCode
postal_code       → postalCode
```

### `updateBusinessProfile()` Service Function

**Fields to add** to function signature (matching Convex mutation additions above).

### REST Endpoint

No changes to route handler — it's a generic pass-through.

## Field Flow Summary

```
Customer Form UI
  ↓ (direct Convex mutation)
customers.create / customers.update
  ↓ (writes to)
customers table
  ↓ (snapshot at invoice creation via customer-selector.tsx)
customerSnapshot (embedded in sales_invoices)
  ↓ (rendered by)
Invoice Templates (modern + classic)

Business Settings UI
  ↓ (REST API)
PUT /api/v1/.../businesses/profile
  ↓ (service layer)
updateBusinessProfile()
  ↓ (Convex mutation)
updateBusinessByStringId
  ↓ (writes to)
businesses table
```

## Shared Utilities

### `formatAddress()`

**Location**: `src/lib/utils/format-address.ts`

**Input**: Object with optional fields: `addressLine1`, `addressLine2`, `addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode`

**Output**: Formatted string (multi-line or single-line variant)

**Multi-line format**:
```
addressLine1
addressLine2
addressLine3
postalCode city
stateCode
countryCode
```

**Single-line format**: `addressLine1, city, stateCode postalCode, countryCode`

**Fallback**: If no structured fields present, return empty string (caller can fall back to legacy `address`).
