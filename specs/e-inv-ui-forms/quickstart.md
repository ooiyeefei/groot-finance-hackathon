# Quickstart: e-Invoice UI Forms

**Branch**: `e-inv-ui-forms` | **Date**: 2026-02-20

## What This Feature Does

Adds UI forms for managing e-invoice related fields (TIN, BRN, structured address, MSIC codes, Peppol IDs) on customer and business records. Replaces legacy free-form address fields with structured address inputs. Displays e-invoice fields on invoice detail views.

## Prerequisites

- Schema fields for customers already deployed (PR #203)
- Convex mutations for customers already accept e-invoice fields
- `customer-selector.tsx` already maps new fields to snapshot

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/utils/format-address.ts` | `formatAddress()` utility for rendering structured addresses |
| `src/lib/data/msic-codes.ts` | Static MSIC code reference dataset (~500 entries) |
| `src/lib/data/state-codes.ts` | Malaysian state codes (16 entries) |
| `src/lib/data/country-codes.ts` | ISO 3166-1 alpha-2 country codes (~249 entries) |

## Files to Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add structured address fields to `businesses` table |
| `convex/functions/businesses.ts` | Add e-invoice + address args to `updateBusinessByStringId` |
| `src/domains/account-management/lib/account-management.service.ts` | Extend `updateBusinessProfile()` with new fields |
| `src/domains/account-management/components/business-profile-settings.tsx` | Replace address textarea with structured fields; add e-Invoice Settings section |
| `src/domains/sales-invoices/components/customer-form.tsx` | Replace address textarea + taxId; add collapsible Tax & Registration + Structured Address sections |
| `src/domains/sales-invoices/components/customer-selector.tsx` | Add TIN + structured address to inline form; add "Edit full details" link |
| `src/domains/sales-invoices/components/invoice-templates/template-modern.tsx` | Render TIN, BRN, structured address in Bill To |
| `src/domains/sales-invoices/components/invoice-templates/template-classic.tsx` | Same as modern |

## Build & Deploy Sequence

```bash
# 1. After schema change
npx convex deploy --yes

# 2. After all changes
npm run build
```

## Key Patterns

- **Forms**: Vanilla React `useState`, no form library
- **Validation**: Zod schemas inline
- **Styling**: Semantic tokens (`bg-card`, `text-foreground`), no hardcoded colors
- **Collapsible**: Radix `Collapsible` or HTML `<details>` for progressive disclosure
- **Address**: Always use `formatAddress()` — never inline format structured address
