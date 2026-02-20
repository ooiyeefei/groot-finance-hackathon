# Implementation Plan: e-Invoice UI Forms

**Branch**: `e-inv-ui-forms` | **Date**: 2026-02-20 | **Spec**: `specs/e-inv-ui-forms/spec.md`
**Input**: Feature specification + GitHub Issue #206

## Summary

Build UI forms for managing e-invoice fields on customers and businesses. Replace legacy free-form address and generic taxId fields with structured LHDN-compliant inputs. Display e-invoice fields on invoice detail views. One schema addition required (business structured address); rest is UI-only.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Radix UI, Zod 3.23.8
**Storage**: Convex (document database with real-time sync)
**Testing**: Manual (no automated test framework in use)
**Target Platform**: Web application (desktop + mobile responsive)
**Project Type**: Web (Next.js monorepo with Convex backend)
**Constraints**: Must follow existing vanilla React form patterns (no form library); all fields optional; semantic design tokens only

## Constitution Check

*Constitution file is a blank template — no project-specific gates defined.*

Gates from `CLAUDE.md`:
- [x] Semantic design tokens only (no hardcoded colors)
- [x] Action buttons: `bg-primary hover:bg-primary/90 text-primary-foreground`
- [x] `npm run build` must pass before completion
- [x] `npx convex deploy --yes` after Convex changes
- [x] Git author: `grootdev-ai` / `dev@hellogroot.com`

## Project Structure

### Documentation (this feature)

```text
specs/e-inv-ui-forms/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output (complete)
├── data-model.md        # Phase 1 output (complete)
├── quickstart.md        # Phase 1 output (complete)
├── contracts/
│   └── api-changes.md   # Phase 1 output (complete)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code Changes

```text
# New files
src/lib/utils/format-address.ts          # formatAddress() utility
src/lib/data/msic-codes.ts               # MSIC code reference data
src/lib/data/state-codes.ts              # Malaysian state codes
src/lib/data/country-codes.ts            # ISO 3166-1 country codes

# Schema & Backend changes
convex/schema.ts                         # Add business structured address fields
convex/functions/businesses.ts           # Extend updateBusinessByStringId mutation

# Service layer
src/domains/account-management/lib/account-management.service.ts  # Extend updateBusinessProfile()

# UI Components — Business
src/domains/account-management/components/business-profile-settings.tsx  # Structured address + e-Invoice section

# UI Components — Customer
src/domains/sales-invoices/components/customer-form.tsx       # Tax section + structured address
src/domains/sales-invoices/components/customer-selector.tsx   # TIN + address in inline form

# UI Components — Invoice
src/domains/sales-invoices/components/invoice-templates/template-modern.tsx   # Bill To extension
src/domains/sales-invoices/components/invoice-templates/template-classic.tsx  # Bill To extension
```

**Structure Decision**: All changes within existing domain structure. 4 new utility/data files, 8 file modifications. No new routes or pages.

## Implementation Phases

### Phase 1: Foundation (Schema + Utilities)

**Goal**: Lay the groundwork — schema change, reference data, shared utility.

**1.1 — Add structured address fields to businesses schema**
- File: `convex/schema.ts`
- Add `addressLine1`, `addressLine2`, `addressLine3`, `city`, `stateCode`, `postalCode` as `v.optional(v.string())` to the `businesses` table (after `peppolParticipantId`, before `updatedAt`)
- Note: `countryCode` already exists on the table
- Deploy: `npx convex deploy --yes`

**1.2 — Create `formatAddress()` utility**
- File: `src/lib/utils/format-address.ts`
- Export `formatAddress(addr, mode)` — supports `'multiline'` and `'singleline'` modes
- Export `hasStructuredAddress(addr)` — returns boolean if any structured field is present
- Handles all fields optional, gracefully skips empty

**1.3 — Create reference data files**
- `src/lib/data/msic-codes.ts` — ~500 MSIC codes with `{ code, description }` format
- `src/lib/data/state-codes.ts` — 16 Malaysian state codes with `{ code, name }` format
- `src/lib/data/country-codes.ts` — ~249 ISO 3166-1 alpha-2 codes with `{ code, name }` format

**Deliverable**: Schema deployed, utilities available for all phases.

---

### Phase 2: Backend Wiring (Convex Mutation + Service)

**Goal**: Enable business e-invoice field persistence through existing API.

**2.1 — Extend Convex mutation `updateBusinessByStringId`**
- File: `convex/functions/businesses.ts`
- Add args for all LHDN, Peppol, and structured address fields (snake_case)
- Add camelCase mapping in the updates object
- Deploy: `npx convex deploy --yes`

**2.2 — Extend service layer `updateBusinessProfile()`**
- File: `src/domains/account-management/lib/account-management.service.ts`
- Add new fields to function signature
- Pass through to Convex mutation call

**Deliverable**: Business e-invoice fields saveable via existing REST endpoint.

---

### Phase 3: Customer Form (P1)

**Goal**: Customer create/edit form with e-invoice fields.

**3.1 — Extend customer form with collapsible sections**
- File: `src/domains/sales-invoices/components/customer-form.tsx`
- Replace `address` textarea with structured address fields in a collapsible "Structured Address" section (collapsed by default)
- Replace `taxId` input with `tin` (TIN) input with format hint and light regex validation
- Add collapsible "Tax & Registration" section with: TIN, BRN, SST Registration, Peppol Participant ID (collapsed by default)
- Add state code dropdown (16 MY states)
- Add country code searchable dropdown
- Update form state management and submit handler
- All new fields optional — existing form behavior unchanged

**3.2 — Extend customer-selector inline form**
- File: `src/domains/sales-invoices/components/customer-selector.tsx`
- Replace `address` textarea with structured address fields (compact layout)
- Replace `taxId` with TIN
- Add "Edit full details" link to customer directory
- Keep inline form minimal — no BRN/SST/Peppol here

**Deliverable**: Customers can have e-invoice fields entered and persisted.

---

### Phase 4: Business Settings (P1)

**Goal**: Business settings with LHDN + Peppol configuration.

**4.1 — Replace business address with structured fields**
- File: `src/domains/account-management/components/business-profile-settings.tsx`
- Replace `address` textarea with structured address fields
- Add state code dropdown and country code dropdown
- Update form state, dirty detection, and submit handler

**4.2 — Add e-Invoice Settings section**
- Same file
- Add collapsible "e-Invoice Settings" section (collapsed by default) with:
  - LHDN TIN, BRN, MSIC Code (with lookup/search), MSIC Description, SST Registration, LHDN Client ID
  - Peppol Participant ID
  - Note on LHDN Client ID: "Client secret must be configured externally"
- MSIC code field: combobox searching `msic-codes.ts` data; selecting auto-populates description
- Wire to existing submit handler (extend API call body)

**Deliverable**: Business LHDN and Peppol settings configurable.

---

### Phase 5: Invoice Display (P1)

**Goal**: Invoice detail shows e-invoice fields from snapshot.

**5.1 — Update invoice templates**
- Files: `template-modern.tsx`, `template-classic.tsx`
- Update inline `customerSnapshot` type to include new fields (or import from types)
- In Bill To section:
  - Replace `address` rendering: use `formatAddress()` when structured fields present, fall back to legacy `address`
  - Replace `taxId` label: show `TIN: {tin}` when present, fall back to `Tax ID: {taxId}` for old invoices
  - Add `BRN: {brn}` (conditional, after TIN)

**Deliverable**: Invoices display e-invoice fields from customer snapshot.

---

### Phase 6: Build Verification

**Goal**: Ensure everything works.

- Run `npm run build` — must pass
- Verify Convex deployment is current
- Manual smoke test:
  1. Create customer with TIN, BRN, structured address → verify persistence
  2. Configure business LHDN settings → verify persistence on reload
  3. Create invoice for customer with e-invoice fields → verify Bill To displays TIN and structured address
  4. Open customer form — verify collapsible sections are collapsed by default
  5. Open business settings — verify e-Invoice section is collapsed by default

## Dependency Order

```
Phase 1 (Foundation)
  ├── 1.1 Schema → 1.2 Utility → 1.3 Reference Data
  │
Phase 2 (Backend) — depends on 1.1
  ├── 2.1 Convex Mutation → 2.2 Service Layer
  │
Phase 3 (Customer Form) — depends on 1.2, 1.3
  ├── 3.1 Customer Form
  ├── 3.2 Customer Selector
  │
Phase 4 (Business Settings) — depends on 2.2, 1.2, 1.3
  ├── 4.1 Business Address
  ├── 4.2 e-Invoice Section
  │
Phase 5 (Invoice Display) — depends on 1.2
  ├── 5.1 Invoice Templates
  │
Phase 6 (Verification) — depends on all above
```

Phases 3 and 5 can run in parallel after Phase 1. Phase 4 depends on Phase 2.

## Complexity Tracking

No constitution violations to justify. The feature extends existing patterns without introducing new architectural concepts.

## Risk Register

| Risk | Mitigation |
|------|-----------|
| MSIC code dataset incomplete | Allow manual fallback entry alongside dropdown search |
| Business address schema deploy breaks existing queries | All fields `v.optional()`, no breaking changes |
| Legacy `taxId`/`address` data orphaned | Schema fields retained; old invoices still render via fallback logic |
| Invoice PDF export doesn't pick up new fields | Out of scope — PDF uses same template components, should inherit changes |
