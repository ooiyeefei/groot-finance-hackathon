# Quickstart: LHDN E-Invoice Buyer Flows

## Prerequisites

- Node.js 20.x, npm
- Convex CLI (`npx convex`)
- AWS CLI configured with `--profile groot-finanseal`
- LHDN sandbox credentials configured in environment

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 022-einvoice-lhdn-buyer-flows

# 2. Install dependencies (if any new ones added)
npm install

# 3. Start Convex dev (auto-syncs schema changes)
npx convex dev

# 4. Start Next.js dev server
npm run dev
```

## Implementation Order

1. **Schema changes** → `convex/schema.ts` (extend sales_invoices, einvoice_received_documents, businesses, expense_claims)
2. **LHDN client methods** → `src/lib/lhdn/client.ts` + `types.ts` (add rejectDocument, getDocumentDetails)
3. **Status polling** → extend `src/lambda/lhdn-polling/handler.ts` + Convex mutations
4. **Buyer rejection** → new API route + Convex mutation + UI dialog
5. **PDF with QR** → extend invoice PDF template + auto-delivery trigger
6. **Buyer notifications** → new service + trigger points
7. **Dashboard** → new component + Convex query

## Testing

```bash
# Build check (must pass)
npm run build

# Deploy Convex schema changes to prod
npx convex deploy --yes

# Deploy Lambda changes (if polling Lambda modified)
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2

# Manual UAT against LHDN sandbox
# See .env.local for test credentials
```

## Key Files Reference

| Component | File |
|-----------|------|
| LHDN Client | `src/lib/lhdn/client.ts` |
| LHDN Types | `src/lib/lhdn/types.ts` |
| Polling Lambda | `src/lambda/lhdn-polling/handler.ts` |
| Convex Schema | `convex/schema.ts` |
| Sales Invoice Mutations | `convex/functions/salesInvoices.ts` |
| LHDN Jobs | `convex/functions/lhdnJobs.ts` |
| Email Service | `src/lib/services/email-service.ts` |
| Invoice PDF Template | `src/domains/sales-invoices/components/invoice-templates/` |
| QR Code Component | `src/domains/sales-invoices/components/lhdn-qr-code.tsx` |
| Send Email Route | `src/app/api/v1/sales-invoices/[invoiceId]/send-email/route.ts` |
