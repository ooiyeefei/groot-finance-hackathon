# Feature Specification: Customer & Business e-Invoice Fields UI

**Feature Branch**: `e-inv-ui-forms`
**Created**: 2026-02-20
**Status**: Draft
**Input**: GitHub Issue #206 — Build UI forms for managing e-invoice related fields on customers and businesses (TIN, BRN, structured address, MSIC codes, Peppol Participant IDs)
**Related Issues**: #198 (schema changes — completed via PR #203), #75 (LHDN MyInvois), #196 (Peppol integration), #204 (LHDN submission UI), #205 (Peppol transmission UI)

## Clarifications

### Session 2026-02-20

- Q: How should the new e-invoice fields be organized on the customer form? → A: Collapsible sections — "Tax & Registration" (TIN, BRN, SST, Peppol) and "Structured Address" (line1-3, city, state, postal, country), collapsed by default.
- Q: When both legacy free-text address and structured address fields exist, which should be displayed on invoices? → A: Replace the legacy free-text address field entirely with structured address fields. Use a `formatAddress()` utility to merge structured fields into a single display string when needed. Structured is the only input path going forward.
- Q: What level of TIN validation should be applied on the customer form? → A: Light regex — must match pattern like `C` or `IG` prefix + digits (e.g., `C21638015020`), with inline format hint. LHDN does authoritative validation at submission time.
- Q: Should the customer-selector inline form also get the full set of e-invoice fields? → A: Minimal — inline form shows only TIN and structured address (fields that appear on the invoice), with an "Edit full details" link to the customer directory. BRN, SST, Peppol managed exclusively in the full customer form.
- Q: How should business e-invoice settings be saved? → A: Extend the existing REST endpoint (`PUT /api/v1/.../businesses/profile`) — add LHDN + Peppol fields to the same request body and handler. No new routes or API patterns.
- Q: Should business address also be replaced with structured fields (same as customers)? → A: Yes — replace the business address textarea with structured fields (line1-3, city, state, postal, country). Consistent with customer form and ensures LHDN compliance for supplier address.
- Q: How should the existing generic `taxId` field on customers relate to the new LHDN `tin` field? → A: Replace `taxId` with TIN in the customer form UI. Stop collecting `taxId`; keep it in the schema for backward compat but no longer expose in forms. TIN is the primary tax identifier going forward.

## Prerequisites (Completed)

Customer e-invoice schema fields are deployed via PR #203. Backend mutations (`customers.create`, `customers.update`) already accept all new fields. `customer-selector.tsx` already maps new fields to `customerSnapshot`.

**Schema gap identified**: The `businesses` table does NOT have structured address fields (`addressLine1-3`, `city`, `stateCode`, `postalCode`, `countryCode`). PR #203 added these for `customers` only. A small schema addition is needed to add structured address fields to the `businesses` table. The business profile REST endpoint also needs extension to accept the new LHDN/Peppol/address fields.

## Field Reuse Analysis

LHDN e-invoices require supplier (business) and buyer (customer) details. Many of these **already exist** in the current schema and UI. Only compliance-specific fields are truly new.

**Business (Supplier) — Already collected, reusable for LHDN:**
- `businesses.name` → Supplier Name
- `businesses.contactEmail` → Supplier Email
- `businesses.contactPhone` → Supplier Phone
- `businesses.address` → Supplier Address *(being replaced with structured fields)*

**Business (Supplier) — Truly new fields needing UI:**
- `lhdnTin` — LHDN Tax Identification Number (different from generic `taxId`)
- `businessRegistrationNumber` — BRN / SSM registration
- `msicCode` + `msicDescription` — LHDN industry classification
- `sstRegistrationNumber` — SST registration
- `lhdnClientId` — LHDN API OAuth credential
- `peppolParticipantId` — Peppol network ID

**Customer (Buyer) — Already collected, reusable for LHDN:**
- `customers.businessName` → Buyer Name
- `customers.email` → Buyer Email
- `customers.phone` → Buyer Phone

**Customer (Buyer) — Truly new fields needing UI:**
- `tin` — TIN (replaces generic `taxId` in UI)
- `brn` — Business Registration Number
- `sstRegistration` — SST registration
- `peppolParticipantId` — Peppol network ID
- Structured address fields (replacing legacy free-text `address`)

**Legacy field deprecation:**
- `customers.taxId` — no longer collected in UI; replaced by `tin`. Schema field retained for backward compatibility.
- `customers.address` (free-form) — no longer collected in UI; replaced by structured fields. Schema field retained.
- `businesses.address` (free-form) — same treatment as customer address.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Tax & Address Fields to Customer Form (Priority: P1)

A business user creates or edits a customer record and enters their TIN (Tax Identification Number), BRN (Business Registration Number), SST registration number, and structured address (address lines, city, state, postal code, country). These fields are required by LHDN for buyer details on e-invoices. Without them, LHDN submissions will be rejected. The new fields are organized into two collapsible sections — "Tax & Registration" (TIN, BRN, SST, Peppol) and "Structured Address" (addressLine1-3, city, stateCode, postalCode, countryCode) — both collapsed by default to keep the form scannable for users who don't yet need e-invoice fields.

**Why this priority**: LHDN validates buyer (customer) details on every e-invoice. Missing TIN or improperly structured addresses cause rejection. This is the highest-impact UI change — it enables the entire downstream e-invoicing workflow.

**Independent Test**: Can be fully tested by creating a new customer with TIN, BRN, and structured address, then verifying fields persist and display correctly in customer list and edit form. Delivers core data entry for LHDN compliance.

**Acceptance Scenarios**:

1. **Given** the customer create form is open, **When** the user enters TIN, BRN, SST registration, and structured address fields (addressLine1, city, stateCode, postalCode, countryCode), **Then** all fields are saved to the customer record. The existing generic `taxId` field is replaced by TIN in the UI.
2. **Given** a customer with existing e-invoice fields, **When** the user opens the edit form, **Then** all e-invoice fields are pre-populated with current values.
3. **Given** a customer record with a Malaysian TIN, **When** the user views the customer detail, **Then** the TIN is displayed alongside other customer information.
4. **Given** the customer form, **Then** the legacy free-text `address` textarea is replaced by structured address fields (addressLine1-3, city, stateCode, postalCode, countryCode). A `formatAddress()` utility merges structured fields into a single display string where a one-line address is needed.

---

### User Story 2 - Configure Business LHDN e-Invoice Settings (Priority: P1)

A business administrator configures their company's LHDN compliance details — TIN, BRN, MSIC code + description, SST registration number, and LHDN OAuth client ID — in the business settings page. These are mandatory for any LHDN e-invoice submission. Note: supplier name, email, and phone are already collected in the existing business profile section and will be reused for LHDN submissions — no re-entry needed. The existing free-form business address textarea is replaced with structured address fields for LHDN compliance.

**Why this priority**: Without business-level LHDN configuration, no invoice can be submitted to LHDN. This blocks issues #204 (LHDN submission UI) and #75 (LHDN MyInvois integration).

**Independent Test**: Can be tested by navigating to business settings, entering LHDN fields, saving, and verifying they persist and display correctly on page reload.

**Acceptance Scenarios**:

1. **Given** the business settings page, **When** the user navigates to a new "e-Invoice Settings" section, **Then** they see only the compliance-specific fields: LHDN TIN, BRN, MSIC Code, MSIC Description, SST Registration, and LHDN Client ID. Supplier name/email/phone are already in the main business profile section.
2. **Given** the user enters valid MSIC code and description, **When** they save, **Then** the values persist on the business record.
3. **Given** the LHDN Client ID field, **Then** there is a note indicating the client secret must be configured externally (not stored in the database).
4. **Given** the business has not yet configured LHDN fields, **When** viewing the e-Invoice Settings section, **Then** all fields show as empty with appropriate placeholder text.
5. **Given** the existing business address textarea, **Then** it is replaced with structured address fields (addressLine1-3, city, stateCode, postalCode, countryCode) in the main business profile section, consistent with the customer form.

---

### User Story 3 - Add Peppol Participant ID to Customer Form (Priority: P2)

A business user adds a Peppol Participant ID to a customer record so the customer can receive invoices via the Peppol InvoiceNow network. The ID follows a specific format: `{scheme}:{id}` (e.g., `0195:T08GA1234A`).

**Why this priority**: Required for Peppol/InvoiceNow integration but lower priority than LHDN fields since LHDN mandates are more immediate for Malaysian businesses.

**Independent Test**: Can be tested by adding a Peppol Participant ID to a customer, verifying format hint is shown, and confirming the value persists.

**Acceptance Scenarios**:

1. **Given** the customer form, **When** the user enters a Peppol Participant ID, **Then** it is saved to the customer record.
2. **Given** the Peppol Participant ID field, **Then** a format hint is displayed: `0195:TXXXXXXXXX`.

---

### User Story 4 - Configure Business Peppol Participant ID (Priority: P2)

A business administrator registers their Peppol Participant ID in business settings so their business can participate in the Peppol InvoiceNow network.

**Why this priority**: Required for Peppol participation but only affects businesses using InvoiceNow.

**Independent Test**: Can be tested by adding a Peppol Participant ID to business settings and verifying persistence.

**Acceptance Scenarios**:

1. **Given** the business settings e-Invoice section, **When** the user enters their Peppol Participant ID, **Then** it is saved to the business record.
2. **Given** the Peppol field, **Then** a format validation hint is shown: `{scheme}:{id}` (e.g., `0195:T08GA1234A`).

---

### User Story 5 - Display e-Invoice Fields on Invoice Detail (Priority: P1)

When viewing an invoice, the "Bill To" section shows the customer's TIN, BRN, and structured address from the `customerSnapshot` (point-in-time data captured at invoice creation). This data is what gets submitted to LHDN, so it must be visible for verification.

**Why this priority**: Users need to verify the buyer details that will be submitted to LHDN before initiating submission. Without displaying these fields, there's no way to confirm correctness.

**Independent Test**: Can be tested by creating an invoice for a customer with TIN and structured address, then verifying the invoice detail view shows these fields in the Bill To section.

**Acceptance Scenarios**:

1. **Given** an invoice whose `customerSnapshot` includes TIN and BRN, **When** viewing the invoice detail, **Then** TIN and BRN are displayed in the Bill To section.
2. **Given** an invoice with structured address in the snapshot, **When** viewing the invoice detail, **Then** the structured address is rendered as a formatted address block using `formatAddress()`. Legacy free-text `address` is only shown for older invoices that pre-date structured address fields.
3. **Given** an invoice where the customer had no TIN at creation time, **When** viewing the invoice detail, **Then** the TIN field is not shown (no empty placeholder).

---

### User Story 6 - MSIC Code Lookup for Business Settings (Priority: P2)

When configuring the MSIC code in business settings, the user can search or select from a reference dataset of common MSIC codes rather than manually entering the 5-digit code.

**Why this priority**: MSIC codes are obscure 5-digit codes. Without lookup, users would need to find the correct code from an external reference, increasing friction and error.

**Independent Test**: Can be tested by opening the MSIC field, searching for a business activity, selecting a code, and verifying both the code and description are populated.

**Acceptance Scenarios**:

1. **Given** the MSIC code field in business settings, **When** the user types a search term, **Then** matching MSIC codes and descriptions are shown.
2. **Given** the user selects an MSIC code from the dropdown, **Then** both the MSIC code and MSIC description fields are auto-populated.

---

### Edge Cases

- What happens when a user enters a TIN in an invalid format? The system shows inline validation: TIN must match `C` or `IG` prefix + digits pattern. Hint text shows example: `C21638015020`. Non-matching input shows a warning but does not block save (LHDN does authoritative check).
- What happens when structured address has only partial fields (e.g., addressLine1 and city but no stateCode)? All fields are optional — partial entry is valid. `formatAddress()` gracefully skips empty fields.
- What about existing customers with legacy free-text `address` but no structured fields? Their legacy address is preserved in the database. On edit, the structured fields start empty — the user should re-enter the address in structured form. The legacy `address` field in the schema is retained for backward compatibility but no longer exposed in the UI.
- What if the MSIC code reference dataset doesn't include the user's business activity? The user should be able to manually enter a 5-digit code and description as a fallback.
- What happens when editing a customer's structured address after invoices exist? The existing invoice snapshots retain the original data — only future invoices use the updated address.
- How are Malaysian state codes presented? As a dropdown with standard state codes (JHR, KDH, KTN, MLK, NSN, PHG, PRK, PLS, PNG, SBH, SWK, SGR, TRG, WPK, WPP, WPL).
- How are country codes presented? As a searchable dropdown using ISO 3166-1 alpha-2 codes.
- What about existing customers with a `taxId` value but no `tin`? The legacy `taxId` value remains in the database. On the edit form, the TIN field starts empty — the user should enter the LHDN-specific TIN. The old `taxId` is not auto-migrated to `tin` since they may differ semantically.
- What about the existing business free-form `address`? Same treatment as customer address — structured fields replace it in the UI. Legacy value retained in schema for backward compat. Existing business address is not auto-migrated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Customer create/edit form MUST include input fields for TIN, BRN, SST Registration, Peppol Participant ID, and structured address (addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode), organized into two collapsible sections — "Tax & Registration" and "Structured Address" — collapsed by default.
- **FR-002**: Business settings page MUST include an "e-Invoice Settings" section with only compliance-specific fields: LHDN TIN, BRN, MSIC Code, MSIC Description, SST Registration Number, LHDN Client ID, and Peppol Participant ID. Supplier name, email, and phone are reused from the existing business profile — no duplicate fields.
- **FR-003**: Invoice detail view MUST display TIN, BRN, and structured address from `customerSnapshot` in the Bill To section when these fields are present.
- **FR-004**: Malaysian TIN MUST be validated with a light regex: `C` or `IG` prefix followed by digits (e.g., `C21638015020`). An inline format hint MUST be displayed. Authoritative validation deferred to LHDN at submission time.
- **FR-005**: Peppol Participant ID MUST show format hint (`{scheme}:{id}`) on both customer and business forms.
- **FR-006**: MSIC code field MUST support lookup/search from a reference dataset of common MSIC codes.
- **FR-007**: Malaysian state code MUST be presented as a dropdown selection.
- **FR-008**: Country code MUST be presented as a searchable dropdown using ISO 3166-1 alpha-2.
- **FR-009**: All new form fields MUST be optional — no field should block form submission if left empty.
- **FR-010**: LHDN Client ID field MUST include a note that the client secret is configured externally.
- **FR-011**: The customer inline edit form in `customer-selector.tsx` MUST show only TIN and structured address fields (the fields that appear on the invoice). An "Edit full details" link MUST navigate to the customer directory for managing BRN, SST Registration, and Peppol Participant ID.
- **FR-012**: The legacy free-text `address` textarea MUST be replaced by structured address fields in all customer forms. A `formatAddress()` utility MUST be provided to merge structured fields into a single display string.
- **FR-013**: Invoice detail MUST display structured address via `formatAddress()` when structured fields exist in the snapshot, falling back to legacy `address` only for pre-existing invoices.
- **FR-014**: The generic `taxId` field MUST be replaced by TIN in the customer form UI. The `taxId` schema field is retained for backward compatibility but no longer collected.
- **FR-015**: The business profile address textarea MUST be replaced with structured address fields (addressLine1-3, city, stateCode, postalCode, countryCode), consistent with the customer form.
- **FR-016**: The `formatAddress()` utility MUST be used consistently across business profile display, customer display, and invoice templates to render structured address as a single formatted string.

### Key Entities

- **Customer Form (extended)**: Existing customer create/edit form extended with TIN, BRN, SST Registration, Peppol Participant ID, and structured address fields.
- **Business Settings (extended)**: Existing business settings page extended with an e-Invoice Settings section for LHDN and Peppol configuration.
- **Invoice Detail (extended)**: Existing invoice preview/detail extended to display snapshot e-invoice fields in the Bill To section.
- **MSIC Reference Data**: Static or queryable dataset of ~500 common MSIC codes with descriptions for lookup.

## Assumptions

- The existing vanilla React form pattern (no form library, `useState` for state, inline Zod validation) will be followed.
- The existing customer form component (`customer-form.tsx`) and customer selector component (`customer-selector.tsx`) will be extended, not replaced.
- The existing business settings component (`business-profile-settings.tsx`) will be extended with a new e-Invoice section and have its address field replaced with structured fields.
- Invoice templates (modern, classic) will both be updated to display the new fields.
- MSIC reference data can be a static TypeScript file (~500 entries) rather than a Convex table, since the codes are standardized and rarely change.
- The existing REST API endpoint (`PUT /api/v1/.../businesses/profile`) will be extended with LHDN + Peppol fields plus structured address fields in the same request body — no new endpoints needed.
- Business name, email, and phone are reused from existing business profile for LHDN supplier details — the e-Invoice section does not duplicate these fields.
- The `businesses` table needs structured address fields added to the schema (`addressLine1-3`, `city`, `stateCode`, `postalCode`, `countryCode`) — confirmed NOT present in PR #203, which only added these for `customers`. This is a required schema change.
- After adding business structured address fields to `convex/schema.ts`, `npx convex deploy --yes` must be run (per CLAUDE.md mandatory rules).
- Legacy `taxId` (customers) and `address` (both entities) schema fields are preserved but no longer exposed in UI forms.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a customer with TIN, BRN, and structured address — fields persist and display correctly on reload.
- **SC-002**: Users can configure all LHDN business fields (TIN, BRN, MSIC, SST) in business settings — fields persist across sessions.
- **SC-003**: Invoice detail view shows TIN, BRN, and structured address from customerSnapshot when present.
- **SC-004**: MSIC code lookup returns relevant results when searching by activity description.
- **SC-005**: All existing customer/business/invoice workflows remain unaffected — no regressions from form extensions.
- **SC-006**: All new fields are optional — forms submit successfully with any combination of new fields empty or filled.
