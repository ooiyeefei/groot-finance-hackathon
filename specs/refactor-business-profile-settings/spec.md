# Refactor: Split BusinessProfileSettings into Sub-Components

## Problem

`src/domains/account-management/components/business-profile-settings.tsx` is a **900+ line monolithic component** that:
- Renders 3 distinct sections (Business Profile, e-Invoice Compliance, Currency) as one giant form
- Manages 20+ state variables in a single component
- Uses a `section` prop hack to conditionally render sections (still loads all 900 lines)
- Has one shared `updateBusinessDetails()` function that saves everything at once
- Makes the file hard to maintain, test, and reason about

## Goal

Split into focused sub-components, each owning their own state, validation, and save logic.

## Proposed Architecture

```
business-profile-settings.tsx        (~50 lines, orchestrator)
├── business-profile-form.tsx        (~250 lines)
│   - Business name, logo upload, address fields
│   - Email forwarding (SES verification)
│   - Own "Save" button → PATCH /api/v1/account-management/businesses/profile
│
├── einvoice-compliance-form.tsx     (~200 lines)
│   - LHDN TIN, BRN, SST Registration
│   - MSIC Code (with combobox search)
│   - LHDN Client ID + Client Secret (SSM storage)
│   - Peppol Participant ID
│   - Auto self-bill toggle
│   - Own "Save" button → same API but only einvoice fields
│
└── currency-preferences.tsx         (~100 lines)
    - Home currency dropdown
    - Auto-saves on change (no button needed)
    - Currency conversion info card
```

## Key Decisions

### State Management
- Each sub-component manages its own form state via `useState`
- All sub-components read from the shared `useBusinessProfile()` context
- Each has its own `isDirty` / `hasChanges` tracking
- No shared form state between components

### Save Logic
- `business-profile-form.tsx`: Saves name, address, phone, email fields
- `einvoice-compliance-form.tsx`: Saves TIN, BRN, MSIC, Client ID/Secret, Peppol, auto-self-bill
- `currency-preferences.tsx`: Auto-saves on dropdown change (existing behavior)
- All use the same underlying `PATCH /api/v1/account-management/businesses/profile` endpoint
- Client Secret still goes through SSM (existing `handleSaveSecret` logic)

### LHDN Client Secret (SSM)
- The Client Secret save goes through AWS SSM Parameter Store (not Convex)
- This logic stays in `einvoice-compliance-form.tsx`
- Keep the existing `handleSaveSecret` function

### Unsaved Changes Warning
- Each sub-component registers with `useRegisterUnsavedChanges` independently
- Navigating away warns if ANY sub-component has unsaved changes

### Orchestrator Component
```typescript
// business-profile-settings.tsx
interface Props {
  section?: 'profile' | 'einvoice' | 'currency'
}

export default function BusinessProfileSettings({ section }: Props) {
  const showAll = !section
  return (
    <div className="space-y-8">
      {(showAll || section === 'profile') && <BusinessProfileForm />}
      {(showAll || section === 'einvoice') && <EInvoiceComplianceForm />}
      {(showAll || section === 'currency') && <CurrencyPreferences />}
    </div>
  )
}
```

## Files to Create
| File | Lines (est.) | What it does |
|------|-------------|--------------|
| `business-profile-form.tsx` | ~250 | Name, logo, address, email forwarding |
| `einvoice-compliance-form.tsx` | ~200 | TIN, BRN, MSIC, Client ID/Secret, Peppol |
| `currency-preferences.tsx` | ~100 | Home currency dropdown |

## Files to Modify
| File | Change |
|------|--------|
| `business-profile-settings.tsx` | Reduce from 900 → ~50 lines (orchestrator only) |
| `tabbed-business-settings.tsx` | No changes needed (already passes `section` prop) |

## Testing Checklist
- [ ] Business Profile form saves name, address, phone correctly
- [ ] Logo upload still works
- [ ] Email Forwarding verification still works (SES)
- [ ] e-Invoice fields save TIN, BRN, MSIC correctly
- [ ] LHDN Client Secret saves to SSM correctly
- [ ] MSIC combobox search still works
- [ ] Auto self-bill toggle persists
- [ ] Currency auto-saves on change
- [ ] Unsaved changes warning fires per-section
- [ ] All 3 sub-tabs in Business tab render correctly
- [ ] Legacy URL `?tab=business-profile` still works
- [ ] Finance Admin can access all sections

## Risk Assessment
- **Low risk**: Pure frontend refactor, no API changes
- **Medium complexity**: Need to carefully split shared state (20+ variables)
- **Regression area**: SES email verification flow, LHDN Client Secret SSM save
- **Estimated effort**: 2-3 hours
