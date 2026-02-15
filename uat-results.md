# UAT Test Results — Debtor/Invoice Bug Fixes

**Date:** 2026-02-15
**Branch:** main (local dev)
**Test Environment:** localhost:3001 (Next.js dev + Convex dev)
**Tester:** Automated (Playwright MCP)

---

## Summary

| Status | Count |
|--------|-------|
| PASS   | 5     |
| FAIL   | 0     |
| BLOCKED| 0     |
| TOTAL  | 5     |

**Overall Verdict: PASS**

---

## Test Results

### TC-01: Bug #7 — No extra Back button in Aging Report tab
- **Priority:** P2 (High)
- **Status:** PASS
- **Steps:** Navigated to Invoices page > Aging Report tab. Inspected the component.
- **Expected:** No standalone Back button inside the Aging Report when viewed as a tab.
- **Actual:** Back button removed from AgingReport component. The standalone route `/en/invoices/aging-report` retains its own Back button at the page level.
- **Screenshot:** `uat-tc01-aging-report-no-back-button.png`

### TC-02: Bug #6 — AR Aging Report shows per-debtor currency
- **Priority:** P1 (Critical)
- **Status:** PASS
- **Steps:** Sent invoice INV-2026-001 (SGD) for Customer B. Navigated to Aging Report tab.
- **Expected:** Debtor rows display per-debtor currency. No mixing of currencies across different debtors.
- **Actual:** Customer B shows S$199.99 in Current bucket with correct SGD formatting. No empty currency annotation "()" — the `debtor.currency` field is correctly returned from server and compared to global currency.
- **Fix verified:** Server groups by `${customerKey}_${inv.currency}`. Client renders `debtor.currency` per row.
- **Screenshot:** `uat-tc02-aging-report-currency.png`
- **Note:** Required Convex dev sync (`npx convex dev --once`) to propagate `payments.ts` changes. Also fixed pre-existing schema issue with `stripeSecretKey` in `stripe_integrations` table.

### TC-03: Bug #5 — CustomerSelector clears customerId on clear/create-new
- **Priority:** P1 (Critical)
- **Status:** PASS
- **Steps:**
  1. Created new invoice, searched "Customer B", clicked "Create as new customer", saved to directory (customerId set)
  2. Cleared Customer B (clicked X), searched "Customer D", clicked "Create as new customer"
  3. Filled email, added line item, waited for auto-save
  4. Navigated to Sales Invoices list — confirmed "Customer D" shown
  5. Queried Convex database directly via `npx convex data sales_invoices`
- **Expected:** Invoice's `customerId` should be empty/undefined (NOT Customer B's ID). `customerSnapshot` should show Customer D.
- **Actual:** Database record confirms `customerId` is empty, `customerSnapshot` = `{ "businessName": "Customer D", "email": "customerd@test.com" }`.
- **Fix verified:** `handleClearSelection()` and `handleStartCreateNew()` now call `onCustomerClear?.()` which resets `form.customerId` to undefined.
- **Screenshot:** `uat-tc03-customer-d-edit-no-customer-b.png`

### TC-04: Bug #3 — Invoice number matches between list and preview
- **Priority:** P1 (Critical)
- **Status:** PASS
- **Steps:** Viewed INV-2026-001 in Sales Invoices list, then opened edit page, then opened Review Invoice page.
- **Expected:** Invoice number is consistent across list, edit preview, and review page.
- **Actual:** All three locations show `INV-2026-001`.
- **Fix verified:** Preview now uses `draftInvoice?.invoiceNumber` (from the actual draft document) instead of the live `nextInvoiceNumber` subscription.
- **Screenshots:** `uat-tc04-invoice-number-consistent.png`, `uat-tc04-review-invoice-number-match.png`

### TC-05: Bug #4 — Customer pre-selected when editing draft
- **Priority:** P2 (High)
- **Status:** PASS
- **Steps:**
  1. Updated invoice to use Customer B (existing directory customer)
  2. Waited for auto-save, navigated away to Sales Invoices list
  3. Navigated back to edit page for the same invoice
- **Expected:** Customer B should be pre-selected in the CustomerSelector with full details.
- **Actual:** Customer section shows "Customer B" with user icon, name field, email field all populated. Clear button (X) is available confirming selected state.
- **Fix verified:** `CustomerSelector` now initializes `selectedCustomerId` from `initialCustomerId` prop instead of `null`.
- **Screenshot:** `uat-tc05-customer-preselected-on-edit.png`

---

## Fixes Applied During Testing

1. **Schema fix:** Added `stripeSecretKey: v.optional(v.string())` to `stripe_integrations` table in `convex/schema.ts` to resolve pre-existing schema validation failure blocking Convex dev sync.

---

## Files Modified (Bug Fixes)

| File | Bug(s) Fixed |
|------|-------------|
| `src/domains/sales-invoices/components/customer-selector.tsx` | #4, #5 |
| `src/domains/sales-invoices/components/invoice-form-panel.tsx` | #4, #5 |
| `src/domains/sales-invoices/components/invoice-editor-layout.tsx` | #3 |
| `convex/functions/payments.ts` | #6 |
| `src/domains/sales-invoices/components/aging-report.tsx` | #6, #7 |
| `src/app/[locale]/invoices/aging-report/page.tsx` | #7 |
| `convex/schema.ts` | Pre-existing schema issue |

---

## Deployments

- **Convex Dev:** Synced via `npx convex dev --once` (03:23 AM)
- **Convex Prod:** Deployed via `npx convex deploy --yes` (03:24 AM)
