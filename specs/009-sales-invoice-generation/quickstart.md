# Quickstart: Sales Invoice Generation

**Feature**: 009-sales-invoice-generation
**Date**: 2026-02-09

## Prerequisites

- Node.js 20.x
- Convex CLI (`npx convex`)
- Git (on branch `009-sales-invoice-generation`)
- AWS credentials configured (for SES email)
- Clerk configured (authentication)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 009-sales-invoice-generation

# 2. Install dependencies (if any new ones added)
npm install

# 3. Start dev server (runs both Next.js + Convex)
npm run dev

# 4. In separate terminal, push Convex schema changes
npx convex dev
```

## Implementation Order

The feature should be built in this sequence to enable incremental testing:

### Phase 1: Data Foundation (Backend)
1. Add new tables to `convex/schema.ts` (sales_invoices, customers, catalog_items, recurring_invoice_schedules)
2. Add `invoiceSettings` field to businesses table
3. Extend `sourceDocumentType` validator in accounting_entries
4. Create `convex/functions/salesInvoices.ts` (CRUD + lifecycle)
5. Create `convex/functions/customers.ts` (CRUD)
6. Create `convex/functions/catalogItems.ts` (CRUD)
7. Run `npx convex dev` to push schema

### Phase 2: Core UI (Frontend)
1. Create `src/domains/sales-invoices/types/index.ts` (types + Zod schemas)
2. Create hooks: `use-sales-invoices.ts`, `use-customers.ts`, `use-catalog-items.ts`
3. Create `src/app/[locale]/sales-invoices/page.tsx` (list page with auth gate)
4. Create `sales-invoice-list.tsx` component
5. Create `invoice-status-badge.tsx` component
6. Add "Sales Invoices" to sidebar navigation

### Phase 3: Invoice Creation Flow
1. Create `use-sales-invoice-form.ts` hook (form state, calculations)
2. Create `invoice-line-items-table.tsx` (editable grid)
3. Create `customer-selector.tsx` (search/autocomplete)
4. Create `catalog-item-selector.tsx` (search/autocomplete)
5. Create `sales-invoice-form.tsx` (main form, assembles sub-components)
6. Create `src/app/[locale]/sales-invoices/create/page.tsx` (route)
7. Create `src/domains/sales-invoices/lib/invoice-calculations.ts` (calc logic)

### Phase 4: Preview & PDF
1. Create invoice template components (`template-modern.tsx`, `template-classic.tsx`)
2. Create `invoice-preview.tsx` (renders template in preview mode)
3. Create `use-invoice-pdf.ts` hook (html2pdf.js wrapper)
4. Wire up "Preview" and "Download PDF" buttons

### Phase 5: Email & Send
1. Extend `email-service.ts` with `sendInvoiceEmail()` method
2. Create `POST /api/v1/sales-invoices/[invoiceId]/send-email` route
3. Wire up "Send" button in preview → calls send mutation + email API
4. Implement accounting entry creation on send (AR entry)

### Phase 6: Payment & Lifecycle
1. Create `payment-recorder.tsx` (record payment modal)
2. Wire up `recordPayment` mutation
3. Implement accounting entry update on payment
4. Add void action with confirmation dialog
5. Add overdue cron job in `convex/crons.ts`

### Phase 7: Customer & Catalog Management
1. Create `customer-form.tsx` (CRUD form/modal)
2. Create `catalog-item-form.tsx` (CRUD form/modal)
3. Add management UI (inline or as sub-pages of sales-invoices)

### Phase 8: Business Profile & Templates
1. Create invoice settings UI (logo upload, company details, payment instructions)
2. Create `POST /api/v1/sales-invoices/logo-upload` route
3. Wire invoice settings into form defaults
4. Template selector in invoice form

### Phase 9: Recurring Invoices
1. Create recurring schedule Convex functions
2. Add recurring cron job in `convex/crons.ts`
3. Add recurring UI (enable/disable on invoice, schedule config)

## Key Files Reference

| Purpose | File |
|---------|------|
| Convex schema | `convex/schema.ts` |
| Invoice functions | `convex/functions/salesInvoices.ts` |
| Types & schemas | `src/domains/sales-invoices/types/index.ts` |
| Invoice form hook | `src/domains/sales-invoices/hooks/use-sales-invoice-form.ts` |
| Calculation logic | `src/domains/sales-invoices/lib/invoice-calculations.ts` |
| Email service | `src/lib/services/email-service.ts` |
| Design tokens | `src/app/globals.css` |
| Number formatting | `src/lib/utils/format-number.ts` |
| Date formatting | `src/lib/utils/index.ts` (formatBusinessDate) |

## Build Verification

```bash
# MUST pass before each phase completion
npm run build

# Deploy Convex after schema changes
npx convex dev        # Development
npx convex deploy --yes  # Production (after testing)
```

## Common Patterns to Follow

```typescript
// Business scoping (every query/mutation)
const membership = await ctx.db
  .query("business_memberships")
  .withIndex("by_userId_businessId", (q) =>
    q.eq("userId", user._id).eq("businessId", args.businessId)
  )
  .first();

// Finance admin check
if (!membership || membership.role !== "owner" && membership.role !== "manager") {
  throw new Error("Not authorized: finance admin required");
}

// Soft delete filter
records = records.filter(r => !r.deletedAt);

// Currency formatting
import { formatCurrency } from '@/lib/utils/format-number'
formatCurrency(1234.56, 'SGD')  // "S$1,234.56"

// Business date (no timezone conversion)
import { formatBusinessDate } from '@/lib/utils'
formatBusinessDate('2026-03-15')  // "Mar 15, 2026"

// Semantic design tokens
<div className="bg-card text-foreground border border-border rounded-lg p-4">
```
