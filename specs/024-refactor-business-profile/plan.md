# Implementation Plan: Refactor BusinessProfileSettings

**Branch**: `024-refactor-business-profile` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)

## Summary

Split the 900-line monolithic `BusinessProfileSettings` component into 3 focused sub-components (Business Profile, e-Invoice Compliance, Currency Preferences) plus a thin orchestrator. Each sub-component owns its form state, validation, dirty tracking, and save logic. The parent orchestrator keeps all 3 mounted to preserve state across sub-tab switches. No backend/API changes — pure frontend refactor.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Clerk 6.30.0
**Storage**: Convex (via existing `useBusinessProfile()` context + `PUT /api/v1/account-management/businesses/profile`)
**Testing**: Manual regression against testing checklist (no unit test framework in use)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: N/A (UI refactor, no perf targets)
**Constraints**: Zero behavior change — all existing functionality must work identically
**Scale/Scope**: 1 monolithic file → 4 files (3 sub-components + 1 orchestrator)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Proceeding with CLAUDE.md rules:
- [x] Domain-driven design: Files stay within `src/domains/account-management/components/` ✓
- [x] Prefer modification over creation: Modifying existing component, creating only necessary sub-components ✓
- [x] Design system tokens: No styling changes — preserving existing design tokens ✓
- [x] No backend changes required ✓

## Project Structure

### Documentation (this feature)

```text
specs/024-refactor-business-profile/
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal — no unknowns)
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output
```

### Source Code (files to create/modify)

```text
src/domains/account-management/components/
├── business-profile-settings.tsx    # MODIFY: 900 → ~40 lines (orchestrator)
├── business-profile-form.tsx        # CREATE: ~250 lines (name, logo, address, email forwarding)
├── einvoice-compliance-form.tsx     # CREATE: ~200 lines (TIN, BRN, MSIC, SSM secret, Peppol)
└── currency-preferences.tsx         # CREATE: ~100 lines (home currency auto-save)

src/domains/account-management/components/tabbed-business-settings.tsx
└── MODIFY: Update lazy imports to load sub-components directly (not via orchestrator)
```

**Structure Decision**: All new files in existing `src/domains/account-management/components/` directory, following the domain-driven design pattern. No new directories needed.

## Research (Phase 0)

No NEEDS CLARIFICATION items. All technical questions resolved from code analysis:

1. **API supports partial updates**: Confirmed — the existing `PUT /api/v1/account-management/businesses/profile` endpoint accepts partial payloads. The currency auto-save already sends `{ home_currency: newCurrency }` alone without other fields.

2. **Unsaved changes hook supports multiple registrations**: Confirmed — `useRegisterUnsavedChanges(id, isDirty)` uses a Map keyed by `id`. Multiple components can register independently.

3. **SSM secret save is a separate API call**: Confirmed — `POST /api/v1/account-management/businesses/lhdn-secret` is called after the main profile save. This logic moves entirely into `einvoice-compliance-form.tsx`.

4. **SES email verification is a separate API**: Confirmed — `GET/POST /api/v1/users/verify-email` with polling. This logic moves entirely into `business-profile-form.tsx`.

5. **CSRF token pattern**: Both profile save and currency save fetch CSRF token first. Each sub-component will include this pattern independently.

## Design (Phase 1)

### State Partition

The 20+ state variables partition cleanly into 3 groups with zero overlap:

**Business Profile Form** (10 state variables):
- `businessName`, `businessEmail`, `businessPhone`
- `addressLine1`, `addressLine2`, `addressLine3`, `city`, `stateCode`, `postalCode`, `countryCode`
- `isUpdating`, `isUploading`, `fileInputRef`
- SES verification: `sesVerifyStatus`, `sesVerifyEmail`, `isSendingVerification`, `pollingRef`

**e-Invoice Compliance Form** (9 state variables):
- `lhdnTin`, `businessRegistrationNumber`, `msicCode`, `msicDescription`, `sstRegistrationNumber`
- `lhdnClientId`, `lhdnClientSecret`, `peppolParticipantId`
- `autoSelfBillExemptVendors`
- MSIC combobox: `msicSearch`, `msicDropdownOpen`, `msicDropdownRef`
- `eInvoiceSectionOpen` (auto-expand)
- `isUpdating` (own save state)

**Currency Preferences** (2 state variables):
- `isCurrencySaving`, `lastCurrencySaved`
- Reads `profile.home_currency` directly (no local state needed)

### Shared Dependencies

All 3 sub-components consume:
- `useBusinessProfile()` — read profile data, call `updateProfile` after save
- `useToast()` — show success/error toasts

Profile and e-Invoice also share:
- `useRegisterUnsavedChanges(id, isDirty)` — each registers with unique ID
- CSRF token fetch pattern (duplicated, not abstracted — only 5 lines, used in 2 places)

### Orchestrator Design

```
BusinessProfileSettings (orchestrator, ~40 lines)
├── Props: { section?: 'profile' | 'einvoice' | 'currency' }
├── All 3 sub-components rendered unconditionally (mounted)
├── CSS visibility: hidden/shown based on active section
│   (preserves state across sub-tab switches — FR-012)
└── No state of its own — pure layout
```

The key design choice: use `hidden` attribute or `display: none` via CSS to hide inactive sections rather than conditional rendering (`{section === 'profile' && <Form />}`). This keeps all 3 mounted at all times, preserving form state.

### tabbed-business-settings.tsx Update

Currently loads `BusinessProfileSettings` 3 times with different `section` props:
```tsx
{businessSection === 'profile' && <BusinessProfileSettings section="profile" />}
{businessSection === 'einvoice' && <BusinessProfileSettings section="einvoice" />}
{businessSection === 'currency' && <BusinessProfileSettings section="currency" />}
```

After refactor, the orchestrator handles mounting internally. The parent just renders:
```tsx
<BusinessProfileSettings section={businessSection} />
```

This is already the pattern — just need to ensure the orchestrator passes the section through for visibility control.

### Dirty State Tracking

Each sub-component tracks its own `initialValues` and computes `isDirty`:

- **business-profile-form**: Compares 10 profile fields against initial values
- **einvoice-compliance-form**: Compares 8 e-invoice fields against initial values
- **currency-preferences**: No dirty tracking (auto-saves instantly)

Each registers independently:
```
useRegisterUnsavedChanges('business-profile-form', isProfileDirty)
useRegisterUnsavedChanges('einvoice-compliance-form', isEinvoiceDirty)
```

### Save Logic Split

**Business Profile Form** `updateBusinessProfile()`:
- CSRF token → PUT with only profile fields → `updateProfile(result.data)` → reset initial values
- Separate: logo upload/remove (existing API)
- Separate: SES verification (existing API)

**e-Invoice Compliance Form** `updateEinvoiceSettings()`:
- CSRF token → PUT with only e-invoice fields → `updateProfile(result.data)` → reset initial values
- Then: if client secret changed → POST to SSM API
- On SSM failure: toast warning but don't rollback profile save

**Currency Preferences** `handleCurrencyChange()`:
- CSRF token → PUT with `{ home_currency: newCurrency }` → `updateProfile(result.data)` → toast
- Already a self-contained function — moves as-is

## Complexity Tracking

No constitution violations to justify. This is a straightforward component decomposition.
