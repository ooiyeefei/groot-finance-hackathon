# Feature Specification: Refactor BusinessProfileSettings into Sub-Components

**Feature Branch**: `024-refactor-business-profile`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "Refactor BusinessProfileSettings into sub-components: split 900-line monolithic component into focused sub-components for business profile, e-invoice compliance, and currency preferences"

## Clarifications

### Session 2026-03-17

- Q: Should unsaved changes warnings fire when switching between sub-tabs within the Business tab (e.g., Business Profile → e-Invoice)? → A: No. Warnings only fire when leaving the Settings page or switching top-level tabs (e.g., Business → Finance). Sub-components stay mounted so local state is preserved across sub-tab switches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit Business Profile Details (Priority: P1)

A business owner or finance admin navigates to Settings > Business > Business Profile to update their company's core details — name, logo, address, phone, and email. They make changes, see a clear "Save" button scoped to this section, and save only the profile fields without affecting e-invoice or currency settings.

**Why this priority**: This is the most frequently used section. Every new business onboards by filling out their profile first. Incorrect profile data cascades into invoices, e-invoices, and customer-facing documents.

**Independent Test**: Can be fully tested by navigating to Business Profile sub-tab, editing name/address/phone fields, saving, and verifying only those fields persist. Logo upload and email forwarding verification are also tested here independently.

**Acceptance Scenarios**:

1. **Given** a business owner on the Business Profile sub-tab, **When** they edit the business name and click Save, **Then** only the profile fields are saved and a success confirmation appears.
2. **Given** a business owner with unsaved profile changes, **When** they switch to the e-Invoice sub-tab, **Then** no warning appears — the profile section stays mounted and retains its unsaved state for when the user switches back.
3. **Given** a business owner, **When** they upload a new logo, **Then** the logo preview updates immediately and persists after save.
4. **Given** a business owner, **When** they initiate email forwarding verification, **Then** the SES verification flow works identically to today's behavior.

---

### User Story 2 - Configure e-Invoice Compliance Settings (Priority: P1)

A business owner navigates to Settings > Business > e-Invoice to configure their LHDN compliance fields — TIN, BRN, SST registration, MSIC code, LHDN Client ID/Secret, Peppol Participant ID, and auto self-bill toggle. Each field saves independently from business profile and currency sections.

**Why this priority**: e-Invoice compliance is legally required for Malaysian businesses. Incorrect TIN/BRN blocks e-invoice submission to LHDN. The LHDN Client Secret requires secure SSM storage — this is the highest-risk section of the refactor.

**Independent Test**: Can be fully tested by navigating to e-Invoice sub-tab, editing TIN/BRN/MSIC fields, saving, and verifying persistence. LHDN Client Secret save-to-SSM flow tested separately.

**Acceptance Scenarios**:

1. **Given** a business owner on the e-Invoice sub-tab, **When** they update TIN and BRN and click Save, **Then** only e-invoice fields are saved without touching profile or currency data.
2. **Given** a business owner, **When** they search for an MSIC code using the combobox, **Then** the search and selection works identically to today.
3. **Given** a business owner, **When** they enter a new LHDN Client Secret and save, **Then** the secret is stored securely via SSM (not in the database) and the UI shows a masked confirmation.
4. **Given** a business owner, **When** they toggle auto self-bill ON, **Then** the setting persists and applies to future e-invoice generation.

---

### User Story 3 - Set Currency Preferences (Priority: P2)

A business owner navigates to Settings > Business > Currency to select their home currency. The currency auto-saves on selection (no explicit save button needed), matching the current behavior.

**Why this priority**: Currency is a set-once-and-forget setting for most businesses. Lower interaction frequency than profile or e-invoice, but critical for correct financial reporting.

**Independent Test**: Can be fully tested by navigating to Currency sub-tab, selecting a different home currency from the dropdown, and verifying it persists without clicking a save button.

**Acceptance Scenarios**:

1. **Given** a business owner on the Currency sub-tab, **When** they select a different home currency, **Then** the change auto-saves immediately with a success confirmation.
2. **Given** a business owner, **When** they view the Currency sub-tab, **Then** a currency conversion information card is displayed explaining the impact of changing home currency.

---

### User Story 4 - Unsaved Changes Protection Across Sections (Priority: P2)

When a user has unsaved changes in any section (Business Profile or e-Invoice), navigating away from the settings page or switching top-level tabs (e.g., Business → Finance) triggers an unsaved changes warning. Each section tracks its own dirty state independently. Switching between sub-tabs within Business does NOT trigger warnings — sub-components stay mounted and preserve their state.

**Why this priority**: Prevents accidental data loss. Users frequently switch between sub-tabs while configuring settings during onboarding.

**Independent Test**: Can be tested by making changes in Business Profile, then attempting to navigate to a different page — the unsaved changes dialog should appear. Separately, switching sub-tabs should NOT show a warning.

**Acceptance Scenarios**:

1. **Given** a user with unsaved changes in Business Profile, **When** they navigate to a different page, **Then** an unsaved changes warning appears.
2. **Given** a user with unsaved changes in Business Profile, **When** they switch top-level tabs (e.g., Business → Finance), **Then** an unsaved changes warning appears.
3. **Given** a user with unsaved changes in e-Invoice only, **When** they switch to the Currency sub-tab within Business, **Then** no warning appears and their e-Invoice edits are preserved when they switch back.
4. **Given** a user with no unsaved changes in any section, **When** they navigate away, **Then** no warning appears.

---

### Edge Cases

- What happens when the business profile API save fails mid-request? The UI should show an error toast and retain the unsaved form state so the user can retry.
- What happens when a user has unsaved changes in both Business Profile AND e-Invoice sections simultaneously? Both sections should independently register as dirty, and a single unsaved changes warning covers both.
- What happens when legacy URLs (e.g., `?tab=business-profile`) are used? They should resolve correctly to the Business > Business Profile sub-tab (existing behavior preserved).
- What happens on slow connections during logo upload? The upload progress indicator should display, and the save button should be disabled until upload completes.
- What happens if the LHDN Client Secret SSM save succeeds but the remaining e-invoice field save fails? The UI should clearly communicate which save succeeded and which failed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Business Profile section MUST allow editing and saving business name, logo, address, phone, and email independently from other sections.
- **FR-002**: The e-Invoice Compliance section MUST allow editing and saving TIN, BRN, SST registration, MSIC code, LHDN Client ID, LHDN Client Secret, Peppol Participant ID, and auto self-bill toggle independently from other sections.
- **FR-003**: The Currency Preferences section MUST auto-save the home currency selection on change without requiring an explicit save action.
- **FR-004**: Each section MUST track its own unsaved changes (dirty state) independently.
- **FR-005**: The system MUST warn users about unsaved changes when navigating away from the page while any section has unsaved edits.
- **FR-006**: The LHDN Client Secret MUST continue to be stored securely via external secret management (SSM), not in the application database.
- **FR-007**: The MSIC code combobox search MUST continue to function with the existing dataset and search behavior.
- **FR-008**: Legacy URL parameters (e.g., `?tab=business-profile`) MUST continue to resolve to the correct sub-tab.
- **FR-009**: The email forwarding (SES verification) flow MUST continue to function identically in the Business Profile section.
- **FR-010**: Each section MUST display its own loading state while data is being fetched or saved.
- **FR-011**: Permission checks MUST be preserved — only business owners and finance admins can access Business settings sections.
- **FR-012**: All three sub-components (Business Profile, e-Invoice, Currency) MUST remain mounted when the user switches between Business sub-tabs, preserving any unsaved form state.

### Key Entities

- **Business Profile**: Core company identity — name, logo, address (street, city, state, postal code, country), phone, email, email forwarding settings.
- **e-Invoice Compliance**: LHDN regulatory fields — TIN, BRN, SST number, MSIC code/description, LHDN Client ID, LHDN Client Secret (stored in SSM), Peppol Participant ID, auto self-bill preference.
- **Currency Preferences**: Home currency selection from supported currencies list, with conversion information display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing business settings functionality works identically after refactor — zero user-facing behavior changes (verified by testing checklist).
- **SC-002**: Each section (Business Profile, e-Invoice, Currency) can save independently without affecting other sections' data.
- **SC-003**: The orchestrator component is reduced to under 60 lines, with each sub-component being a self-contained unit.
- **SC-004**: Unsaved changes warnings fire correctly per-section — no false positives (warning when no changes) or false negatives (no warning when changes exist).
- **SC-005**: Legacy URL parameters continue to route to the correct sub-tab with no broken navigation.
- **SC-006**: LHDN Client Secret continues to be stored securely via SSM — no regression in security posture.

## Assumptions

- The existing API endpoint supports partial updates — sending only profile fields or only e-invoice fields without overwriting the other.
- The shared business profile context hook provides read access to all fields and an update function that accepts partial updates.
- The unsaved changes hook supports multiple independent registrations from different components on the same page.
- No backend/API changes are required — this is a pure frontend refactor.
- The parent tab orchestrator will be updated to lazy-load each sub-component individually instead of loading the single monolithic component.

## Out of Scope

- Backend API changes or new endpoints.
- Adding new fields or settings to any section.
- Redesigning the visual layout or styling of the settings forms.
- Changes to other settings tabs (Finance, People, Integrations, etc.).
- Performance optimization beyond the natural benefit of code splitting.
