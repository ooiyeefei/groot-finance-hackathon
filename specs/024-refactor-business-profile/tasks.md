# Tasks: Refactor BusinessProfileSettings into Sub-Components

**Input**: Design documents from `/specs/024-refactor-business-profile/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Not requested — manual regression testing only.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 and can be implemented in parallel since they operate on separate files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Orchestrator Shell)

**Purpose**: Create the orchestrator that replaces the monolithic component, establishing the mounting strategy before extracting sub-components.

- [x] T001 Rewrite `src/domains/account-management/components/business-profile-settings.tsx` as thin orchestrator (~40 lines): accept `section` prop, render all 3 sub-component slots using `hidden` attribute for visibility, import sub-components (initially as placeholder empty components)
- [x] T002 Update `src/domains/account-management/components/tabbed-business-settings.tsx` to render single `<BusinessProfileSettings section={businessSection} />` instead of 3 conditional instances

**Checkpoint**: Settings page renders without errors. All 3 Business sub-tabs show empty content. Legacy URLs still resolve correctly.

---

## Phase 2: User Story 1 - Edit Business Profile Details (Priority: P1) MVP

**Goal**: Extract business profile form (name, logo, address, phone, email, SES verification) into standalone sub-component with independent save and dirty tracking.

**Independent Test**: Navigate to Business Profile sub-tab, edit name/address/phone, save, verify only profile fields persist. Test logo upload. Test SES email verification flow.

### Implementation for User Story 1

- [x] T003 [US1] Create `src/domains/account-management/components/business-profile-form.tsx` — extract from monolith: 10 profile state variables (`businessName`, `businessEmail`, `businessPhone`, `addressLine1`-`addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode`), `initialValues` for profile fields only, `isDirty` computed from profile fields only, `useRegisterUnsavedChanges('business-profile-form', isDirty)`, `updateBusinessProfile()` function (CSRF + PUT with only profile fields: `name`, `contact_email`, `contact_phone`, `address_line1`-`address_line3`, `city`, `state_code`, `postal_code`, `country_code`), reset `initialValues` on success
- [x] T004 [US1] Add logo upload/remove to `src/domains/account-management/components/business-profile-form.tsx` — extract `handleLogoUpload()`, `removeLogo()`, `getBusinessInitial()`, `fileInputRef`, `isUploading` state, logo preview UI with camera overlay
- [x] T005 [US1] Add SES email verification to `src/domains/account-management/components/business-profile-form.tsx` — extract `checkSesVerification()`, `handleSendVerification()`, SES states (`sesVerifyStatus`, `sesVerifyEmail`, `isSendingVerification`, `pollingRef`), `email_verified` search param handling, polling interval logic, email forwarding UI section
- [x] T006 [US1] Wire `BusinessProfileForm` into orchestrator in `src/domains/account-management/components/business-profile-settings.tsx` — replace placeholder with real import, verify profile sub-tab renders correctly

**Checkpoint**: Business Profile sub-tab fully functional — save name/address/phone, upload logo, SES verification. Unsaved changes tracked independently for profile fields only.

---

## Phase 3: User Story 2 - Configure e-Invoice Compliance Settings (Priority: P1)

**Goal**: Extract e-invoice compliance form (TIN, BRN, MSIC, SSM secret, Peppol, auto self-bill) into standalone sub-component with independent save, dirty tracking, and SSM secret flow.

**Independent Test**: Navigate to e-Invoice sub-tab, edit TIN/BRN/MSIC, save, verify persistence. Test MSIC combobox search. Test LHDN Client Secret save to SSM.

### Implementation for User Story 2

- [x] T007 [P] [US2] Create `src/domains/account-management/components/einvoice-compliance-form.tsx` — extract from monolith: 8 e-invoice state variables (`lhdnTin`, `businessRegistrationNumber`, `msicCode`, `msicDescription`, `sstRegistrationNumber`, `lhdnClientId`, `lhdnClientSecret`, `peppolParticipantId`), `autoSelfBillExemptVendors`, `eInvoiceSectionOpen` (auto-expand when data exists), `initialValues` for e-invoice fields only, `isDirty` computed from e-invoice fields only, `useRegisterUnsavedChanges('einvoice-compliance-form', isDirty)`, `updateEinvoiceSettings()` function (CSRF + PUT with only e-invoice fields: `lhdn_tin`, `business_registration_number`, `msic_code`, `msic_description`, `sst_registration_number`, `lhdn_client_id`, `peppol_participant_id`, `auto_self_bill_exempt_vendors`), then SSM secret save if changed (`POST /api/v1/account-management/businesses/lhdn-secret`), reset `initialValues` on success
- [x] T008 [US2] Add MSIC combobox to `src/domains/account-management/components/einvoice-compliance-form.tsx` — extract `msicSearch`, `msicDropdownOpen`, `msicDropdownRef`, `filteredMsicCodes` memo, `handleMsicSelect()`, outside-click handler, MSIC dropdown UI with search input
- [x] T009 [US2] Wire `EInvoiceComplianceForm` into orchestrator in `src/domains/account-management/components/business-profile-settings.tsx` — replace placeholder with real import, verify e-invoice sub-tab renders correctly

**Checkpoint**: e-Invoice sub-tab fully functional — save TIN/BRN/MSIC/Peppol, MSIC combobox search works, LHDN Client Secret saves to SSM, auto self-bill toggle persists.

---

## Phase 4: User Story 3 - Set Currency Preferences (Priority: P2)

**Goal**: Extract currency preferences into standalone sub-component with auto-save on selection.

**Independent Test**: Navigate to Currency sub-tab, select different home currency, verify auto-save with toast confirmation.

### Implementation for User Story 3

- [x] T010 [P] [US3] Create `src/domains/account-management/components/currency-preferences.tsx` — extract from monolith: `isCurrencySaving`, `lastCurrencySaved` state, `handleCurrencyChange()` function (CSRF + PUT with `{ home_currency: newCurrency }`), currency dropdown UI, saving spinner, currency conversion info card, import `SUPPORTED_CURRENCIES` and `SupportedCurrency`
- [x] T011 [US3] Wire `CurrencyPreferences` into orchestrator in `src/domains/account-management/components/business-profile-settings.tsx` — replace placeholder with real import, verify currency sub-tab renders correctly

**Checkpoint**: Currency sub-tab fully functional — auto-save on selection, info card displays, saving indicator shows.

---

## Phase 5: User Story 4 - Unsaved Changes Protection (Priority: P2)

**Goal**: Verify independent dirty state tracking works across sections. Sub-tab switching preserves state (no warnings). Page navigation and top-tab switching triggers warnings when dirty.

**Independent Test**: Make changes in Business Profile, switch to e-Invoice sub-tab (no warning, state preserved), switch back (changes still there). Navigate away from Settings page (warning appears).

### Implementation for User Story 4

- [x] T012 [US4] Verify unsaved changes behavior in `src/domains/account-management/components/business-profile-settings.tsx` — confirm `hidden` attribute mounting keeps all sub-components alive, verify `useRegisterUnsavedChanges` fires for profile and e-invoice independently, test that sub-tab switching does NOT trigger warnings, test that page-level navigation DOES trigger warnings when either section is dirty

**Checkpoint**: Unsaved changes work correctly — no false positives on sub-tab switch, warnings fire on page navigation when any section has changes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Clean up monolith remnants, verify legacy URLs, build verification.

- [x] T013 Remove all dead code from original `src/domains/account-management/components/business-profile-settings.tsx` — ensure orchestrator has no leftover state variables, effects, or handlers from the monolith (should be ~40 lines)
- [x] T014 Verify legacy URL routing — test `?tab=business-profile`, `?tab=einvoice`, and direct tab switching in `src/domains/account-management/components/tabbed-business-settings.tsx` all resolve correctly
- [x] T015 Run `npm run build` and fix any TypeScript errors or build failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: Depends on Setup (T001, T002)
- **US2 (Phase 3)**: Depends on Setup (T001, T002) — can run in parallel with US1
- **US3 (Phase 4)**: Depends on Setup (T001, T002) — can run in parallel with US1/US2
- **US4 (Phase 5)**: Depends on US1 and US2 completion (needs dirty state from both)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent after Setup — no dependencies on other stories
- **US2 (P1)**: Independent after Setup — no dependencies on other stories
- **US3 (P2)**: Independent after Setup — no dependencies on other stories
- **US4 (P2)**: Depends on US1 + US2 (needs both dirty-state registrations to verify cross-section behavior)

### Parallel Opportunities

- **T003-T005** (US1) can run in parallel with **T007-T008** (US2) and **T010** (US3) — all create different files
- Within US1: T003 first (core form), then T004 and T005 can be parallel (logo and SES are independent features within the same file, but must be sequential since same file)
- Within US2: T007 first (core form), then T008 (MSIC combobox addition to same file)

---

## Parallel Example: US1 + US2 + US3 Simultaneously

```
After Setup (T001-T002) completes:

Agent A (US1): T003 → T004 → T005 → T006
Agent B (US2): T007 → T008 → T009
Agent C (US3): T010 → T011

Then: T012 (US4 verification) → T013-T015 (Polish)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: US1 (T003-T006)
3. **STOP and VALIDATE**: Business Profile sub-tab works end-to-end
4. Other sub-tabs show placeholders — acceptable for incremental delivery

### Recommended: All Stories Sequential

Since this is a single-developer refactor with shared context:

1. Setup (T001-T002) — 15 min
2. US1: Business Profile (T003-T006) — 45 min
3. US2: e-Invoice (T007-T009) — 30 min
4. US3: Currency (T010-T011) — 15 min
5. US4: Verify unsaved changes (T012) — 10 min
6. Polish (T013-T015) — 15 min

---

## Notes

- This is a pure extraction refactor — copy code from monolith into sub-components, then remove from monolith
- The monolith's JSX rendering sections map cleanly to the 3 sub-components (profile section, e-invoice section, currency section)
- CSRF token fetch pattern is duplicated in profile and e-invoice forms (5 lines each) — intentionally not abstracted
- The `hidden` attribute on sub-component wrappers is the key architectural decision for preserving state (FR-012)
