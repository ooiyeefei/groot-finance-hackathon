# Quickstart: LHDN e-Invoice Submission Pipeline

**Feature Branch**: `001-lhdn-einvoice-submission`

## Prerequisites

1. LHDN sandbox credentials (Client ID + Client Secret) stored in environment
2. Digital certificate deployed to SSM Parameter Store (per `specs/001-digital-signature-infra`)
3. Digital signature Lambda deployed (per `infra/lib/digital-signature-stack.ts`)
4. Business with LHDN settings configured (TIN, BRN, MSIC code)

## Environment Variables

```env
# LHDN MyInvois API (add to .env.local)
LHDN_CLIENT_ID=<platform intermediary client ID>
LHDN_CLIENT_SECRET=<platform intermediary client secret>
LHDN_API_URL=https://preprod-api.myinvois.hasil.gov.my  # sandbox
LHDN_ENVIRONMENT=sandbox  # or "production"

# Digital Signature Lambda (already configured)
DIGITAL_SIGNATURE_FUNCTION_NAME=finanseal-digital-signature
```

## New File Structure

```
src/lib/lhdn/
├── client.ts           # LHDN MyInvois API client (auth, submit, poll, cancel)
├── invoice-mapper.ts   # FinanSEAL data → UBL 2.1 JSON mapper
├── self-bill-mapper.ts # Expense claim/AP invoice → self-billed UBL 2.1 JSON
├── types.ts            # LHDN API request/response types
├── decimal.ts          # LHDN decimal formatting utility
└── constants.ts        # Document type codes, TIN constants, API paths

src/app/api/v1/
├── sales-invoices/
│   ├── [invoiceId]/lhdn/
│   │   ├── submit/route.ts     # POST — submit single invoice
│   │   └── cancel/route.ts     # PUT — cancel validated invoice
│   └── batch/lhdn/
│       └── submit/route.ts     # POST — batch submit
├── expense-claims/
│   └── [claimId]/lhdn/
│       └── self-bill/route.ts  # POST — self-bill from expense claim
└── invoices/
    └── [invoiceId]/lhdn/
        └── self-bill/route.ts  # POST — self-bill from AP invoice

convex/functions/
├── lhdnTokens.ts               # Token cache mutations
├── lhdnJobs.ts                 # Submission job tracking + polling scheduler
└── (modified) salesInvoices.ts  # Add LHDN mutations
└── (modified) expenseClaims.ts  # Add self-bill mutations
└── (modified) notifications.ts  # Add LHDN notification types
```

## Build Sequence

### Step 1: Schema Changes
Add fields to `convex/schema.ts`:
- `expense_claims`: LHDN tracking fields + `selfBillRequired` + `receiptQrCodeDetected`
- `invoices` (AP): LHDN tracking fields
- `vendors`: `isLhdnExempt` flag
- `customers`: `isLhdnExempt` flag
- `businesses`: `autoSelfBillExemptVendors` setting
- New table: `lhdn_tokens`
- New table: `lhdn_submission_jobs`

Deploy: `npx convex deploy --yes`

### Step 2: LHDN Library (`src/lib/lhdn/`)
1. `types.ts` — LHDN API types (UBL document, submission response, etc.)
2. `constants.ts` — Document type codes, general TIN, API paths
3. `decimal.ts` — Decimal formatting utility (GitHub #218)
4. `client.ts` — OAuth auth (with `onbehalfof`), submit, poll, cancel
5. `invoice-mapper.ts` — Sales invoice → UBL 2.1 JSON (with namespace prefixes)
6. `self-bill-mapper.ts` — Expense claim / AP invoice → self-billed UBL 2.1 JSON

### Step 3: Convex Backend Functions
1. `lhdnTokens.ts` — Token cache (getOrRefresh)
2. `lhdnJobs.ts` — Job tracking + scheduled polling function
3. Add LHDN mutations to `salesInvoices.ts` (initiate, update status, cancel)
4. Add self-bill mutations to `expenseClaims.ts` and `invoices.ts`
5. Add LHDN notification types to `notifications.ts`

Deploy: `npx convex deploy --yes`

### Step 4: API Routes
1. `POST /api/v1/sales-invoices/[id]/lhdn/submit` — single submission
2. `POST /api/v1/sales-invoices/batch/lhdn/submit` — batch submission
3. `PUT /api/v1/sales-invoices/[id]/lhdn/cancel` — cancellation
4. `POST /api/v1/expense-claims/[id]/lhdn/self-bill` — self-bill from expense claim
5. `POST /api/v1/invoices/[id]/lhdn/self-bill` — self-bill from AP invoice

### Step 5: UI Integration
1. Wire up existing LHDN submit button (replace "Coming Soon" placeholder)
2. Add self-bill prompt on expense claim detail (when no QR / exempt vendor)
3. Add self-bill prompt on AP invoice detail (when exempt vendor)
4. Add cancel button on validated invoices (within 72-hour window)
5. Wire up QR code component to display after validation
6. Add batch submit action on invoice list

### Step 6: Testing
1. Test against LHDN sandbox environment
2. Verify UBL document format passes LHDN structure validator
3. Verify digital signature passes LHDN signature validator
4. Test polling + retry logic
5. Test self-billing from expense claims and AP invoices
6. Test 72-hour cancellation window enforcement

## Testing with Sandbox

```bash
# LHDN Sandbox
LHDN_API_URL=https://preprod-api.myinvois.hasil.gov.my

# Use sandbox credentials (separate from production)
LHDN_CLIENT_ID=<sandbox client ID>
LHDN_CLIENT_SECRET=<sandbox client secret>
LHDN_ENVIRONMENT=sandbox
```

## Key Patterns to Follow

- **Peppol flow** (`src/lib/peppol/`) — mirror the client/mapper/types structure
- **Mutation ordering**: Validate → Record Usage → Sign → Submit → Poll → Update
- **Error handling**: Custom `LhdnApiError` class, store errors as `[{code, message, target}]`
- **Auth check**: `requireFinanceAdmin(ctx, businessId)` on all mutations
- **Build check**: `npm run build` must pass before completion
- **Convex deploy**: `npx convex deploy --yes` after any schema/function changes
