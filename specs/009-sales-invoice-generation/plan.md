# Implementation Plan: Sales Invoice Generation

**Branch**: `009-sales-invoice-generation` | **Date**: 2026-02-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-sales-invoice-generation/spec.md`

## Summary

Add a sales invoice generation feature that enables finance admins to create, preview, send, and track professional invoices to customers. This complements the existing vendor invoice upload & OCR feature by providing the outbound invoicing capability. The implementation follows accrual-basis accounting (revenue recognized on send, payment recorded separately) and leverages existing Convex real-time patterns, the semantic design system, and the email/PDF infrastructure already in the project.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, React Query 5.90.7
**Storage**: Convex (document database with real-time subscriptions), Convex File Storage (logo uploads)
**Testing**: Manual UAT (project pattern — no automated test framework currently configured)
**Target Platform**: Web (responsive, mobile-friendly)
**Project Type**: Web application (Next.js App Router + Convex backend)
**Performance Goals**: Invoice creation form loads in <2s, PDF generation <5s, real-time list updates <500ms
**Constraints**: Client-side PDF via html2pdf.js (already in project), email via AWS SES + Resend fallback (already in project)
**Scale/Scope**: SME businesses, <1000 invoices per business, <50 concurrent users per business

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is a blank template with no project-specific principles defined. No gate violations to check. The implementation will follow the established patterns documented in CLAUDE.md:
- Semantic design tokens (no hardcoded colors)
- Convex patterns (business scoping, soft deletes, embedded line items)
- formatCurrency/formatBusinessDate utilities
- Finance admin role gating
- Build-fix loop (npm run build must pass)

**Gate Status**: PASS (no violations)

## Project Structure

### Documentation (this feature)

```text
specs/009-sales-invoice-generation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── convex-functions.md
│   └── api-routes.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Convex Backend (new tables + functions)
convex/
├── schema.ts                          # Add: sales_invoices, customers, catalog_items tables
├── functions/
│   ├── salesInvoices.ts               # NEW: CRUD + lifecycle mutations/queries
│   ├── customers.ts                   # NEW: Customer directory CRUD
│   ├── catalogItems.ts               # NEW: Product/service catalog CRUD
│   └── accountingEntries.ts           # MODIFY: Add sales invoice source type

# Next.js Frontend (new domain + routes)
src/
├── domains/
│   └── sales-invoices/                # NEW domain
│       ├── types/
│       │   └── index.ts               # TypeScript types + Zod schemas
│       ├── components/
│       │   ├── sales-invoice-list.tsx          # Invoice dashboard/list
│       │   ├── sales-invoice-form.tsx          # Create/edit invoice form
│       │   ├── invoice-line-items-table.tsx    # Editable line items grid
│       │   ├── invoice-preview.tsx             # PDF-ready preview
│       │   ├── customer-selector.tsx           # Customer search/select
│       │   ├── catalog-item-selector.tsx       # Product catalog search
│       │   ├── invoice-status-badge.tsx        # Status badge component
│       │   ├── payment-recorder.tsx            # Record payment modal
│       │   ├── customer-form.tsx               # Customer CRUD form
│       │   ├── catalog-item-form.tsx           # Catalog item CRUD form
│       │   └── invoice-templates/
│       │       ├── template-modern.tsx         # Modern clean template
│       │       └── template-classic.tsx        # Classic professional template
│       ├── hooks/
│       │   ├── use-sales-invoices.ts           # Real-time invoice list
│       │   ├── use-sales-invoice-form.ts       # Form state management
│       │   ├── use-customers.ts                # Customer data hooks
│       │   ├── use-catalog-items.ts            # Catalog data hooks
│       │   └── use-invoice-pdf.ts              # PDF generation hook
│       ├── lib/
│       │   ├── invoice-calculations.ts         # Tax, discount, total calculations
│       │   ├── invoice-number-format.ts        # Invoice number formatting
│       │   └── invoice-email.ts                # Email sending wrapper
│       └── CLAUDE.md                           # Domain documentation
├── app/
│   └── [locale]/
│       └── sales-invoices/
│           ├── page.tsx                        # Main list page
│           └── create/
│               └── page.tsx                    # Create invoice page
└── lib/
    └── services/
        └── email-service.ts                    # MODIFY: Add invoice email template
```

**Structure Decision**: Follows existing domain-driven architecture with `src/domains/sales-invoices/` as a new domain parallel to `expense-claims` and `invoices`. Convex functions added alongside existing functions. Routes follow the `[locale]/{feature}` pattern.

## Complexity Tracking

No constitution violations to justify. The feature uses existing patterns throughout:
- Convex tables follow `invoices` + `accounting_entries` patterns
- UI follows `expense-claims` form/list patterns
- Email uses existing `email-service.ts`
- PDF uses existing `html2pdf.js`
