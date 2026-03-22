# Quickstart: Credit/Debit Note Development

## Prerequisites
- Node.js 20+, npm
- Convex CLI (`npx convex`)
- Access to Convex deployment `kindhearted-lynx-129`

## Setup
```bash
git checkout 032-credit-debit-note
npm install
```

## Development
```bash
# Start Next.js dev server (DO NOT run convex dev from worktrees)
npm run dev

# After Convex schema/function changes, deploy to prod:
npx convex deploy --yes
```

## Key Files to Modify

### Backend (Convex)
1. `convex/schema.ts` — Add AP credit/debit note fields to invoices table
2. `convex/functions/salesInvoices.ts` — Add `createDebitNote` mutation
3. `convex/functions/invoices.ts` — Add `createCreditNote`, `createDebitNote` mutations
4. `convex/lib/journal-entry-helpers.ts` — Add credit/debit note JE helpers

### LHDN Mappers
5. `src/lib/lhdn/invoice-mapper.ts` — Update BillingReference to use LHDN UUID
6. `src/lib/lhdn/self-bill-mapper.ts` — Extend for Types 12, 13, 14

### Frontend (React)
7. `src/domains/sales-invoices/components/debit-note-form.tsx` — New
8. `src/domains/invoices/components/ap-credit-note-form.tsx` — New
9. `src/domains/invoices/components/ap-debit-note-form.tsx` — New

### API Routes
10. `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/submit/route.ts` — Update
11. `src/app/api/v1/invoices/[invoiceId]/lhdn/self-bill/route.ts` — Extend

## Testing
```bash
npm run build  # Must pass before completion

# UAT: Use test credentials from .env.local
# Admin: yeefei+test2@hellogroot.com
# Create sales invoice → create credit note → verify balance → submit to LHDN
```

## Convex Deployment
```bash
# MANDATORY after any Convex changes
npx convex deploy --yes

# Kill stray convex processes first
ps aux | grep convex | grep -v grep
```
