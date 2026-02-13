# Quickstart: Stripe-Style Invoice Creation UX

**Branch**: `012-stripe-invoice-ux` | **Date**: 2026-02-13

## What This Feature Does

Replaces the existing invoice creation and editing UI with a Stripe-inspired split-panel layout:
- **Left panel**: Scrollable form with sections (Customer → Currency → Items → Payment Collection → Additional Options)
- **Right panel**: Sticky preview with tabs (Invoice PDF, Email)
- **Header bar**: Close, auto-save status, Hide/Show preview, Review invoice

## Key Files to Understand First

| File | Purpose |
| ---- | ------- |
| `src/domains/sales-invoices/hooks/use-sales-invoice-form.ts` | Central form state hook — extend this for new fields |
| `src/domains/sales-invoices/components/sales-invoice-form.tsx` | Current create form — will be replaced by new layout |
| `src/domains/sales-invoices/components/invoice-preview.tsx` | Current preview — adapt for side-panel rendering |
| `src/domains/sales-invoices/components/invoice-templates/template-modern.tsx` | HTML template — reused as PDF preview |
| `src/app/[locale]/sales-invoices/create/page.tsx` | Create page route — swap to new layout |
| `src/app/[locale]/sales-invoices/[id]/edit/page.tsx` | Edit page route — swap to new layout |
| `convex/schema.ts` | Convex schema — add new fields to lineItem and sales_invoices |
| `convex/functions/salesInvoices.ts` | Convex mutations — add new fields to create/update validators |

## Build Order

### Phase A: Data Model (do first — everything depends on this)
1. Add new fields to Convex schema (`convex/schema.ts`)
2. Add new fields to TypeScript types (`types/index.ts`)
3. Update Convex create/update mutations (`salesInvoices.ts`)
4. Deploy Convex (`npx convex deploy --yes`)

### Phase B: Form Hook Extension
5. Extend `useSalesInvoiceForm()` with new fields (footer, customFields, showTaxId)
6. Extend LineItem handling (supplyDateStart/End, isDiscountable)
7. Add auto-save logic (debounced, triggered after first meaningful input)
8. Add `initialData` support for edit mode

### Phase C: New Components
9. Build `InvoiceEditorLayout` (split-panel shell)
10. Build `InvoiceEditorHeader` (header bar with actions)
11. Build `InvoiceFormPanel` (left panel container with sections)
12. Adapt `InvoicePreviewPanel` from existing preview (add tab switching)
13. Build `EmailPreview` component (new)
14. Build `ItemDetailForm` with collapsible "Item options"
15. Build `AdditionalOptionsSection` with toggle-able fields
16. Build `ReviewInvoiceView` for finalization

### Phase D: Page Integration
17. Update create page route to use `InvoiceEditorLayout`
18. Update edit page route to use `InvoiceEditorLayout` with `initialData`
19. Update PDF templates to show new fields (supply dates, custom fields, footer, tax ID)

## Running Locally

```bash
# Start dev server
npm run dev

# Convex dev (auto-sync schema changes)
npx convex dev

# After schema changes, deploy to prod
npx convex deploy --yes

# Build check
npm run build
```

## Testing Checklist

- [ ] Create new invoice → split layout renders
- [ ] Fill customer → preview updates in real-time
- [ ] Add line items → preview shows items
- [ ] Expand "Item options" → set supply dates → dates appear in preview
- [ ] Switch to Email tab → email preview renders
- [ ] Toggle "Hide preview" → form goes full-width
- [ ] Auto-save triggers after customer selection
- [ ] Edit existing draft → pre-populated in same layout
- [ ] "Review invoice" → finalization view
- [ ] Additional Options: Memo, Footer, Custom Fields, Tax ID all toggle and render
- [ ] Responsive: preview hidden on mobile, "Show preview" available
