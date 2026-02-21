# Quickstart: Peppol InvoiceNow Integration

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20

## Prerequisites

1. **Storecove sandbox account** — Register at https://www.storecove.com/start-now/
2. **Storecove Legal Entity** — Create sender entity at https://app.storecove.com/senders (approval: ~1 business day)
3. **API key** — Generate from Storecove admin panel
4. **Node.js 20.x** and project dependencies installed

## Environment Variables

Add to `.env.local`:

```bash
# Storecove Peppol AP Integration
STORECOVE_API_KEY=your_sandbox_api_key
STORECOVE_LEGAL_ENTITY_ID=12345
STORECOVE_API_URL=https://api.storecove.com
STORECOVE_WEBHOOK_SECRET=your_webhook_secret

# Existing (already configured)
NEXT_PUBLIC_CONVEX_URL=...
CLERK_SECRET_KEY=...
```

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 001-peppol-integrate

# 2. Install dependencies (if new packages added)
npm install

# 3. Start Convex dev server (auto-syncs schema changes)
npx convex dev

# 4. Start Next.js dev server
npm run dev

# 5. Expose webhook endpoint for testing (use ngrok or similar)
ngrok http 3000
# Configure webhook URL in Storecove: https://your-ngrok-url/api/v1/peppol/webhook
```

## Key Files to Modify/Create

### Schema (modify existing)
- `convex/schema.ts` — Add `originalInvoiceId`, `creditNoteReason` fields + index

### Backend — New Files
- `src/lib/peppol/storecove-client.ts` — Storecove API client
- `src/lib/peppol/invoice-mapper.ts` — Invoice → Storecove JSON mapper
- `src/lib/peppol/webhook-parser.ts` — Webhook event parser
- `src/lib/peppol/types.ts` — Storecove TypeScript types
- `src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts` — Transmit endpoint
- `src/app/api/v1/sales-invoices/[invoiceId]/peppol/retry/route.ts` — Retry endpoint
- `src/app/api/v1/peppol/webhook/route.ts` — Webhook handler
- `src/app/api/v1/peppol/discovery/route.ts` — Discovery endpoint

### Backend — Modify Existing
- `convex/functions/salesInvoices.ts` — Implement mutation stubs + add credit note mutations
- `convex/functions/einvoiceUsage.ts` — Add grace buffer logic

### Frontend — Modify Existing (remove "Coming Soon")
- `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — Wire to real mutations
- `src/domains/sales-invoices/components/peppol-error-panel.tsx` — Wire retry action
- `src/domains/sales-invoices/components/peppol-status-badge.tsx` — Already functional
- `src/app/[locale]/sales-invoices/[id]/page.tsx` — Update mutation calls

### Frontend — New Files
- `src/domains/sales-invoices/components/credit-note-form.tsx` — Credit note creation form
- `src/domains/sales-invoices/components/credit-note-list.tsx` — Linked credit notes display

## Testing with Storecove Sandbox

### Verify receiver exists on test network
```bash
curl -X POST "https://api.storecove.com/api/v2/discovery/receives" \
  -H "Authorization: Bearer $STORECOVE_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "documentTypes": ["invoice"],
    "network": "peppol",
    "metaScheme": "iso6523-actorid-upis",
    "scheme": "de:lwid",
    "identifier": "10101010-STO-10"
  }'
```

### Submit test invoice
```bash
curl -X POST "https://api.storecove.com/api/v2/document_submissions" \
  -H "Authorization: Bearer $STORECOVE_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "legalEntityId": YOUR_LEGAL_ENTITY_ID,
    "routing": {
      "eIdentifiers": [{"scheme": "de:lwid", "identifier": "10101010-STO-10"}]
    },
    "document": {
      "documentType": "invoice",
      "invoiceNumber": "TEST-001",
      "issueDate": "2026-02-20",
      "currencyCode": "SGD",
      "accountingSupplierParty": {
        "party": {"partyName": "Test Sender", "address": {"country": "SG"}}
      },
      "accountingCustomerParty": {
        "party": {"partyName": "Test Buyer", "address": {"country": "SG"}}
      },
      "invoiceLines": [{
        "lineNumber": 1,
        "description": "Test service",
        "quantity": 1,
        "unitCode": "C62",
        "priceAmount": 100.00,
        "lineExtensionAmount": 100.00
      }],
      "taxTotal": 9.00,
      "legalMonetaryTotal": {
        "lineExtensionAmount": 100.00,
        "taxExclusiveAmount": 100.00,
        "taxInclusiveAmount": 109.00,
        "payableAmount": 109.00
      }
    }
  }'
```

## Deployment Checklist

- [ ] Storecove production account created (separate from sandbox)
- [ ] Production API key generated
- [ ] Legal Entity created and approved in production
- [ ] Peppol identifier registered with IMDA
- [ ] Environment variables set in Vercel
- [ ] Webhook URL configured in Storecove (production)
- [ ] Convex schema deployed: `npx convex deploy --yes`
- [ ] `npm run build` passes
- [ ] End-to-end test in Storecove sandbox
