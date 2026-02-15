# Implementation Plan: Smart AP Vendor Management

**Branch**: `013-ap-vendor-management` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-ap-vendor-management/spec.md`

## Summary

Build smart AP (Accounts Payable) vendor management for FinanSEAL — a financial co-pilot for SEA SMEs. The feature extends existing infrastructure (accounting_entries as AP ledger, vendor_price_history as price intelligence, AgedPayablesWidget as aging foundation) to add: vendor payment terms, vendor-level creditor aging with drill-down, upcoming payments view, quick payment recording (full + partial), overdue auto-detection cron, vendor spend analytics, price increase detection alerts, cross-vendor price comparison, a dedicated AP dashboard page, and enhanced invoice review with vendor context.

Key architectural decision: **no new tables**. Extend `vendors` (add payment terms + bank details) and `accounting_entries` (add paidAmount + paymentHistory). All AP queries operate on existing data filtered by transactionType = "Expense"/"COGS".

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, TanStack Query 5.90.7
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Build verification (`npm run build`), manual testing via Convex dashboard
**Target Platform**: Web application (desktop + responsive)
**Project Type**: Web application (Next.js + Convex backend)
**Performance Goals**: AP dashboard loads all widgets for up to 500 outstanding payables within acceptable render time
**Constraints**: Multi-tenant isolation (all queries scoped by businessId), SEA multi-currency support
**Scale/Scope**: ~15 files modified, ~12 files created, 1 new route, 1 new domain directory

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file is a template (not filled in for this project). No formal gates to enforce.

**Project conventions from CLAUDE.md applied**:
- Semantic design tokens (bg-card, text-foreground) — no hardcoded colors
- Action buttons: bg-primary hover:bg-primary/90 text-primary-foreground
- Number formatting via formatCurrency/formatNumber
- Date handling via formatBusinessDate (no timezone shift)
- Git author: grootdev-ai / dev@hellogroot.com
- Build must pass before completion
- Convex deploy required after schema/function changes

**Post-design re-check**: All design decisions align with existing codebase patterns. No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-ap-vendor-management/
├── plan.md              # This file
├── spec.md              # Feature specification (10 user stories, 32 FRs)
├── research.md          # Phase 0: 10 architectural decisions resolved
├── data-model.md        # Phase 1: Entity changes + relationships
├── quickstart.md        # Phase 1: Build order + file reference
├── contracts/
│   └── convex-functions.md  # Phase 1: All query/mutation contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
# Backend (Convex)
convex/
├── schema.ts                         # MODIFY: vendors + accounting_entries fields
├── crons.ts                          # MODIFY: add mark-overdue-payables cron
├── functions/
│   ├── vendors.ts                    # MODIFY: extend update, add getVendorContext
│   ├── accountingEntries.ts          # MODIFY: add recordPayment, markOverduePayables
│   ├── analytics.ts                  # MODIFY: add AP-specific queries
│   └── vendorPriceHistory.ts         # MODIFY: add price intelligence queries
└── lib/
    └── validators.ts                 # CHECK: paymentTermsValidator exists

# Frontend — New payables domain
src/domains/payables/
├── components/
│   ├── ap-dashboard.tsx              # Main AP dashboard layout
│   ├── summary-cards.tsx             # KPI cards (outstanding, overdue, due this week/month)
│   ├── vendor-aging-table.tsx        # Vendor-level aging with drill-down
│   ├── vendor-aging-drilldown.tsx    # Individual vendor unpaid bills
│   ├── upcoming-payments-table.tsx   # Bills due in 7/14/30 days
│   ├── payment-recorder-dialog.tsx   # Record payment modal (full + partial)
│   ├── vendor-profile-panel.tsx      # Vendor detail with payment terms editing
│   ├── vendor-bank-details.tsx       # Bank details display with masking
│   ├── spend-analytics/
│   │   ├── top-vendors-chart.tsx     # Horizontal bar chart
│   │   ├── category-breakdown.tsx    # Donut/pie chart
│   │   └── spend-trend.tsx           # Monthly line chart
│   └── price-intelligence/
│       ├── price-alert-badge.tsx     # Inline badge: "Price +12% vs last order"
│       └── vendor-comparison-note.tsx # "Vendor B offers this for X% less"
├── hooks/
│   ├── use-vendor-aging.ts           # Wraps getAgedPayablesByVendor
│   ├── use-upcoming-payments.ts      # Wraps getUpcomingPayments
│   ├── use-spend-analytics.ts        # Wraps getVendorSpendAnalytics
│   ├── use-price-intelligence.ts     # Wraps detectPriceChanges
│   └── use-payment-recorder.ts       # Wraps recordPayment mutation
└── lib/
    └── price-thresholds.ts           # Currency-specific alert threshold config

# Frontend — New route
src/app/[locale]/payables/
└── page.tsx                          # AP dashboard page

# Frontend — Modified files
src/components/ui/sidebar.tsx                                          # ADD: Payables nav item
src/domains/invoices/components/documents-list.tsx                     # ADD: vendor context, price alerts
src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx  # ADD: due date calc, "Create Payable"
src/domains/invoices/lib/document-to-accounting-entry-mapper.ts        # ADD: vendor term-based due date
```

**Structure Decision**: Follows the existing domain-based architecture. New `src/domains/payables/` domain mirrors `src/domains/sales-invoices/` pattern. Backend changes extend existing Convex function files rather than creating new ones (except where new queries are needed). Single new route at `/[locale]/payables/`.

## Complexity Tracking

No constitution violations to justify. The design intentionally avoids complexity:

| Decision | Simpler Approach Used |
|----------|----------------------|
| No new database tables | Extend existing vendors + accounting_entries |
| Embedded payment history | Array field vs. separate payments table |
| Reuse existing payment terms enum | Same validator as sales invoices |
| Mirror AR patterns | Consistent with existing overdue cron, aging widgets |
| Single new route | One page composes existing + new widgets |

## Phase Summary

| Phase | Output | Key Artifacts |
|-------|--------|---------------|
| Phase 0 | [research.md](./research.md) | 10 architectural decisions resolved |
| Phase 1 | [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) | Entity changes, Convex function contracts, build order |
| Phase 2 | tasks.md (via `/speckit.tasks`) | Dependency-ordered implementation tasks |

## Implementation Phases

### Phase 1: Schema & Backend Foundation

**Goal**: All schema changes deployed, vendor mutations extended, payment recording working.

| Task | Files | Depends On |
|------|-------|------------|
| 1. Extend vendors schema | `convex/schema.ts` | — |
| 2. Extend accounting_entries schema | `convex/schema.ts` | — |
| 3. Add new indexes | `convex/schema.ts` | Tasks 1-2 |
| 4. Deploy schema | `npx convex deploy --yes` | Task 3 |
| 5. Extend vendor update mutation | `convex/functions/vendors.ts` | Task 4 |
| 6. Add recordPayment mutation | `convex/functions/accountingEntries.ts` | Task 4 |
| 7. Add getVendorContext query | `convex/functions/vendors.ts` | Task 4 |
| 8. Deploy functions | `npx convex deploy --yes` | Tasks 5-7 |

### Phase 2: AP Queries

**Goal**: All data queries available for frontend consumption.

| Task | Files | Depends On |
|------|-------|------------|
| 9. Add getAgedPayablesByVendor query | `convex/functions/analytics.ts` | Phase 1 |
| 10. Add getVendorPayablesDrilldown query | `convex/functions/analytics.ts` | Phase 1 |
| 11. Add getUpcomingPayments query | `convex/functions/analytics.ts` | Phase 1 |
| 12. Add getVendorSpendAnalytics query | `convex/functions/analytics.ts` | Phase 1 |
| 13. Add detectPriceChanges query | `convex/functions/vendorPriceHistory.ts` | Phase 1 |
| 14. Add getCrossVendorComparison query | `convex/functions/vendorPriceHistory.ts` | Phase 1 |
| 15. Deploy queries | `npx convex deploy --yes` | Tasks 9-14 |

### Phase 3: Cron Job

**Goal**: Overdue AP entries detected and marked automatically daily.

| Task | Files | Depends On |
|------|-------|------------|
| 16. Add markOverduePayables internal mutation | `convex/functions/accountingEntries.ts` | Phase 1 |
| 17. Register cron job | `convex/crons.ts` | Task 16 |
| 18. Deploy cron | `npx convex deploy --yes` | Task 17 |

### Phase 4: Frontend — Domain Setup & Core Components

**Goal**: Payables domain created with all hooks and core UI components.

| Task | Files | Depends On |
|------|-------|------------|
| 19. Create payables domain structure | `src/domains/payables/` | — |
| 20. Create price threshold config | `src/domains/payables/lib/price-thresholds.ts` | — |
| 21. Create hooks (5 files) | `src/domains/payables/hooks/` | Phase 2 |
| 22. Create vendor aging table | `src/domains/payables/components/vendor-aging-table.tsx` | Task 21 |
| 23. Create vendor aging drilldown | `src/domains/payables/components/vendor-aging-drilldown.tsx` | Task 21 |
| 24. Create upcoming payments table | `src/domains/payables/components/upcoming-payments-table.tsx` | Task 21 |
| 25. Create payment recorder dialog | `src/domains/payables/components/payment-recorder-dialog.tsx` | Task 21 |
| 26. Create vendor profile panel | `src/domains/payables/components/vendor-profile-panel.tsx` | Task 21 |
| 27. Create vendor bank details (masked) | `src/domains/payables/components/vendor-bank-details.tsx` | — |
| 28. Create price alert badge | `src/domains/payables/components/price-intelligence/price-alert-badge.tsx` | Task 20 |
| 29. Create vendor comparison note | `src/domains/payables/components/price-intelligence/vendor-comparison-note.tsx` | Task 20 |
| 30. Create spend analytics components (3) | `src/domains/payables/components/spend-analytics/` | Task 21 |

### Phase 5: Frontend — Pages & Integration

**Goal**: AP dashboard page live, invoice review enhanced, sidebar updated.

| Task | Files | Depends On |
|------|-------|------------|
| 31. Create summary cards component | `src/domains/payables/components/summary-cards.tsx` | Task 21 |
| 32. Create AP dashboard layout | `src/domains/payables/components/ap-dashboard.tsx` | Tasks 22-31 |
| 33. Create AP dashboard page | `src/app/[locale]/payables/page.tsx` | Task 32 |
| 34. Add Payables to sidebar nav | `src/components/ui/sidebar.tsx` | Task 33 |
| 35. Enhance invoice review — vendor context | `src/domains/invoices/components/documents-list.tsx` | Tasks 26, 28, 29 |
| 36. Enhance accounting entry modal — due date | `src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx` | Task 7 |
| 37. Enhance document mapper — vendor terms | `src/domains/invoices/lib/document-to-accounting-entry-mapper.ts` | Task 7 |

### Phase 6: Build & Verify

| Task | Files | Depends On |
|------|-------|------------|
| 38. Run `npm run build` — fix errors | All | All above |
| 39. Final `npx convex deploy --yes` | — | Task 38 |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Schema migration breaks existing entries | New fields are all optional — backward compatible |
| Aging query performance with many entries | Use Convex indexes; limit vendor drill-down to top vendors |
| Price normalization mismatches | Reuse existing vendor normalizer; require 2+ observations before alerting |
| Multi-currency aging confusion | Always display amounts in home currency on dashboard; show original currency inline |
| Partial payment complexity | Pre-fill full amount; partial is opt-in by adjusting the amount field |
