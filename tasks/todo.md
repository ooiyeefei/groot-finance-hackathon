# Rich Payment Methods on Invoice Templates

## Summary
Replace simple `acceptedPaymentMethods: string[]` with rich `paymentMethods` object array. Each method has `{ id, label, enabled, details?, qrCodeStorageId? }`. Payment methods with details and QR codes now render on invoice previews and PDFs.

## Tasks

- [x] **Batch 1**: Schema & Types — Add `paymentMethods` to Convex schema + `PaymentMethodConfig` TS type
- [x] **Batch 2**: Convex Query & Mutation — QR URL resolution in `getInvoiceDefaults`, backward compat migration
- [x] **Batch 3**: Settings Form UI — Rich payment method cards with details textarea and QR upload
- [x] **Batch 4**: Template Rendering — Payment methods section in modern + classic HTML templates
- [x] **Batch 5**: PDF Rendering + Deploy — Payment methods in PDF with QR `<Image>`, Convex deploy, build pass

## Files Changed

### Schema & Backend
- `convex/schema.ts` — Added `paymentMethods` array field to `invoiceSettings`
- `convex/functions/salesInvoices.ts` — Updated `getInvoiceDefaults` (QR URL resolution, backward compat from old `acceptedPaymentMethods`), updated `updateInvoiceDefaults` (accepts `paymentMethods` arg)

### Types
- `src/domains/sales-invoices/types/index.ts` — Added `PaymentMethodConfig` interface, updated `InvoiceSettings`

### Settings UI
- `src/domains/sales-invoices/components/invoice-settings-form.tsx` — Replaced flat checkbox grid with expandable `PaymentMethodCard` components (toggle, details textarea, QR upload for SE Asian payment methods)

### Template Rendering (HTML)
- `src/domains/sales-invoices/components/invoice-templates/template-modern.tsx` — Added `paymentMethods` to `businessInfo` type, renders payment methods section
- `src/domains/sales-invoices/components/invoice-templates/template-classic.tsx` — Same changes
- `src/domains/sales-invoices/components/invoice-preview.tsx` — Updated `businessInfo` type
- `src/domains/sales-invoices/components/invoice-preview-panel.tsx` — Updated `businessInfo` type
- `src/domains/sales-invoices/components/review-invoice-view.tsx` — Updated `businessInfo` type

### PDF Rendering
- `src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx` — Added `paymentMethods` to `PdfBusinessInfo`, renders 2-column flex layout with QR `<Image>`

### Data Flow
- `src/domains/sales-invoices/components/invoice-editor-layout.tsx` — Threads enabled `paymentMethods` from `invoiceDefaults` into `businessInfo`

## Verification
- [x] `npx convex deploy --yes` — Success
- [x] `npm run build` — Success, no errors
