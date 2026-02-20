# Tasks: e-Invoice UI Forms

**Input**: Design documents from `/specs/e-inv-ui-forms/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/api-changes.md (complete)

**Tests**: Not requested in feature spec. Manual smoke tests listed in Phase 8.

**Organization**: Tasks grouped by user story. P1 stories (US1, US2, US5) form the MVP. P2 stories (US3, US4, US6) are incremental additions.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- All file paths are relative to repository root

---

## Phase 1: Setup (Schema & Deploy)

**Purpose**: Add missing structured address fields to businesses table and deploy schema.

- [x] T001 Add structured address fields (`addressLine1`, `addressLine2`, `addressLine3`, `city`, `stateCode`, `postalCode`) to the `businesses` table in `convex/schema.ts` — insert after `peppolParticipantId` (line ~166), before `updatedAt`. All fields `v.optional(v.string())`. Note: `countryCode` already exists on businesses table.
- [x] T002 Run `npx convex deploy --yes` to deploy the businesses schema change to production

**Checkpoint**: Schema deployed. All downstream phases can proceed.

---

## Phase 2: Foundational (Shared Utilities & Reference Data)

**Purpose**: Create shared utilities and reference data files that multiple user stories depend on.

**CRITICAL**: These must complete before US1, US2, and US5 implementation.

- [x] T003 Create `formatAddress()` utility in `src/lib/utils/format-address.ts` — export `formatAddress(addr, mode)` supporting `'multiline'` and `'singleline'` modes; export `hasStructuredAddress(addr)` returning boolean. Handle all fields optional, skip empty fields gracefully. See `specs/e-inv-ui-forms/data-model.md` for format spec.
- [x] T004 [P] Create Malaysian state codes reference data in `src/lib/data/state-codes.ts` — export `MALAYSIAN_STATE_CODES` array of `{ code: string, name: string }` with 16 entries (JHR, KDH, KTN, MLK, NSN, PHG, PRK, PLS, PNG, SBH, SWK, SGR, TRG, WPK, WPP, WPL)
- [x] T005 [P] Create ISO 3166-1 country codes reference data in `src/lib/data/country-codes.ts` — export `COUNTRY_CODES` array of `{ code: string, name: string }` with ~249 entries sorted alphabetically by name. Default `MY` (Malaysia).
- [x] T006 [P] Create MSIC codes reference data in `src/lib/data/msic-codes.ts` — export `MSIC_CODES` array of `{ code: string, description: string }` with ~500 common Malaysian MSIC codes (5-digit format). Source from Department of Statistics Malaysia MSIC 2008 classification.

**Checkpoint**: Shared utilities and data files ready for all user stories.

---

## Phase 3: Foundational (Backend Wiring)

**Purpose**: Extend Convex mutation and service layer so business settings can persist e-invoice fields.

**CRITICAL**: Must complete before US2 (Business Settings) and US4 (Business Peppol).

- [x] T007 Extend `updateBusinessByStringId` mutation args in `convex/functions/businesses.ts` — add `v.optional(v.string())` args for: `lhdn_tin`, `business_registration_number`, `msic_code`, `msic_description`, `sst_registration_number`, `lhdn_client_id`, `peppol_participant_id`, `address_line1`, `address_line2`, `address_line3`, `city`, `state_code`, `postal_code`. Add snake_case → camelCase field mapping in the updates object. See `specs/e-inv-ui-forms/contracts/api-changes.md` for exact mappings.
- [x] T008 Run `npx convex deploy --yes` to deploy the updated mutation
- [x] T009 Extend `updateBusinessProfile()` function signature in `src/domains/account-management/lib/account-management.service.ts` — add same fields to the function signature and pass them through to the Convex mutation call

**Checkpoint**: Business e-invoice fields persistable via REST API.

---

## Phase 4: User Story 1 — Add Tax & Address Fields to Customer Form (Priority: P1) MVP

**Goal**: Customer create/edit form with TIN (replacing taxId), BRN, SST Registration, and structured address replacing legacy free-form address. Organized in collapsible sections, collapsed by default.

**Independent Test**: Create a new customer with TIN, BRN, and structured address. Verify fields persist and display correctly on reload in edit form.

### Implementation for User Story 1

- [x] T010 [US1] Extend customer form in `src/domains/sales-invoices/components/customer-form.tsx` — replace the `address` textarea with structured address fields (addressLine1, addressLine2, addressLine3, city, stateCode dropdown, postalCode, countryCode searchable dropdown) inside a collapsible "Structured Address" section, collapsed by default. Use Radix `Collapsible` or `<details>`/`<summary>`. Import state codes from `src/lib/data/state-codes.ts` and country codes from `src/lib/data/country-codes.ts`.
- [x] T011 [US1] In the same `customer-form.tsx` — replace the `taxId` text input with a `tin` (TIN) input with placeholder text `C21638015020` and light regex validation (`/^(C|IG)\d+$/`). Add a collapsible "Tax & Registration" section (collapsed by default) containing: TIN, BRN text input, SST Registration text input. Update form state (`useState`) to track all new fields. Update the `onSubmit` handler to pass `tin`, `brn`, `sstRegistration`, `addressLine1`-`addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode` instead of `address` and `taxId`.
- [x] T012 [US1] Extend customer-selector inline form in `src/domains/sales-invoices/components/customer-selector.tsx` — replace `address` textarea with compact structured address fields (addressLine1, city, stateCode, postalCode, countryCode). Replace `taxId` input with `tin` (TIN) input. Add an "Edit full details" link/button that navigates to the customer directory for managing BRN, SST, Peppol. Keep inline form minimal (no BRN/SST/Peppol fields).
- [x] T013 [US1] Update the inline `customerSnapshot` type references in `customer-selector.tsx` to ensure `tin` (not `taxId`) is mapped to the snapshot on save. Verify the existing mapping logic (lines ~94-103) already handles `tin`, `brn`, and structured address fields from the customer object to the snapshot.

**Checkpoint**: Customer forms collect e-invoice fields. TIN replaces taxId. Structured address replaces free-form. Sections collapsed by default for progressive disclosure.

---

## Phase 5: User Story 2 — Configure Business LHDN e-Invoice Settings (Priority: P1)

**Goal**: Business settings page with structured address replacing free-form, plus a new e-Invoice Settings section for LHDN compliance fields (TIN, BRN, MSIC, SST, Client ID).

**Independent Test**: Navigate to business settings, enter LHDN fields (TIN, BRN, MSIC code, SST), save, reload page, verify all fields persist.

### Implementation for User Story 2

- [x] T014 [US2] In `src/domains/account-management/components/business-profile-settings.tsx` — replace the `businessAddress` textarea with structured address fields (addressLine1, addressLine2, addressLine3, city, stateCode dropdown, postalCode, countryCode dropdown). Add `useState` for each new field. Update dirty state detection to include structured fields. Update the submit handler to send structured address fields instead of `address` to the API endpoint.
- [x] T015 [US2] In the same `business-profile-settings.tsx` — add a collapsible "e-Invoice Settings" section (collapsed by default) below the business profile section. Include inputs for: LHDN TIN (with format hint `C21638015020`), Business Registration Number (BRN), MSIC Code (as combobox — see T016), MSIC Description (read-only, auto-populated from MSIC selection), SST Registration Number, LHDN Client ID (with helper text: "Client secret must be configured externally via AWS Secrets Manager"). Add `useState` for each field. Wire to existing save handler — extend the API request body with these fields.
- [x] T016 [US2] Implement MSIC code combobox/search within the e-Invoice Settings section — import `MSIC_CODES` from `src/lib/data/msic-codes.ts`. Allow typing to filter by code or description. On selection, auto-populate both `msicCode` and `msicDescription` state. Allow manual entry fallback (user can type a custom 5-digit code if their activity isn't in the reference list).
- [x] T017 [US2] Load existing business e-invoice field values when the settings page mounts — fetch `lhdnTin`, `businessRegistrationNumber`, `msicCode`, `msicDescription`, `sstRegistrationNumber`, `lhdnClientId`, and structured address fields from the business record and populate form state on mount. Ensure dirty state detection accounts for these initial values.

**Checkpoint**: Business LHDN settings configurable and persisted. Structured address replaces free-form.

---

## Phase 6: User Story 5 — Display e-Invoice Fields on Invoice Detail (Priority: P1)

**Goal**: Invoice detail Bill To section shows TIN, BRN, and structured address from `customerSnapshot`.

**Independent Test**: Create an invoice for a customer with TIN and structured address configured. Open invoice detail. Verify TIN and formatted address appear in Bill To section.

### Implementation for User Story 5

- [x] T018 [P] [US5] Update `src/domains/sales-invoices/components/invoice-templates/template-modern.tsx` — update the inline `customerSnapshot` type to include `tin`, `brn`, `addressLine1`-`addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode`. In the Bill To section: replace `address` rendering with `formatAddress()` call (import from `src/lib/utils/format-address.ts`), falling back to legacy `address` if `hasStructuredAddress()` returns false. Replace `Tax ID: {taxId}` with `TIN: {tin}` when `tin` is present (fall back to `Tax ID: {taxId}` for old invoices). Add `BRN: {brn}` conditionally after TIN.
- [x] T019 [P] [US5] Update `src/domains/sales-invoices/components/invoice-templates/template-classic.tsx` — same changes as T018, adapted to classic template's bordered box layout style.

**Checkpoint**: Invoices display e-invoice fields from snapshot. Old invoices still render correctly with legacy fields.

---

## Phase 7: User Stories 3, 4, 6 — Peppol & MSIC (Priority: P2)

**Goal**: Add Peppol Participant ID fields and MSIC lookup to complete e-invoice coverage.

**Note**: These P2 stories are additive to the P1 implementation. US3 and US4 add a single field each. US6 was already partially implemented in T016.

### Implementation for User Story 3 — Peppol on Customer Form

- [x] T020 [P] [US3] Add Peppol Participant ID input to the "Tax & Registration" collapsible section in `src/domains/sales-invoices/components/customer-form.tsx` — text input with format hint `0195:TXXXXXXXXX`. Add `peppolParticipantId` to form state and submit handler.

### Implementation for User Story 4 — Business Peppol Participant ID

- [x] T021 [P] [US4] Add Peppol Participant ID input to the "e-Invoice Settings" section in `src/domains/account-management/components/business-profile-settings.tsx` — text input with format hint `{scheme}:{id}` (e.g., `0195:T08GA1234A`). Add to form state, dirty detection, and submit handler.

### Implementation for User Story 6 — MSIC Code Lookup

- [x] T022 [US6] Verify MSIC combobox from T016 is fully functional — test searching by activity description, selecting from dropdown, manual code entry fallback. Confirm both `msicCode` and `msicDescription` persist correctly.

**Checkpoint**: All 6 user stories complete. Full e-invoice field coverage for customers and businesses.

---

## Phase 8: Polish & Build Verification

**Purpose**: Final build check and smoke tests.

- [x] T023 Run `npm run build` — fix any TypeScript errors until build passes
- [x] T024 Run `npx convex deploy --yes` — ensure all schema and function changes are deployed
- [x] T025 Manual smoke test: Create a new customer with TIN (`C21638015020`), BRN, structured address (addressLine1, city=`Kuala Lumpur`, stateCode=`WPK`, postalCode=`50000`, countryCode=`MY`). Verify fields persist on reload.
- [x] T026 Manual smoke test: Configure business LHDN settings (TIN, BRN, MSIC code via search, SST). Save and reload. Verify persistence.
- [x] T027 Manual smoke test: Create an invoice for the customer from T025. Open invoice detail. Verify Bill To shows TIN and formatted structured address.
- [x] T028 Manual smoke test: Open customer create form — verify Tax & Registration and Structured Address sections are collapsed by default. Open business settings — verify e-Invoice section collapsed by default.
- [x] T029 Verify no regressions: create a customer with only basic fields (name, email) — no e-invoice fields. Verify form submits successfully with all new fields empty.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Schema Setup)
  └── Phase 2 (Utilities & Data) ──┬── Phase 4 (US1: Customer Form)
      Phase 3 (Backend Wiring) ────┤── Phase 5 (US2: Business Settings)
                                   ├── Phase 6 (US5: Invoice Display)
                                   └── Phase 7 (US3/4/6: P2 Stories)
                                        └── Phase 8 (Verification)
```

- **Phase 1**: No dependencies — start immediately
- **Phase 2**: Depends on Phase 1 (schema deployed)
- **Phase 3**: Depends on Phase 1 (schema deployed)
- **Phase 4 (US1)**: Depends on Phase 2 (formatAddress, reference data)
- **Phase 5 (US2)**: Depends on Phase 2 AND Phase 3 (backend wiring + utilities)
- **Phase 6 (US5)**: Depends on Phase 2 (formatAddress)
- **Phase 7 (P2 stories)**: Depends on Phase 4+5 (extends the same files)
- **Phase 8**: Depends on all above

### User Story Dependencies

- **US1 (P1)**: Independent — needs only Phase 2
- **US2 (P1)**: Independent — needs Phase 2 + Phase 3
- **US5 (P1)**: Independent — needs only Phase 2
- **US3 (P2)**: Extends US1's customer form (same file)
- **US4 (P2)**: Extends US2's business settings (same file)
- **US6 (P2)**: Embedded in US2 (T016 already implements MSIC search)

### Parallel Opportunities

**Phase 2 (fully parallel)**:
```
T003 (formatAddress) | T004 (state codes) | T005 (country codes) | T006 (MSIC codes)
```

**Phase 4 + 5 + 6 (parallel after Phase 3)**:
```
US1: T010-T013 (customer form)  |  US5: T018-T019 (invoice templates)
```
US2 (T014-T017) can run in parallel with US5 but NOT US1 (no file conflict, but Phase 3 dependency).

**Phase 6 (template files parallel)**:
```
T018 (template-modern.tsx)  |  T019 (template-classic.tsx)
```

**Phase 7 (P2 stories parallel)**:
```
T020 (customer Peppol)  |  T021 (business Peppol)
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Schema Setup (T001-T002)
2. Complete Phase 2: Utilities & Data (T003-T006) — all parallel
3. Complete Phase 3: Backend Wiring (T007-T009)
4. Complete Phase 4: US1 Customer Form (T010-T013)
5. Complete Phase 5: US2 Business Settings (T014-T017)
6. Complete Phase 6: US5 Invoice Display (T018-T019) — parallel with Phase 4/5
7. **STOP and VALIDATE**: Run smoke tests T025-T029
8. Deploy/demo MVP

### Incremental Delivery (P2 Stories)

9. Add US3: Peppol on Customer Form (T020) — single field addition
10. Add US4: Business Peppol (T021) — single field addition
11. Add US6: MSIC Lookup Verification (T022) — already implemented in T016
12. Final build check (T023-T024)

---

## Notes

- All new fields are optional — no field blocks form submission
- Legacy `taxId` and `address` schema fields preserved for backward compat
- `formatAddress()` used everywhere — never inline format structured address
- Collapsible sections default to collapsed for progressive disclosure
- Semantic design tokens only — no hardcoded colors per CLAUDE.md
- Git author must be `grootdev-ai` / `dev@hellogroot.com`
