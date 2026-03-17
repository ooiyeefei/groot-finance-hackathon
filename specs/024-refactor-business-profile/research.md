# Research: Refactor BusinessProfileSettings

**Branch**: `024-refactor-business-profile` | **Date**: 2026-03-17

## Summary

No unknowns requiring external research. All decisions resolved from codebase analysis.

## Decisions

### 1. API Supports Partial Updates

- **Decision**: Use existing `PUT /api/v1/account-management/businesses/profile` endpoint for all 3 sub-components
- **Rationale**: Currency auto-save already sends `{ home_currency: newCurrency }` alone — confirms partial update support
- **Alternatives considered**: Creating section-specific endpoints — rejected (over-engineering for a frontend refactor)

### 2. Sub-Component Mounting Strategy

- **Decision**: Keep all 3 sub-components mounted at all times using CSS visibility (`hidden` attribute)
- **Rationale**: Preserves form state across sub-tab switches (FR-012). Clarification confirmed: no warnings on sub-tab switch.
- **Alternatives considered**: Conditional rendering with state lifting — rejected (adds complexity, defeats purpose of independent state)

### 3. CSRF Token Pattern

- **Decision**: Duplicate CSRF fetch in each sub-component that saves (profile, e-invoice)
- **Rationale**: Only 5 lines of code. Extracting to shared utility adds indirection for minimal DRY benefit. Currency already has its own copy.
- **Alternatives considered**: Shared `useCsrfToken()` hook — acceptable but not worth creating for 2 call sites

### 4. Dirty State Registration IDs

- **Decision**: Use descriptive string IDs: `'business-profile-form'`, `'einvoice-compliance-form'`
- **Rationale**: `useRegisterUnsavedChanges` uses Map keyed by ID. Descriptive names aid debugging.
- **Alternatives considered**: Generic IDs — rejected (harder to debug)
