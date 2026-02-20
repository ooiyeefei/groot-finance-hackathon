# API Contracts: e-Invoice UI Forms

**Branch**: `e-inv-ui-forms` | **Date**: 2026-02-20

## 1. Business Profile Update — Extended

**Endpoint**: `PUT /api/v1/account-management/businesses/profile`
**Auth**: Clerk session (existing)

### Request Body (additions to existing)

```typescript
// Existing fields (unchanged):
{
  name?: string
  address?: string              // DEPRECATED — retained for backward compat
  contact_email?: string
  contact_phone?: string
  home_currency?: string
}

// New fields (all optional):
{
  // LHDN Compliance
  lhdn_tin?: string                      // LHDN Tax Identification Number
  business_registration_number?: string  // BRN (ROB/ROC)
  msic_code?: string                     // 5-digit MSIC code
  msic_description?: string              // MSIC activity description
  sst_registration_number?: string       // SST registration
  lhdn_client_id?: string               // LHDN OAuth client ID

  // Peppol
  peppol_participant_id?: string         // Peppol network ID

  // Structured Address (replaces free-form address)
  address_line1?: string
  address_line2?: string
  address_line3?: string
  city?: string
  state_code?: string                    // MY state code
  postal_code?: string
  country_code?: string                  // ISO 3166-1 alpha-2
}
```

### Response

Unchanged — returns `BusinessProfile` object with updated fields.

---

## 2. Convex Mutation — `updateBusinessByStringId` Extended

**File**: `convex/functions/businesses.ts`

### New Args (all `v.optional(v.string())`)

```typescript
args: {
  // ... existing args ...

  // LHDN Compliance
  lhdn_tin: v.optional(v.string()),
  business_registration_number: v.optional(v.string()),
  msic_code: v.optional(v.string()),
  msic_description: v.optional(v.string()),
  sst_registration_number: v.optional(v.string()),
  lhdn_client_id: v.optional(v.string()),

  // Peppol
  peppol_participant_id: v.optional(v.string()),

  // Structured Address
  address_line1: v.optional(v.string()),
  address_line2: v.optional(v.string()),
  address_line3: v.optional(v.string()),
  city: v.optional(v.string()),
  state_code: v.optional(v.string()),
  postal_code: v.optional(v.string()),
}
```

### Field Mapping (snake_case → camelCase)

```typescript
const updates: Record<string, unknown> = {}
if (args.lhdn_tin !== undefined) updates.lhdnTin = args.lhdn_tin
if (args.business_registration_number !== undefined) updates.businessRegistrationNumber = args.business_registration_number
if (args.msic_code !== undefined) updates.msicCode = args.msic_code
if (args.msic_description !== undefined) updates.msicDescription = args.msic_description
if (args.sst_registration_number !== undefined) updates.sstRegistrationNumber = args.sst_registration_number
if (args.lhdn_client_id !== undefined) updates.lhdnClientId = args.lhdn_client_id
if (args.peppol_participant_id !== undefined) updates.peppolParticipantId = args.peppol_participant_id
if (args.address_line1 !== undefined) updates.addressLine1 = args.address_line1
if (args.address_line2 !== undefined) updates.addressLine2 = args.address_line2
if (args.address_line3 !== undefined) updates.addressLine3 = args.address_line3
if (args.city !== undefined) updates.city = args.city
if (args.state_code !== undefined) updates.stateCode = args.state_code
if (args.postal_code !== undefined) updates.postalCode = args.postal_code
```

Note: `country_code` already handled by existing mutation.

---

## 3. Convex Schema — `businesses` Table Addition

**File**: `convex/schema.ts`

### Fields to Add (after `peppolParticipantId`)

```typescript
// Structured Address (LHDN supplier address requirement)
addressLine1: v.optional(v.string()),
addressLine2: v.optional(v.string()),
addressLine3: v.optional(v.string()),
city: v.optional(v.string()),
stateCode: v.optional(v.string()),
postalCode: v.optional(v.string()),
// countryCode already exists on businesses table
```

---

## 4. Customer Mutations — No Changes

`convex/functions/customers.ts` already accepts all e-invoice fields:
- `create()`: accepts tin, brn, sstRegistration, peppolParticipantId, addressLine1-3, city, stateCode, postalCode, countryCode
- `update()`: same fields

No API contract changes needed for customer operations.

---

## 5. Component Interfaces

### CustomerSnapshot (already updated in types/index.ts)

```typescript
export interface CustomerSnapshot {
  businessName: string
  contactPerson?: string
  email: string
  phone?: string
  address?: string         // Legacy — fallback only
  taxId?: string           // Legacy — fallback only
  // e-invoice fields (PR #203):
  tin?: string
  brn?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
}
```

### InvoiceTemplateProps (needs updating in template files)

Templates currently define their own inline `customerSnapshot` type. They should import from `types/index.ts` or be updated to include new fields.

### formatAddress() Utility

```typescript
interface AddressFields {
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
}

function formatAddress(addr: AddressFields, mode?: 'multiline' | 'singleline'): string
```
