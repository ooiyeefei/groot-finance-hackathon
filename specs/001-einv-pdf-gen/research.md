# Research: LHDN E-Invoice PDF Generation & Buyer Delivery

## Key Findings

### Existing Building Blocks (from 022-einvoice-lhdn-buyer-flows)

| Component | File | Status |
|-----------|------|--------|
| PDF template with LHDN block | `src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx` | Complete — QR code, UUID, validation date, badge |
| QR code generation | `src/domains/sales-invoices/components/lhdn-qr-code.tsx` | Complete — `generateLhdnQrDataUrl()` |
| Delivery API route | `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/deliver/route.ts` | Complete — internal auth, PDF gen, SES send |
| Auto-delivery trigger | `convex/functions/lhdnJobs.ts:triggerAutoDelivery` | Complete — fires after LHDN validation |
| Business settings | `businesses.einvoiceAutoDelivery` | Complete — toggle exists in schema + settings UI |
| Delivery tracking fields | `sales_invoices.lhdnPdfDeliveredAt/To` | Complete — written by deliver route |
| Notification system | `convex/functions/notifications.ts` | Complete — supports `lhdn_submission` type |

### Gaps Identified

| Gap | Impact | Resolution |
|-----|--------|------------|
| No "Send to Buyer" UI button | Users can't manually trigger delivery | New component + API route with Clerk auth |
| No delivery status display | Users can't see if PDF was sent | New `lhdn-delivery-status.tsx` component |
| No failure notification | Silent failures when email bounces | Add `notifications.create` call in lhdnJobs.ts |
| No PDF persistence | PDF regenerated each download | Store in Convex file storage after generation |
| No delivery error tracking | Can't display failure reasons | Add `lhdnPdfDeliveryStatus` + `lhdnPdfDeliveryError` fields |
| LhdnDetailSection shows "Coming Soon" | Placeholder instead of real delivery info | Replace with delivery status + send button |

### Design Decisions

1. **User-facing send endpoint**: Create `/lhdn/send-to-buyer` with Clerk auth (vs existing `/lhdn/deliver` which uses internal service key). The internal route stays for auto-delivery from Lambda; the new route handles user-initiated sends.

2. **PDF storage strategy**: Store PDF in Convex File Storage (not S3) since delivery route already runs in Next.js API route with Convex client access. Use existing `pdfStorageId` field pattern. Generate once, serve from storage on subsequent downloads.

3. **Delivery status model**: Simple 3-state: `pending | delivered | failed`. No separate "sending" state — the operation is synchronous within the API route.

4. **Failure notification**: Use existing `notifications.create` internalMutation with type `lhdn_submission` and severity `warning`. Deep-link to invoice detail page.
