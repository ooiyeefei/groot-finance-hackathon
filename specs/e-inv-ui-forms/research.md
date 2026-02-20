# Research: e-Invoice UI Forms

**Branch**: `e-inv-ui-forms` | **Date**: 2026-02-20

## 1. Business Profile API Extension Pattern

**Decision**: Extend the existing whitelist pattern in the service layer, Convex mutation, and form component.

**Rationale**: The current flow is: Form → REST endpoint (`PUT /api/v1/account-management/businesses/profile`) → Service (`updateBusinessProfile()`) → Convex mutation (`updateBusinessByStringId`). The service function uses a whitelist approach — only fields explicitly listed in the function signature are accepted. Adding new fields requires changes at all three layers but follows an established pattern.

**Current chain**:
- `route.ts` — passes JSON body to service (generic, no whitelist)
- `account-management.service.ts:updateBusinessProfile()` — whitelists: name, logo_url, logo_fallback_color, home_currency, address, contact_email, contact_phone
- `convex/functions/businesses.ts:updateBusinessByStringId` — accepts: name, tax_id, address, contact_email, contact_phone, home_currency, country_code, logo_url, logo_fallback_color (snake_case → camelCase conversion)

**Fields to add at each layer**:
- Service: `lhdn_tin`, `business_registration_number`, `msic_code`, `msic_description`, `sst_registration_number`, `lhdn_client_id`, `peppol_participant_id`, `address_line1-3`, `city`, `state_code`, `postal_code`, `country_code`
- Convex mutation: same fields (with camelCase mapping)

**Alternatives considered**:
- New dedicated endpoint: Rejected — adds complexity, the existing endpoint already handles business updates
- Direct Convex mutation from client: Rejected — breaks the REST pattern used for business profile

## 2. Business Schema — Structured Address Gap

**Decision**: Add structured address fields (`addressLine1`, `addressLine2`, `addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode`) to the `businesses` table in `convex/schema.ts`.

**Rationale**: PR #203 added structured address fields to the `customers` table but NOT to `businesses`. The `businesses` table only has `address: v.optional(v.string())` (free-form). LHDN requires a structured supplier address for e-invoice submissions. This is a required schema change.

**Alternatives considered**:
- Parse free-form address at submission time: Rejected — unreliable, can't guarantee LHDN field mapping
- Store structured address only in `invoiceSettings`: Rejected — `invoiceSettings` already has `companyAddress` as free-form string; adding structured fields there creates nested complexity

**Deployment requirement**: `npx convex deploy --yes` after schema change.

## 3. Customer `taxId` → `tin` Replacement

**Decision**: Replace the generic `taxId` input with `tin` (TIN) in the customer form UI. Keep `taxId` in the Convex schema for backward compatibility.

**Rationale**: The `taxId` field on customers is a generic identifier. LHDN requires a specific TIN (Tax Identification Number) with format `C`/`IG` prefix + digits. Having both fields in the UI would confuse users. The `tin` field has clear semantics tied to LHDN compliance.

**Migration note**: Existing `taxId` values are NOT auto-migrated to `tin`. Users must enter TIN separately since the values may differ semantically.

**Alternatives considered**:
- Keep both fields: Rejected — confusing UX, users wouldn't know the difference
- Auto-sync: Rejected — `taxId` and `tin` may differ (e.g., `taxId` could be a foreign tax ID)

## 4. Invoice Template Extension Pattern

**Decision**: Extend the `InvoiceTemplateProps` interface and both template components (modern + classic) to render TIN, BRN, and structured address from `customerSnapshot`.

**Rationale**: Both templates use an identical `InvoiceTemplateProps` interface with `customerSnapshot` containing: businessName, contactPerson, email, phone, address, taxId. The TypeScript interfaces in the template files need updating (they duplicate the type instead of importing it). The `CustomerSnapshot` interface in `src/domains/sales-invoices/types/index.ts` already includes the new fields.

**Current Bill To render order** (both templates):
1. Business Name (always)
2. Contact Person (conditional)
3. Address (conditional)
4. Email
5. Phone (conditional)
6. Tax ID (conditional)

**New render order** (proposed):
1. Business Name (always)
2. Contact Person (conditional)
3. Structured address via `formatAddress()` OR legacy address for old invoices
4. Email
5. Phone (conditional)
6. TIN (conditional, replaces Tax ID label)
7. BRN (conditional)

**Alternatives considered**:
- Separate "e-Invoice Details" section on invoice: Rejected — TIN and address belong in the Bill To section per LHDN format
- Only update modern template: Rejected — both templates need parity

## 5. `formatAddress()` Utility

**Decision**: Create a shared `formatAddress()` utility in `src/lib/utils/` that merges structured address fields into a single formatted string.

**Rationale**: Structured address needs rendering in multiple contexts: customer list, customer detail, business profile display, invoice templates, and invoice PDF export. A single utility avoids inconsistent formatting.

**Proposed format**:
```
addressLine1
addressLine2            (if present)
addressLine3            (if present)
postalCode city         (if either present)
stateCode               (if present)
countryCode             (if present)
```

Single-line variant: `addressLine1, city, stateCode postalCode, countryCode`

**Alternatives considered**:
- Inline formatting in each component: Rejected — duplicates logic across 5+ locations
- Full `Address` component instead of utility: Could be useful but utility is the minimum viable approach; component can wrap it later

## 6. MSIC Code Reference Data

**Decision**: Static TypeScript file with ~500 common MSIC codes, filterable by code or description.

**Rationale**: MSIC codes follow the Malaysian Standard Industrial Classification 2008. The dataset is standardized by the Department of Statistics Malaysia and changes rarely. A static file avoids Convex table overhead and deployment complexity.

**File location**: `src/lib/data/msic-codes.ts`

**Format**:
```typescript
export const MSIC_CODES = [
  { code: "01111", description: "Growing of maize" },
  { code: "46100", description: "Wholesale on a fee or contract basis" },
  // ... ~500 entries
]
```

**Alternatives considered**:
- Convex table: Rejected — adds migration complexity, table maintenance, and query overhead for static data
- External API: Rejected — no reliable public MSIC API exists; adds latency and failure point
- Manual entry only: Rejected — 5-digit codes are not user-friendly without lookup

## 7. Form Collapsible Sections Pattern

**Decision**: Use native `<details>`/`<summary>` HTML elements or the existing Radix `Collapsible` component for e-invoice field sections on the customer form.

**Rationale**: The app uses Radix UI primitives. A `Collapsible` component from Radix provides accessible expand/collapse behavior. The sections should be collapsed by default so users who don't need e-invoicing see a clean form.

**Alternatives considered**:
- Custom accordion: Rejected — Radix `Collapsible` already available and accessible
- Always-visible sections: Rejected — floods UI for users not using e-invoicing

## 8. State Code and Country Code Dropdowns

**Decision**: Static arrays for MY state codes (16 entries) and ISO 3166-1 alpha-2 country codes (~249 entries).

**Malaysian state codes**:
```
JHR (Johor), KDH (Kedah), KTN (Kelantan), MLK (Melaka), NSN (Negeri Sembilan),
PHG (Pahang), PRK (Perak), PLS (Perlis), PNG (Pulau Pinang), SBH (Sabah),
SWK (Sarawak), SGR (Selangor), TRG (Terengganu), WPK (W.P. Kuala Lumpur),
WPP (W.P. Putrajaya), WPL (W.P. Labuan)
```

**Country codes**: Standard ISO 3166-1 alpha-2 list. Country dropdown should be searchable (combobox pattern) given ~249 options. State dropdown is a simple select (16 options).

**File locations**: `src/lib/data/state-codes.ts`, `src/lib/data/country-codes.ts`
