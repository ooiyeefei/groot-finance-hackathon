# Quickstart: LHDN E-Invoice PDF Delivery

## Prerequisites
- Node.js 20.x, npm
- Convex CLI (`npx convex`)
- Access to Convex dashboard (kindhearted-lynx-129)

## Dev Setup
```bash
npm install
npx convex dev          # Start Convex dev sync
npm run dev             # Start Next.js dev server
```

## Testing Flow
1. Create a sales invoice in the app
2. Submit it to LHDN (requires LHDN sandbox credentials)
3. Wait for polling to detect validation (or manually set `lhdnStatus: "valid"` in Convex dashboard)
4. Verify: "Download E-Invoice (LHDN)" button appears on invoice detail page
5. Verify: "Send to Buyer" button appears
6. Click "Send to Buyer" — check buyer email for delivered PDF
7. Toggle `einvoiceAutoDelivery` OFF in business settings, validate another invoice, confirm no auto-send

## Key Files
- Schema: `convex/schema.ts` (sales_invoices table)
- Delivery route: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/deliver/route.ts`
- Send-to-buyer route: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/send-to-buyer/route.ts`
- Invoice detail page: `src/app/[locale]/sales-invoices/[id]/page.tsx`
- Delivery status component: `src/domains/sales-invoices/components/lhdn-delivery-status.tsx`
- Send button component: `src/domains/sales-invoices/components/send-to-buyer-button.tsx`
