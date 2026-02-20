# Implementation Plan: Peppol InvoiceNow Transmission UI

**Branch**: `001-peppol-submission-ui` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-peppol-submission-ui/spec.md`
**GitHub Issue**: #205

## Summary

Build the frontend UI for transmitting sales invoices via the Peppol InvoiceNow network (Singapore) and tracking delivery status. This covers: Peppol status badges on the invoice list, a "Send via InvoiceNow" action with confirmation dialog, delivery confirmation display, error panel with retry, and a visual status timeline. All schema fields are already deployed (#203). Two thin Convex mutations handle the initiate/retry actions; actual Peppol API integration is deferred to #196.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, lucide-react (icons)
**Storage**: Convex (document database with real-time subscriptions) — schema already deployed
**Testing**: Manual testing (no automated test framework in current project setup)
**Target Platform**: Web (responsive — desktop 1024px+ and mobile 320px+)
**Project Type**: Web application (Next.js frontend + Convex backend)
**Performance Goals**: Peppol status visible within 2s on list page; transmission initiated in ≤3 clicks
**Constraints**: UI-only scope; no Peppol Access Point API calls; mutations set status to "pending" only
**Scale/Scope**: 4 new files, 4 modified files, ~500 lines of new code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project-specific constitution defined (`.specify/memory/constitution.md` contains only template placeholders). Using `CLAUDE.md` project guidelines as the governance reference:

| CLAUDE.md Rule | Status | Notes |
|----------------|--------|-------|
| Use semantic tokens, never hardcode colors | PASS | Badge colors follow existing `InvoiceStatusBadge` pattern with `bg-{color}-500/10` |
| Action buttons: `bg-primary` styling | PASS | "Send via InvoiceNow" uses primary styling |
| Use `formatBusinessDate` for dates | PASS | Timeline timestamps use existing utility |
| Use `PEPPOL_STATUSES` constants | PASS | FR-013 requires it explicitly |
| `npx convex deploy --yes` after Convex changes | PASS | Mutation additions require deploy |
| Prefer modification over creation | PASS | 4 modified files, 4 new (justified — new components) |
| No hardcoded colors | PASS | All colors use existing badge pattern conventions |
| `npm run build` must pass | PASS | Build verification is final step |

**Post-Phase 1 re-check**: PASS — design creates no new abstractions, repositories, or architectural patterns. All components follow established codebase conventions.

## Project Structure

### Documentation (this feature)

```text
specs/001-peppol-submission-ui/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: decisions & codebase patterns
├── data-model.md        # Phase 1: entity/field mapping
├── quickstart.md        # Phase 1: setup & implementation order
├── contracts/
│   ├── convex-mutations.md  # Phase 1: mutation signatures & contracts
│   └── ui-components.md     # Phase 1: component interfaces & rendering rules
├── checklists/
│   └── requirements.md      # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# New files (4)
src/components/ui/status-timeline.tsx                              # Reusable timeline (Peppol + LHDN)
src/domains/sales-invoices/components/peppol-status-badge.tsx      # Peppol status badge
src/domains/sales-invoices/components/peppol-transmission-panel.tsx # Composite Peppol section
src/domains/sales-invoices/components/peppol-error-panel.tsx       # Error display + retry

# Modified files (4)
convex/functions/salesInvoices.ts                                  # +2 mutations
src/domains/sales-invoices/hooks/use-sales-invoices.ts             # +2 mutation hooks
src/domains/sales-invoices/components/sales-invoice-list.tsx       # +badge in list
src/app/[locale]/sales-invoices/[id]/page.tsx                      # +panel in detail
```

**Structure Decision**: This feature extends the existing domain structure. New components live in `src/domains/sales-invoices/components/` (domain-specific) and `src/components/ui/` (reusable timeline). Convex mutations are added to the existing `salesInvoices.ts` module. No new directories or architectural patterns introduced.

## Implementation Phases

### Phase A: Backend (Convex Mutations)

**Goal**: Create the two mutations the UI will call.

**File**: `convex/functions/salesInvoices.ts`

1. **`initiatePeppolTransmission`** mutation
   - Args: `{ id: Id<"sales_invoices">, businessId: Id<"businesses"> }`
   - Auth: `requireFinanceAdmin(ctx, args.businessId)`
   - Validates: invoice exists + not deleted, status ≠ draft/void, peppolStatus is undefined, business has peppolParticipantId, customer has peppolParticipantId
   - Sets: `peppolStatus: "pending"`, `updatedAt: Date.now()`

2. **`retryPeppolTransmission`** mutation
   - Args: same
   - Validates: peppolStatus === "failed"
   - Sets: `peppolStatus: "pending"`, clears `peppolErrors`, `updatedAt: Date.now()`

**Deploy**: `npx convex deploy --yes` after mutation changes.

See: [contracts/convex-mutations.md](./contracts/convex-mutations.md) for full signatures and error messages.

### Phase B: Foundational UI Components

**Goal**: Build the reusable building blocks.

1. **`PeppolStatusBadge`** (`src/domains/sales-invoices/components/peppol-status-badge.tsx`)
   - Status config map: pending→gray, transmitted→blue, delivered→green, failed→red
   - Uses `Badge` from `@/components/ui/badge` with custom className overrides
   - Follows exact pattern of `invoice-status-badge.tsx`

2. **`StatusTimeline`** (`src/components/ui/status-timeline.tsx`)
   - Generic component accepting `TimelineStep[]` (label, timestamp?, status)
   - Renders vertical stepper with circles + connecting lines
   - Step states: completed (green), current (blue pulse), upcoming (gray dashed), failed (red)
   - Timestamps formatted with `formatBusinessDate`
   - Responsive: works in sidebar width on desktop, full-width on mobile

3. **`PeppolErrorPanel`** (`src/domains/sales-invoices/components/peppol-error-panel.tsx`)
   - Card with `border-destructive bg-destructive/5` styling
   - Lists each error: code (monospace) + message
   - "Retry transmission" button with loading state
   - Generic "Transmission failed" message if no errors array

See: [contracts/ui-components.md](./contracts/ui-components.md) for full interfaces.

### Phase C: Composite Panel Component

**Goal**: Build the main Peppol section that ties everything together.

1. **`PeppolTransmissionPanel`** (`src/domains/sales-invoices/components/peppol-transmission-panel.tsx`)
   - Props: invoice, customerPeppolId?, businessPeppolId?
   - State machine rendering:
     - No peppolStatus + eligible → "Send via InvoiceNow" button
     - No peppolStatus + not eligible → render nothing
     - pending → Timeline + "in progress" message
     - transmitted → Timeline (2 steps done)
     - delivered → Timeline (all done) + delivery confirmation card
     - failed → Timeline (with failed step) + PeppolErrorPanel
   - "Send via InvoiceNow" button opens `ConfirmationDialog` showing receiver's Peppol ID
   - Calls `initiatePeppolTransmission` mutation on confirm
   - Calls `retryPeppolTransmission` mutation on retry
   - Loading states for both actions

### Phase D: Integration into Existing Pages

**Goal**: Wire the new components into the existing list and detail views.

1. **Invoice List** (`src/domains/sales-invoices/components/sales-invoice-list.tsx`)
   - Desktop table: In the Status column cell, after `<InvoiceStatusBadge>`, conditionally render `<PeppolStatusBadge>` when `invoice.peppolStatus` is defined
   - Mobile card: In the header row, after `<InvoiceStatusBadge>`, conditionally render `<PeppolStatusBadge>`
   - No data fetching changes — Peppol fields already returned by `list` query

2. **Invoice Detail** (`src/app/[locale]/sales-invoices/[id]/page.tsx`)
   - Add `PeppolTransmissionPanel` to the sidebar, between "Invoice Details" card and "Payment History"
   - Fetch customer record using `invoice.customerId` to get `peppolParticipantId`
   - Pass business `peppolParticipantId` from `useActiveBusiness()` context
   - Add mutation hooks from `useSalesInvoiceMutations()`

3. **Hooks** (`src/domains/sales-invoices/hooks/use-sales-invoices.ts`)
   - Add `initiatePeppol` and `retryPeppol` to `useSalesInvoiceMutations()` return

### Phase E: Build Verification

1. `npm run build` — must pass with zero errors
2. `npx convex deploy --yes` — deploy mutations to production
3. Manual smoke test per quickstart.md steps

## Complexity Tracking

No constitution violations to justify. All changes follow established patterns:
- Badge component mirrors existing `InvoiceStatusBadge`
- Mutations follow existing `send`/`voidInvoice` patterns
- Detail page sidebar addition follows existing "Invoice Details" + "Payment History" layout
- Only new architectural element is `StatusTimeline` in `src/components/ui/`, justified by reuse across Peppol and LHDN (#204)
