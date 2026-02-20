# Quickstart: Peppol InvoiceNow Transmission UI

**Branch**: `001-peppol-submission-ui`

## Prerequisites

- Node.js 20.x
- Convex dev server running (`npx convex dev`)
- At least one business with `peppolParticipantId` set in the database
- At least one customer with `peppolParticipantId` set
- At least one sales invoice in "sent" status for that customer

## Build & Verify

```bash
npm run build          # Must pass after all changes
npx convex deploy --yes  # Required after Convex function changes
```

## Files to Create (4 new)

| File | Purpose |
|------|---------|
| `src/domains/sales-invoices/components/peppol-status-badge.tsx` | Peppol status badge (gray/blue/green/red) |
| `src/components/ui/status-timeline.tsx` | Reusable status timeline component |
| `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` | Composite Peppol UI for detail page |
| `src/domains/sales-invoices/components/peppol-error-panel.tsx` | Error display with retry action |

## Files to Modify (4 existing)

| File | Change |
|------|--------|
| `convex/functions/salesInvoices.ts` | Add `initiatePeppolTransmission` + `retryPeppolTransmission` mutations |
| `src/domains/sales-invoices/hooks/use-sales-invoices.ts` | Add Peppol mutation hooks to `useSalesInvoiceMutations()` |
| `src/domains/sales-invoices/components/sales-invoice-list.tsx` | Add PeppolStatusBadge next to InvoiceStatusBadge |
| `src/app/[locale]/sales-invoices/[id]/page.tsx` | Add PeppolTransmissionPanel to detail page sidebar |

## Implementation Order

1. **Convex mutations** — Backend first, so UI has something to call
2. **PeppolStatusBadge** — Smallest, most isolated component
3. **StatusTimeline** — Reusable UI component, no domain dependencies
4. **PeppolErrorPanel** — Small component needed by the panel
5. **PeppolTransmissionPanel** — Composes badge, timeline, error panel
6. **Invoice list integration** — Add badge to list view
7. **Invoice detail integration** — Add panel to detail page
8. **Build verification** — `npm run build` + `npx convex deploy --yes`

## Testing Manually

1. Set `peppolParticipantId` on a business via Convex dashboard
2. Set `peppolParticipantId` on a customer via Convex dashboard
3. Create and send an invoice for that customer
4. Open invoice detail → "Send via InvoiceNow" button should appear
5. Click → Confirmation dialog shows receiver's Peppol ID
6. Confirm → Status changes to "pending"
7. Manually set `peppolStatus` to "failed" with errors in Convex dashboard → Error panel appears
8. Click "Retry" → Status resets to "pending"
9. Manually set `peppolStatus` to "delivered" with `peppolDeliveredAt` → Delivery confirmation appears
