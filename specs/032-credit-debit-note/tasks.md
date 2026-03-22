# Tasks: Credit/Debit Note Support (032)

**Branch**: `032-credit-debit-note`
**Generated**: 2026-03-22
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Task 1: AP Schema — Add credit/debit note fields to invoices table
- **Status**: pending
- **Priority**: P1
- **Files**: `convex/schema.ts`
- **Description**: Add `einvoiceType`, `originalInvoiceId`, `creditNoteReason` fields and `by_originalInvoiceId` index to `invoices` table. All fields optional for backward compatibility.
- **Acceptance**: Schema deploys successfully. Existing invoices unaffected.
- **Dependencies**: None

## Task 2: AR Backend — Create `createDebitNote` mutation
- **Status**: pending
- **Priority**: P1
- **Files**: `convex/functions/salesInvoices.ts`, `convex/lib/journal-entry-helpers.ts`
- **Description**: Add `createDebitNote` mutation mirroring `createCreditNote`. Number format: `DN-{invoiceNumber}-{seq}`. Journal entry: Dr. AR 1200, Cr. Revenue 4100. Update `getNetOutstandingAmount` to include debit notes. Rename `getCreditNotesForInvoice` → `getAdjustmentsForInvoice` (return both credit and debit notes).
- **Acceptance**: Can create debit note from existing sales invoice. Net outstanding includes debits. Journal entry is balanced.
- **Dependencies**: None

## Task 3: AP Backend — Create `createCreditNote` and `createDebitNote` mutations
- **Status**: pending
- **Priority**: P1
- **Files**: `convex/functions/invoices.ts`, `convex/lib/journal-entry-helpers.ts`
- **Description**: Add AP credit note mutation (Dr. AP 2100, Cr. Expense) and debit note mutation (Dr. Expense, Cr. AP 2100). Add `getAdjustmentsForInvoice` and `getNetPayableAmount` queries. Validate: parent status ∈ {completed, paid, partially_paid}, credit total ≤ original amount.
- **Acceptance**: Can create AP credit/debit notes. Balance calculations correct. Journal entries balanced.
- **Dependencies**: Task 1

## Task 4: LHDN Mapper — BillingReference with UUID + self-bill Types 12/13
- **Status**: pending
- **Priority**: P1
- **Files**: `src/lib/lhdn/invoice-mapper.ts`, `src/lib/lhdn/self-bill-mapper.ts`
- **Description**: Update invoice-mapper.ts BillingReference to use `lhdnDocumentUuid` from original invoice. Extend self-bill-mapper.ts to accept `einvoiceType` parameter and generate Types 12, 13, 14 via `mapEinvoiceTypeToDocumentType(type, isSelfBilled: true)`. Add BillingReference section to self-bill UBL output.
- **Acceptance**: Generated UBL for credit note has Type 02/12, debit note has Type 03/13. BillingReference contains original UUID.
- **Dependencies**: None

## Task 5: LHDN Submission Routes — Credit/debit note guards
- **Status**: pending
- **Priority**: P1
- **Files**: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/submit/route.ts`, `src/app/api/v1/invoices/[invoiceId]/lhdn/self-bill/route.ts`
- **Description**: Add FR-015 guard: if credit/debit note's original invoice has no `lhdnDocumentUuid`, reject with clear error. Ensure original invoice's UUID is passed to mapper for BillingReference. Update self-bill route to handle Types 12/13.
- **Acceptance**: Submitting credit note for non-LHDN invoice shows error. Credit note for LHDN-validated invoice submits successfully with correct type code.
- **Dependencies**: Task 4

## Task 6: AR UI — Debit note form + unified adjustments section
- **Status**: pending
- **Priority**: P2
- **Files**: `src/domains/sales-invoices/components/debit-note-form.tsx` (new), `src/domains/sales-invoices/components/credit-note-list.tsx` (update)
- **Description**: Create debit-note-form.tsx mirroring credit-note-form.tsx but for additional charges (no max amount cap). Update credit-note-list.tsx to show both credit and debit notes with appropriate badges. Add "Create Debit Note" button next to existing "Create Credit Note" on invoice detail.
- **Acceptance**: Debit note form opens from invoice detail. Shows line items editor. Creates debit note. Adjustments list shows both types with CN/DN badges.
- **Dependencies**: Task 2

## Task 7: AP UI — Credit/debit note forms + adjustments section
- **Status**: pending
- **Priority**: P2
- **Files**: `src/domains/invoices/components/ap-credit-note-form.tsx` (new), `src/domains/invoices/components/ap-debit-note-form.tsx` (new), `src/domains/invoices/components/ap-adjustments-section.tsx` (new)
- **Description**: Create AP credit note form (pre-populated from original invoice, max amount validation). Create AP debit note form. Create adjustments section component showing linked notes with net payable calculation. Add buttons to AP invoice detail view.
- **Acceptance**: Can create AP credit/debit notes from invoice detail. Adjustments section shows correctly. Net payable is accurate.
- **Dependencies**: Task 3

## Task 8: Invoice list badges + detail view adjustments
- **Status**: pending
- **Priority**: P2
- **Files**: `src/domains/sales-invoices/components/`, `src/domains/invoices/components/`
- **Description**: Add visual badges (CN/DN icons) to invoice list views for credit/debit notes. Add "Adjustments" section to both AR and AP invoice detail views showing all linked notes, amounts, dates, LHDN status, and net balance.
- **Acceptance**: Credit/debit notes are visually distinguished in lists. Detail view shows adjustment history with correct net balance.
- **Dependencies**: Tasks 6, 7

## Task 9: Convex deploy + build verification
- **Status**: pending
- **Priority**: P1
- **Files**: N/A
- **Description**: Run `npx convex deploy --yes` for schema and function changes. Run `npm run build` to verify no build errors. Fix any type errors or missing imports.
- **Acceptance**: Convex deploy succeeds. `npm run build` passes with zero errors.
- **Dependencies**: Tasks 1-8
