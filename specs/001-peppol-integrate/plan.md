# Implementation Plan: Singapore InvoiceNow (Peppol) Full Integration

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-peppol-integrate/spec.md`

## Summary

Enable end-to-end Peppol InvoiceNow transmission for Singapore e-invoicing compliance. FinanSEAL integrates with Storecove (certified Peppol Access Point) via their JSON REST API — no UBL XML generation needed. The system maps sales invoice and credit note data to Storecove's JSON format, submits via their API, and receives status notifications via webhooks. Includes new credit note creation capability (the app currently only supports invoicing and voiding).

**Key architectural decision**: Storecove accepts structured JSON (not UBL XML). This eliminates the need for a UBL XML generator — Storecove handles Peppol BIS 3.0 document generation, AS4 transport, and network compliance. FinanSEAL's responsibility is data mapping and status tracking.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Manual + Storecove sandbox (automated testing deferred)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js fullstack + Convex backend)
**Performance Goals**: Document generation + submission < 5s; status updates reflected < 5 min
**Constraints**: Storecove API rate limits (standard REST); webhook delivery within 5-day window
**Scale/Scope**: Starter plan: 100 e-invoices/month; Pro/Enterprise: unlimited; ~5 new screens/panels

## Constitution Check

*Constitution file is template (not project-specific) — no specific gates to enforce.*

**Post-design re-check**: Design follows existing codebase patterns:
- API routes follow `/api/v1/` REST pattern with Clerk auth
- Convex mutations follow `requireFinanceAdmin()` authorization pattern
- UI components follow existing Peppol shell + LHDN component patterns
- Credit notes reuse `sales_invoices` table (no new table needed)
- No new infrastructure beyond environment variables

## Project Structure

### Documentation (this feature)

```text
specs/001-peppol-integrate/
├── plan.md              # This file
├── spec.md              # Feature specification (clarified)
├── research.md          # Phase 0: Storecove API, Peppol BIS 3.0, tax mapping research
├── data-model.md        # Phase 1: Entity changes, Storecove data mapping
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/
│   ├── api-contracts.md     # API route contracts (transmit, retry, webhook, discovery)
│   └── storecove-client.md  # Storecove client module contracts
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# New files
src/lib/peppol/
├── storecove-client.ts          # Storecove API client (submit, discover, evidence)
├── invoice-mapper.ts            # SalesInvoice → Storecove JSON mapper
├── webhook-parser.ts            # Storecove webhook event parser
└── types.ts                     # Storecove TypeScript types

src/app/api/v1/
├── sales-invoices/[invoiceId]/peppol/
│   ├── transmit/route.ts        # POST - initiate Peppol transmission
│   └── retry/route.ts           # POST - retry failed transmission
└── peppol/
    ├── webhook/route.ts          # POST - Storecove webhook handler
    └── discovery/route.ts        # GET - verify receiver Peppol ID

src/domains/sales-invoices/components/
├── credit-note-form.tsx          # Credit note creation form (new)
└── credit-note-list.tsx          # Linked credit notes display (new)

# Modified files
convex/schema.ts                  # Add originalInvoiceId, creditNoteReason, index
convex/functions/salesInvoices.ts # Implement Peppol mutations + credit note mutations
convex/functions/einvoiceUsage.ts # Add grace buffer logic

src/domains/sales-invoices/components/
├── peppol-transmission-panel.tsx # Remove "Coming Soon", wire to real mutations
├── peppol-error-panel.tsx        # Wire retry action
└── peppol-status-badge.tsx       # Already functional (no changes needed)

src/domains/sales-invoices/hooks/
└── use-sales-invoices.ts         # Add credit note mutation hooks

src/app/[locale]/sales-invoices/
├── [id]/page.tsx                 # Wire Peppol mutations, add credit note section
└── page.tsx                      # Credit note display in list (if needed)
```

**Structure Decision**: Follows existing Next.js + Convex architecture. New Peppol integration code goes in `src/lib/peppol/` (matching the pattern of `src/lib/aws-s3.ts`, `src/lib/stripe/`). API routes under `/api/v1/`. Domain components under `src/domains/sales-invoices/components/`.

## Implementation Phases

### Phase A: Schema & Foundation (Backend)

**Goal**: Database changes + Storecove client library

1. **Schema changes** (`convex/schema.ts`):
   - Add `originalInvoiceId: v.optional(v.id("sales_invoices"))` to sales_invoices
   - Add `creditNoteReason: v.optional(v.string())` to sales_invoices
   - Add index `by_originalInvoiceId` on `["originalInvoiceId"]`
   - Deploy: `npx convex deploy --yes`

2. **Storecove client** (`src/lib/peppol/`):
   - `types.ts` — Storecove API types (request/response interfaces)
   - `storecove-client.ts` — API client with `submitDocument()`, `discoverReceiver()`, `getEvidence()`
   - `invoice-mapper.ts` — Map SalesInvoice + Business + Customer → Storecove JSON
   - `webhook-parser.ts` — Parse Storecove webhook events
   - Tax category mapping (S/Z/E/O) based on rate + exemption status

3. **Environment variables** — Add to `.env.local` and Vercel

### Phase B: Transmission Pipeline (Backend)

**Goal**: Working end-to-end Peppol transmission

4. **Convex mutations** (`convex/functions/salesInvoices.ts`):
   - Implement `initiatePeppolTransmission` — validate, set pending status
   - Implement `retryPeppolTransmission` — validate failed status, reset to pending
   - Add `updatePeppolStatus` internal mutation — called by webhook handler
   - Add `createCreditNote` mutation — create credit note linked to parent invoice
   - Add `getCreditNotesForInvoice` query
   - Add `getNetOutstandingAmount` query

5. **API routes**:
   - `POST /api/v1/sales-invoices/[invoiceId]/peppol/transmit` — orchestrate: validate → map → submit to Storecove → update Convex
   - `POST /api/v1/sales-invoices/[invoiceId]/peppol/retry` — same flow for retries
   - `POST /api/v1/peppol/webhook` — receive Storecove events, update invoice status
   - `GET /api/v1/peppol/discovery` — verify receiver Peppol ID on network

6. **Usage tracking** (`convex/functions/einvoiceUsage.ts`):
   - Add grace buffer check (planLimit + 5)
   - Integrate with transmit flow

### Phase C: UI Activation (Frontend)

**Goal**: Remove "Coming Soon" labels, wire UI to real backend

7. **Peppol transmission panel** — Remove "Coming Soon" badge, wire `onTransmit` and `onRetry` callbacks to API routes
8. **Peppol error panel** — Wire retry button to retry API route
9. **Invoice detail page** — Update mutation calls, add credit note section
10. **Credit note components**:
    - `credit-note-form.tsx` — Form for creating credit notes (pre-populated from parent invoice)
    - `credit-note-list.tsx` — Display linked credit notes on parent invoice detail
    - "Create Credit Note" button on invoice detail page
11. **Business settings** — Verify Peppol participant ID field is working (already exists)

### Phase D: Polish & Validation

**Goal**: Edge cases, usage limits, build verification

12. **Usage limit UI** — Warning banner when approaching limit, hard block message when exhausted
13. **Edge case handling** — Voided invoice guards, concurrent transmission prevention, credit note amount validation
14. **Build verification** — `npm run build` must pass
15. **Convex deployment** — `npx convex deploy --yes` for any function changes
16. **Manual testing** — End-to-end in Storecove sandbox

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Storecove sandbox approval delay (~1 business day) | Start with unit-testable mapper/client code; mock Storecove responses |
| Singapore-specific Storecove setup ("contact us first") | Reach out to apisupport@storecove.com early |
| Webhook endpoint needs public URL for testing | Use ngrok or similar tunnel during development |
| Credit note UI complexity (new form + validation) | Reuse existing invoice form patterns; keep credit note form simple |
| Storecove webhook payload format not fully documented for failures | Handle gracefully with generic error fallback; refine after testing |
