# Implementation Plan: Accounts Receivable & Debtor Management

**Branch**: `010-ar-debtor-management` | **Date**: 2026-02-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-ar-debtor-management/spec.md`

## Summary

Add Accounts Receivable (AR) tracking and debtor management to the existing sales invoices module. This includes: a new `payments` table with embedded allocation arrays to track individual payment records linked to invoices, a "Debtors" tab in the Invoices page showing customer-level outstanding balances with aging analysis, a debtor detail view with invoice/payment history, debtor statement PDF generation with date-range filtering, and an AR aging report with CSV export. Payments are immutable — corrections use reversal entries.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Radix UI Tabs, html2pdf.js, lucide-react
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js monorepo with Convex backend)
**Performance Goals**: Debtor list <3s for 200 debtors, statement render <5s, PDF download <3s
**Constraints**: All data business-scoped (multi-tenant), finance_admin role required, existing i18n via next-intl
**Scale/Scope**: SME businesses with up to 500 customers, 5000 invoices, 10000 payments

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template (not project-specific). No gates to enforce. Proceeding with CLAUDE.md project rules:
- [x] Prefer modification over creation of new files
- [x] Use semantic design tokens (no hardcoded colors)
- [x] Build must pass before completion
- [x] Convex deployment required after schema/function changes
- [x] Git author: grootdev-ai / dev@hellogroot.com

## Project Structure

### Documentation (this feature)

```text
specs/010-ar-debtor-management/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (Convex function contracts)
│   ├── payments.md      # Payment mutations and queries
│   └── debtors.md       # Debtor queries and aggregations
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Backend (Convex)
convex/
├── schema.ts                    # MODIFY: Add payments table
├── functions/
│   ├── salesInvoices.ts         # MODIFY: Update recordPayment mutation
│   └── payments.ts              # NEW: Payment & debtor queries/mutations
└── lib/
    └── validators.ts            # MODIFY: Add payment method validators

# Frontend (Next.js + React)
src/
├── domains/
│   ├── sales-invoices/
│   │   ├── types/index.ts                    # MODIFY: Add Payment types
│   │   ├── hooks/
│   │   │   ├── use-sales-invoices.ts         # MODIFY: Add payment query hooks
│   │   │   └── use-debtor-management.ts      # NEW: Debtor list, detail, aging hooks
│   │   ├── components/
│   │   │   ├── payment-recorder.tsx          # MODIFY: Multi-invoice allocation
│   │   │   ├── debtor-list.tsx               # NEW: Debtor list with aging summary
│   │   │   ├── debtor-detail.tsx             # NEW: Customer invoice/payment history
│   │   │   ├── debtor-statement.tsx          # NEW: Statement view + PDF generation
│   │   │   └── aging-report.tsx              # NEW: AR aging report + CSV export
│   │   └── lib/
│   │       ├── aging-calculations.ts         # NEW: Aging bucket logic
│   │       └── statement-generator.ts        # NEW: Statement data computation
│   └── invoices/
│       └── components/
│           └── invoices-tab-container.tsx     # MODIFY: Add "Debtors" tab
├── lib/
│   └── constants/
│       └── statuses.ts                       # MODIFY: Add payment statuses
└── messages/
    ├── en.json                               # MODIFY: Add debtor/AR translations
    ├── th.json                               # MODIFY: Add debtor/AR translations
    ├── id.json                               # MODIFY: Add debtor/AR translations
    └── zh.json                               # MODIFY: Add debtor/AR translations
```

**Structure Decision**: Extends the existing `src/domains/sales-invoices/` domain rather than creating a new domain. AR/debtor management is a natural extension of sales invoicing. Backend adds a new `payments.ts` Convex function file alongside the existing `salesInvoices.ts`. The debtors UI integrates as a third tab in the existing `invoices-tab-container.tsx`.
