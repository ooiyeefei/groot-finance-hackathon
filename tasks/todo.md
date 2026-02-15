# Bug Fix: Debtor/Invoice/Aging Report Issues

## Root Cause Analysis

### Bug #5 & #6 — Customer D shows Customer B / AR Aging wrong
**Root Cause:** `CustomerSelector.handleClearSelection()` resets local `selectedCustomerId` to `null` but does NOT reset the parent form's `customerId`. When user clears Customer B and creates "Customer D", the invoice saves with `customerId = CustomerB._id` but `customerSnapshot.businessName = "Customer D"`.

### Bug #3 — Invoice number mismatch (list vs preview)
**Root Cause:** Preview always uses `nextInvoiceNumber` from live Convex subscription. After auto-save creates draft (consuming INV-017), subscription updates to INV-018, but saved draft is INV-017.

### Bug #4 — Customer not pre-selected when editing draft
**Root Cause:** `CustomerSelector` initializes `selectedCustomerId` to `null`. It never receives the existing `customerId` from parent, so `hasSelection = false` and search bar shows.

### Bug #6 (additional) — AR Aging Report merges currencies
**Root Cause:** `getAgingReport` groups by `customerId` only, without currency. Different-currency invoices for same customer get summed together.

### Bug #7 — Extra Back button in Aging Report
**Root Cause:** `AgingReport` hardcodes a Back button, but it's rendered inside `InvoicesTabContainer` where tabs already provide navigation.

## Fix Plan

- [x] **Fix #1**: Add `onCustomerClear` callback to `CustomerSelector`, call it on clear/create-new
- [x] **Fix #2**: Use draft's actual `invoiceNumber` in preview when available
- [x] **Fix #3**: Pass `initialCustomerId` to `CustomerSelector` for edit mode
- [x] **Fix #4**: Add currency to grouping key in `getAgingReport`
- [x] **Fix #5**: Remove Back button from `AgingReport` (embedded tab usage)
- [x] **Fix #6**: Build passes

## Files Changed
- `src/domains/sales-invoices/components/customer-selector.tsx` — Add onCustomerClear prop, initialCustomerId
- `src/domains/sales-invoices/components/invoice-form-panel.tsx` — Wire up onCustomerClear
- `src/domains/sales-invoices/components/invoice-editor-layout.tsx` — Use draft invoiceNumber in preview
- `src/domains/sales-invoices/hooks/use-sales-invoices.ts` — Add useSalesInvoice hook for draft number
- `convex/functions/payments.ts` — Add currency to aging report grouping key
- `src/domains/sales-invoices/components/aging-report.tsx` — Remove Back button
