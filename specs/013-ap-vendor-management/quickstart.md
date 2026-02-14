# Quickstart: Smart AP Vendor Management

**Feature**: 013-ap-vendor-management
**Branch**: `013-ap-vendor-management`
**Date**: 2026-02-14

---

## Prerequisites

- Node.js 20.x
- Convex dev environment configured (`npx convex dev` running)
- Feature branch checked out: `git checkout 013-ap-vendor-management`

## Build Order

The implementation follows a dependency chain. Complete each phase before starting the next.

### Phase 1: Schema & Backend (Foundation)

**Must be done first — all frontend depends on these.**

1. **Schema changes** (`convex/schema.ts`)
   - Add vendor profile fields (paymentTerms, bankDetails, etc.)
   - Add accounting entry payment tracking fields (paidAmount, paymentHistory)
   - Add new indexes if needed (by_businessId_dueDate, by_businessId_vendorId_status)

2. **Vendor mutations** (`convex/functions/vendors.ts`)
   - Extend `update` mutation with new fields
   - Add validation for custom payment terms

3. **Payment recording** (`convex/functions/accountingEntries.ts`)
   - New `recordPayment` mutation
   - Handles partial and full payments
   - Status transition logic

4. **Deploy Convex** after schema changes:
   ```bash
   npx convex deploy --yes
   ```

### Phase 2: Queries (Data Layer)

**Depends on Phase 1 schema being deployed.**

5. **Vendor-level aging** (`convex/functions/analytics.ts`)
   - `getAgedPayablesByVendor` query
   - `getVendorPayablesDrilldown` query
   - Aging bucket calculation using vendor payment terms

6. **Upcoming payments** (`convex/functions/analytics.ts`)
   - `getUpcomingPayments` query
   - Includes overdue entries at top

7. **Spend analytics** (`convex/functions/analytics.ts`)
   - `getVendorSpendAnalytics` query
   - Top vendors, category breakdown, monthly trend

8. **Price intelligence** (`convex/functions/vendorPriceHistory.ts`)
   - `detectPriceChanges` query
   - `getCrossVendorComparison` query
   - Currency-specific thresholds

9. **Vendor context** (`convex/functions/vendors.ts`)
   - `getVendorContext` query for invoice review

10. **Deploy Convex** after new functions:
    ```bash
    npx convex deploy --yes
    ```

### Phase 3: Cron Job

11. **Overdue detection** (`convex/functions/accountingEntries.ts` + `convex/crons.ts`)
    - `markOverduePayables` internal mutation
    - Register daily cron (00:05 UTC)
    - Action Center insight generation

12. **Deploy Convex**:
    ```bash
    npx convex deploy --yes
    ```

### Phase 4: Frontend — Domain Components

**Depends on Phase 2 queries being available.**

13. **Create payables domain** (`src/domains/payables/`)
    - Directory structure: components/, hooks/, lib/

14. **Hooks** (data fetching layer):
    - `use-vendor-aging.ts` — wraps getAgedPayablesByVendor
    - `use-upcoming-payments.ts` — wraps getUpcomingPayments
    - `use-spend-analytics.ts` — wraps getVendorSpendAnalytics
    - `use-price-intelligence.ts` — wraps detectPriceChanges
    - `use-payment-recorder.ts` — wraps recordPayment mutation

15. **Core components**:
    - `vendor-aging-table.tsx` — vendor rows with aging buckets + drill-down
    - `upcoming-payments-table.tsx` — sortable table with period filter
    - `payment-recorder-dialog.tsx` — modal for recording payments
    - `vendor-profile-panel.tsx` — vendor detail with payment terms editing

16. **Price intelligence components**:
    - `price-alert-badge.tsx` — inline badge showing price change %
    - `vendor-comparison-note.tsx` — "Vendor B offers this for X% less"

17. **Spend analytics components**:
    - `top-vendors-chart.tsx` — horizontal bar chart
    - `category-breakdown-chart.tsx` — donut/pie chart
    - `spend-trend-chart.tsx` — line chart (12 months)

### Phase 5: Frontend — Pages & Integration

18. **AP Dashboard page** (`src/app/[locale]/payables/page.tsx`)
    - Summary cards (total outstanding, overdue, due this week, due this month)
    - Compose aging table, upcoming payments, spend analytics widgets
    - Add to sidebar navigation (financeGroup in sidebar.tsx)

19. **Enhanced invoice review** (modify existing)
    - Add vendor context panel to `documents-list.tsx` / `accounting-entry-edit-modal.tsx`
    - Show price alert badges on line items
    - Relabel "Create Record" → "Create Payable"
    - Auto-calculate due date from vendor payment terms

### Phase 6: Build & Verify

20. **Build check**:
    ```bash
    npm run build
    ```
    Fix any TypeScript errors and repeat until clean.

21. **Final Convex deploy** (if any functions changed during frontend work):
    ```bash
    npx convex deploy --yes
    ```

## Key Files Reference

| File | Action | Purpose |
|------|--------|---------|
| `convex/schema.ts` | Modify | Add vendor + accounting entry fields |
| `convex/functions/vendors.ts` | Modify | Extend update mutation, add getVendorContext |
| `convex/functions/accountingEntries.ts` | Modify | Add recordPayment, markOverduePayables |
| `convex/functions/analytics.ts` | Modify | Add AP-specific queries |
| `convex/functions/vendorPriceHistory.ts` | Modify | Add price intelligence queries |
| `convex/crons.ts` | Modify | Register overdue payables cron |
| `src/domains/payables/` | Create | New domain directory |
| `src/app/[locale]/payables/page.tsx` | Create | AP dashboard page |
| `src/components/ui/sidebar.tsx` | Modify | Add Payables nav item |
| `src/domains/invoices/components/documents-list.tsx` | Modify | Add vendor context, price alerts |
| `src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx` | Modify | Due date auto-calc, "Create Payable" label |
| `src/lib/constants/statuses.ts` | Possibly modify | Add payment method options if not existing |

## Design System Reminders

- Use semantic tokens: `bg-card`, `text-foreground`, `bg-primary`
- Action buttons: `bg-primary hover:bg-primary/90 text-primary-foreground`
- Destructive buttons: `bg-destructive hover:bg-destructive/90`
- Cancel buttons: `bg-secondary hover:bg-secondary/80`
- Numbers: `formatCurrency()` and `formatNumber()` from `@/lib/utils/format-number`
- Dates: `formatBusinessDate()` from `@/lib/utils` (no timezone shift)
