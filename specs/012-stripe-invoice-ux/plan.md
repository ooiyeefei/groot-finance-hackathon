# Implementation Plan: Stripe-Style Invoice Creation UX

**Branch**: `012-stripe-invoice-ux` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-stripe-invoice-ux/spec.md`

## Summary

Replace the existing invoice creation and editing UI with a Stripe-inspired split-panel layout: scrollable form on the left (Customer → Currency → Items → Payment Collection → Additional Options) with a sticky preview panel on the right (Invoice PDF and Email tabs). Add advanced item options (service date range, discountable toggle), additional customization fields (footer, custom fields, tax ID display), auto-save drafts, and a Review Invoice finalization step. This is primarily a frontend UX transformation with minor Convex schema extensions.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, @react-pdf/renderer, Clerk 6.30.0, Zod 3.23.8, Tailwind CSS, Radix UI
**Storage**: Convex (document database with real-time subscriptions), Convex File Storage (PDF uploads)
**Testing**: Manual testing (no automated test framework in current codebase)
**Target Platform**: Web (desktop-first, responsive to tablet/mobile)
**Project Type**: Web application (Next.js full-stack with Convex backend)
**Performance Goals**: Preview updates <1s, page load <2s, auto-save debounce 1.5s
**Constraints**: Must maintain backward compatibility with existing invoices, all new schema fields optional
**Scale/Scope**: ~15 new/modified components, ~5 modified Convex files, ~3 modified page routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Proceeding with standard best practices from CLAUDE.md:
- Use semantic design tokens (bg-card, text-foreground, etc.)
- Action buttons: bg-primary hover:bg-primary/90 text-primary-foreground
- formatCurrency/formatBusinessDate for number/date display
- Convex deploy after schema changes
- npm run build must pass

**Post-Phase 1 re-check**: Design adheres to all CLAUDE.md rules. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/012-stripe-invoice-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output — decision log and unknowns resolved
├── data-model.md        # Phase 1 output — schema changes
├── quickstart.md        # Phase 1 output — build order and testing checklist
├── contracts/           # Phase 1 output — component interface contracts
│   └── component-interfaces.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Files to CREATE (new components)
src/domains/sales-invoices/components/
├── invoice-editor-layout.tsx        # Split-panel shell (form + preview)
├── invoice-editor-header.tsx        # Header bar (close, save status, actions)
├── invoice-form-panel.tsx           # Left panel container with all sections
├── invoice-preview-panel.tsx        # Right panel with tab switching
├── email-preview.tsx                # Email mockup preview component
├── item-detail-form.tsx             # Line item editor with "Item options"
├── additional-options-section.tsx   # Toggle-able customization fields
├── payment-collection-section.tsx   # Payment terms + method chips
├── currency-section.tsx             # Currency selector with warning
└── review-invoice-view.tsx          # Finalization/review before send

# Files to MODIFY (extend existing)
src/domains/sales-invoices/hooks/
├── use-sales-invoice-form.ts        # Add new fields, auto-save, initialData
└── use-invoice-pdf.ts               # No changes expected

src/domains/sales-invoices/types/
└── index.ts                         # Add LineItem + SalesInvoice fields

src/domains/sales-invoices/components/
├── invoice-preview.tsx              # Adapt for side-panel use
├── invoice-line-items-table.tsx     # Add supply dates display
├── customer-selector.tsx            # Add language display
└── invoice-settings-form.tsx        # Add accepted payment methods config

src/domains/sales-invoices/components/invoice-templates/
├── template-modern.tsx              # Add supply dates, custom fields, footer, tax ID
├── template-classic.tsx             # Same extensions as modern
└── pdf-document.tsx                 # Add supply dates, custom fields, footer, tax ID

# Convex files to MODIFY
convex/
├── schema.ts                        # Add new fields to lineItem + sales_invoices + invoiceSettings
└── functions/salesInvoices.ts       # Add new fields to create/update validators

# Page routes to MODIFY
src/app/[locale]/sales-invoices/
├── create/page.tsx                  # Swap to InvoiceEditorLayout
└── [id]/edit/page.tsx               # Swap to InvoiceEditorLayout with initialData
```

**Structure Decision**: This is a frontend-dominant feature within the existing Next.js + Convex web application. All new components live under the existing `src/domains/sales-invoices/` domain structure. No new directories beyond what's shown above. The Convex backend changes are schema extensions only — no new functions or tables.

## Complexity Tracking

No constitution violations to justify.

## Phase 0: Research (Complete)

See [research.md](./research.md) for full decision log. Key decisions:
- **D1**: Unified split-panel layout replaces both create and edit pages
- **D2**: HTML-based preview (reuse templates) — not PDF-in-iframe for performance
- **D3**: Email preview is a static HTML mockup component
- **D4**: Debounced auto-save (1.5s); draft created after first meaningful input
- **D5**: Additive schema changes (all new fields optional)
- **D6**: Extend existing `useSalesInvoiceForm()` hook for both create and edit
- **D7**: Same URL routes, just swap the page-level component

## Phase 1: Design (Complete)

See [data-model.md](./data-model.md) for schema changes:
- LineItem: +supplyDateStart, +supplyDateEnd, +isDiscountable
- sales_invoices: +footer, +customFields, +showTaxId
- businesses.invoiceSettings: +acceptedPaymentMethods

See [contracts/component-interfaces.md](./contracts/component-interfaces.md) for all component props.

See [quickstart.md](./quickstart.md) for build order and testing checklist.

## Phase 2: Implementation Tasks

To be generated by `/speckit.tasks`. The build sequence follows four phases:

### Phase A: Data Model Foundation
1. Extend Convex schema with new fields
2. Extend TypeScript types and Zod schemas
3. Update Convex mutations (create/update validators)
4. Deploy Convex

### Phase B: Form Hook Extension
5. Add new fields to `useSalesInvoiceForm()` (footer, customFields, showTaxId)
6. Add LineItem extensions (supplyDateStart/End, isDiscountable)
7. Add auto-save logic with debounce
8. Add `initialData` support for edit mode

### Phase C: New Components (can parallelize)
9. `InvoiceEditorLayout` — split-panel shell
10. `InvoiceEditorHeader` — header bar
11. `InvoiceFormPanel` — left panel sections container
12. `InvoicePreviewPanel` — right panel with tabs
13. `EmailPreview` — email mockup
14. `ItemDetailForm` — line item editor with advanced options
15. `AdditionalOptionsSection` — toggle fields
16. `PaymentCollectionSection` — payment terms + chips
17. `CurrencySection` — currency selector
18. `ReviewInvoiceView` — finalization view

### Phase D: Integration & Templates
19. Update create page route
20. Update edit page route
21. Update PDF templates (modern + classic + pdf-document) with new fields
22. Update invoice settings form with accepted payment methods
23. Responsive behavior (hide preview on mobile)
24. Build verification (`npm run build`)
