# Implementation Plan: Credit/Debit Note Support (E-Invoice, AR & AP)

**Branch**: `032-credit-debit-note` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/032-credit-debit-note/spec.md`

## Summary

Add complete credit/debit note support across AR (sales invoices) and AP (supplier invoices), with LHDN e-invoice submission for all 6 adjustment document types (02, 03, 04, 12, 13, 14). AR credit notes are partially built (schema + mutation + UI exist); this plan adds AR debit notes, all AP credit/debit notes, self-bill mapper extensions, and the LHDN BillingReference integration.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Convex 1.31.3, Node.js 20 Lambda)
**Primary Dependencies**: Convex (DB + real-time), LHDN API (e-invoice), AWS Lambda (digital signature), React 19.1.2
**Storage**: Convex (`sales_invoices`, `invoices`, `journal_entries`, `journal_entry_lines` tables)
**Testing**: Manual UAT + `npm run build` pass
**Target Platform**: Web (Vercel deployment)
**Project Type**: Web application (Next.js + Convex backend)
**Performance Goals**: Credit note creation < 2s, LHDN submission reuses existing pipeline latency
**Constraints**: Convex 2GB bandwidth limit (use actions, not reactive queries for aggregations)
**Scale/Scope**: ~100 businesses, ~1000 invoices/month, ~50 credit/debit notes/month

## Constitution Check

*No project constitution defined — template only. No gates to enforce.*

## Project Structure

### Documentation (this feature)

```text
specs/032-credit-debit-note/
├── plan.md              # This file
├── research.md          # Phase 0: Codebase analysis
├── data-model.md        # Phase 1: Schema changes
├── quickstart.md        # Phase 1: Dev setup guide
├── contracts/           # Phase 1: API contracts
│   ├── ar-credit-debit.md
│   └── ap-credit-debit.md
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
# Convex backend (mutations, queries, schema)
convex/
├── schema.ts                           # Schema changes for invoices table
├── functions/salesInvoices.ts          # AR debit note mutation + queries
├── functions/invoices.ts               # AP credit/debit note mutations + queries
└── lib/journal-entry-helpers.ts        # New helper: createCreditNoteJournalEntry, createDebitNoteJournalEntry

# LHDN mappers
src/lib/lhdn/
├── invoice-mapper.ts                   # BillingReference with LHDN UUID (not just invoice number)
├── self-bill-mapper.ts                 # Extend for Types 12, 13, 14

# AR UI (sales invoices domain)
src/domains/sales-invoices/components/
├── credit-note-form.tsx                # EXISTS — minor updates
├── credit-note-list.tsx                # EXISTS — add debit notes
├── debit-note-form.tsx                 # NEW
└── invoice-detail-adjustments.tsx      # NEW — unified adjustments section

# AP UI (invoices domain)
src/domains/invoices/components/
├── ap-credit-note-form.tsx             # NEW
├── ap-debit-note-form.tsx              # NEW
└── ap-adjustments-section.tsx          # NEW

# API routes
src/app/api/v1/
├── sales-invoices/[invoiceId]/lhdn/submit/route.ts  # EXISTS — update BillingReference
└── invoices/[invoiceId]/lhdn/self-bill/route.ts      # EXISTS — extend for Types 12/13
```

**Structure Decision**: Follows existing domain-driven design. AR changes in `sales-invoices` domain, AP changes in `invoices` domain. Shared LHDN logic in `src/lib/lhdn/`. No new domains or routes needed.

## Implementation Phases

### Phase 1: AR Debit Notes + Schema Foundation (P1/P2)
- Add `createDebitNote` mutation to salesInvoices.ts (mirror createCreditNote)
- Add debit note journal entry helper
- Update `getNetOutstandingAmount` to include debit notes
- Create debit-note-form.tsx UI component
- Update credit-note-list.tsx → adjustments-list.tsx (show both types)

### Phase 2: AP Credit/Debit Notes — Schema + Backend (P1)
- Add `einvoiceType`, `originalInvoiceId`, `creditNoteReason` fields to invoices schema
- Add `by_originalInvoiceId` index to invoices table
- Create AP `createCreditNote` and `createDebitNote` mutations
- Create AP journal entry reversal helpers
- Create AP `getCreditDebitNotesForInvoice` and `getNetPayableAmount` queries

### Phase 3: AP Credit/Debit Notes — UI (P1)
- Create ap-credit-note-form.tsx
- Create ap-debit-note-form.tsx
- Create ap-adjustments-section.tsx
- Add "Create Credit/Debit Note" buttons to AP invoice detail view

### Phase 4: LHDN E-Invoice Submission (P1)
- Update invoice-mapper.ts BillingReference to use LHDN UUID
- Extend self-bill-mapper.ts for Types 12, 13, 14
- Update AR submission route for credit/debit note validation
- Update AP self-bill route for Types 12/13
- Add FR-015 guard: block submission if original has no LHDN UUID

### Phase 5: Polish + Reporting (P2/P3)
- Invoice list badges for credit/debit notes
- Adjustments section on invoice detail views
- AR/AP aging report adjustments
- How It Works drawer content

## Complexity Tracking

No constitution violations — no complexity tracking needed.
