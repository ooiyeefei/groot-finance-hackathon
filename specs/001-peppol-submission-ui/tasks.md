# Tasks: Peppol InvoiceNow Transmission UI

**Input**: Design documents from `/specs/001-peppol-submission-ui/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/
**GitHub Issue**: #205

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Convex Mutations + Shared Components)

**Purpose**: Backend mutations and core UI components that multiple user stories depend on

**⚠️ CRITICAL**: No user story work can begin until T001–T005 are complete

- [X] T001 Create `initiatePeppolTransmission` mutation in `convex/functions/salesInvoices.ts` — args: `{id, businessId}`, auth via `requireFinanceAdmin`, validate invoice status ≠ draft/void, peppolStatus is undefined, business + customer have peppolParticipantId; set peppolStatus to "pending" + updatedAt. Follow existing `send` mutation pattern. See `specs/001-peppol-submission-ui/contracts/convex-mutations.md` for full contract.
- [X] T002 Create `retryPeppolTransmission` mutation in `convex/functions/salesInvoices.ts` — args: `{id, businessId}`, auth via `requireFinanceAdmin`, validate peppolStatus === "failed"; set peppolStatus to "pending", clear peppolErrors, set updatedAt. See `specs/001-peppol-submission-ui/contracts/convex-mutations.md` for full contract.
- [X] T003 Deploy Convex changes with `npx convex deploy --yes` to generate updated API types
- [X] T004 Add Peppol mutation hooks to `useSalesInvoiceMutations()` in `src/domains/sales-invoices/hooks/use-sales-invoices.ts` — add `initiatePeppol: useMutation(api.functions.salesInvoices.initiatePeppolTransmission)` and `retryPeppol: useMutation(api.functions.salesInvoices.retryPeppolTransmission)` to the return object
- [X] T005 [P] Create `PeppolStatusBadge` component in `src/domains/sales-invoices/components/peppol-status-badge.tsx` — mirror `invoice-status-badge.tsx` pattern with status config map: pending→gray (`bg-muted text-muted-foreground border border-border`), transmitted→blue, delivered→green, failed→red. Use `Badge` from `@/components/ui/badge`. Import `PeppolStatus` type and `PEPPOL_STATUSES` constants. See `specs/001-peppol-submission-ui/contracts/ui-components.md` for color mapping.

**Checkpoint**: Mutations deployed, hooks wired, badge component ready — user story implementation can now begin

---

## Phase 2: User Story 1 — Peppol Status Visibility on Invoice List (Priority: P1) 🎯 MVP

**Goal**: Business owners see Peppol transmission status at a glance on the invoice list via color-coded badges

**Independent Test**: View sales invoices list with a mix of invoices (some with peppolStatus set via Convex dashboard, some without). Verify badges render with correct colors. Invoices without peppolStatus show no Peppol badge.

### Implementation for User Story 1

- [X] T006 [US1] Add PeppolStatusBadge to desktop table rows in `src/domains/sales-invoices/components/sales-invoice-list.tsx` — in the Status column cell (currently renders `<InvoiceStatusBadge>`), conditionally render `<PeppolStatusBadge status={invoice.peppolStatus} />` after the existing badge when `invoice.peppolStatus` is defined. Add a small gap between badges (e.g., `gap-1.5` flex wrapper).
- [X] T007 [US1] Add PeppolStatusBadge to mobile card view in `src/domains/sales-invoices/components/sales-invoice-list.tsx` — in the mobile card header row (where `<InvoiceStatusBadge>` is positioned top-right), conditionally render `<PeppolStatusBadge>` adjacent to the existing badge when `invoice.peppolStatus` is defined. Wrap both badges in a flex container with `gap-1.5`.

**Checkpoint**: Invoice list shows Peppol badges — US1 is fully functional and independently testable

---

## Phase 3: User Story 2 — Transmit Invoice via InvoiceNow (Priority: P1)

**Goal**: Business owners can initiate Peppol InvoiceNow transmission from the invoice detail page with a confirmation dialog

**Independent Test**: Navigate to a sent invoice whose customer has `peppolParticipantId` set and whose business has `peppolParticipantId` set. "Send via InvoiceNow" button appears. Click → confirmation dialog shows receiver's Peppol ID. Confirm → invoice peppolStatus changes to "pending". Button is replaced with status display.

### Implementation for User Story 2

- [X] T008 [US2] Create `PeppolTransmissionPanel` component in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — props: `{invoice, customerPeppolId?, businessPeppolId?}`. Render state machine: (1) no peppolStatus + eligible (both IDs present, invoice not draft/void) → "Send via InvoiceNow" primary button; (2) no peppolStatus + not eligible → render nothing; (3) peppolStatus === "pending" → Card showing "Transmission in progress" with PeppolStatusBadge; (4) peppolStatus === "transmitted" → Card showing "Awaiting delivery confirmation" with badge. Use `ConfirmationDialog` from `@/components/ui/confirmation-dialog` for send confirmation — title: "Send via InvoiceNow", message includes receiver's Peppol participant ID. Call `initiatePeppolTransmission` mutation on confirm with loading state. See `specs/001-peppol-submission-ui/contracts/ui-components.md` for full state machine.
- [X] T009 [US2] Wire PeppolTransmissionPanel into invoice detail page in `src/app/[locale]/sales-invoices/[id]/page.tsx` — add panel to sidebar between "Invoice Details" card and "Payment History". Fetch customer record using `invoice.customerId` via `useQuery(api.functions.customers.getById, ...)` to get `peppolParticipantId`. Get business `peppolParticipantId` from `useActiveBusiness()` context. Pass both IDs + invoice to `PeppolTransmissionPanel`. Import and use Peppol mutation hooks from `useSalesInvoiceMutations()`.

**Checkpoint**: Users can transmit invoices via InvoiceNow — US2 is fully functional and independently testable

---

## Phase 4: User Story 3 — Delivery Confirmation (Priority: P2)

**Goal**: Business owners see clear delivery confirmation with timestamp when a buyer's system acknowledges receipt

**Independent Test**: Manually set `peppolStatus` to "delivered" and `peppolDeliveredAt` to a timestamp via Convex dashboard. Open invoice detail → delivery confirmation card appears with formatted timestamp.

### Implementation for User Story 3

- [X] T010 [US3] Add delivery confirmation rendering to `PeppolTransmissionPanel` in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — when `peppolStatus === "delivered"`, render a Card with `bg-green-500/5 border-green-500/20` styling showing: PeppolStatusBadge (delivered), "Invoice delivered to buyer" message, formatted delivery timestamp using `formatBusinessDate` from `@/lib/utils`. Display `peppolDeliveredAt` as the delivery time and `peppolTransmittedAt` as the transmission time.

**Checkpoint**: Delivery confirmation displays correctly — US3 is functional

---

## Phase 5: User Story 4 — Error Display & Retry (Priority: P2)

**Goal**: Business owners see transmission error details and can retry failed transmissions

**Independent Test**: Manually set `peppolStatus` to "failed" and `peppolErrors` to `[{code: "PEPPOL-001", message: "Receiver not found"}]` via Convex dashboard. Open invoice detail → error panel shows error code + message + retry button. Click retry → status resets to "pending".

### Implementation for User Story 4

- [X] T011 [P] [US4] Create `PeppolErrorPanel` component in `src/domains/sales-invoices/components/peppol-error-panel.tsx` — props: `{errors: Array<{code, message}>, onRetry: () => void, isRetrying: boolean}`. Card with `border-destructive bg-destructive/5` styling. Map errors to list items showing code (monospace `font-mono text-xs`) + message. If errors array is empty, show generic "Transmission failed" message. "Retry transmission" button with primary styling, `Loader2` spinner when `isRetrying`. See `specs/001-peppol-submission-ui/contracts/ui-components.md`.
- [X] T012 [US4] Add failed state rendering to `PeppolTransmissionPanel` in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — when `peppolStatus === "failed"`, render PeppolStatusBadge (failed) + `PeppolErrorPanel` with errors from `invoice.peppolErrors`. Wire onRetry to call `retryPeppolTransmission` mutation with `{id: invoice._id, businessId: invoice.businessId}`. Manage `isRetrying` loading state. Show `ConfirmationDialog` before retry — title: "Retry Peppol Transmission", message: "This will re-initiate the transmission. Continue?".

**Checkpoint**: Error display and retry works — US4 is functional

---

## Phase 6: User Story 5 — Peppol Status Timeline (Priority: P3)

**Goal**: Visual timeline showing the Peppol transmission lifecycle with timestamps for each completed stage

**Independent Test**: View invoices at each Peppol lifecycle stage. Timeline highlights correct steps with timestamps: pending (Created ✓), transmitted (Created ✓ + Transmitted ✓), delivered (all ✓), failed (Created ✓ + Failed ✗).

### Implementation for User Story 5

- [X] T013 [P] [US5] Create reusable `StatusTimeline` component in `src/components/ui/status-timeline.tsx` — interface: `TimelineStep {label: string, timestamp?: number, status: 'completed' | 'current' | 'upcoming' | 'failed'}`, props: `{steps: TimelineStep[], className?: string}`. Render vertical stepper: completed = green circle + solid line + timestamp via `formatBusinessDate`; current = blue pulsing circle; upcoming = gray circle + dashed line; failed = red circle with X icon. Responsive (works in sidebar width). Use semantic tokens per `src/components/ui/CLAUDE.md`. Design for reuse by LHDN timeline (#204).
- [X] T014 [US5] Integrate `StatusTimeline` into `PeppolTransmissionPanel` in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — build `TimelineStep[]` from invoice Peppol fields: Step 1 "Created" (completed when any peppolStatus exists), Step 2 "Transmitted" (completed if peppolTransmittedAt set, current if status=pending), Step 3 "Delivered" (completed if peppolDeliveredAt set) OR "Failed" (failed status if peppolStatus=failed). Render `StatusTimeline` in all states where peppolStatus is defined (pending, transmitted, delivered, failed). Place above the status-specific content (delivery card, error panel, or in-progress message).

**Checkpoint**: Timeline displays across all Peppol states — US5 is functional, all user stories complete

---

## Phase 7: Polish & Verification

**Purpose**: Build verification and final deployment

- [X] T015 Run `npm run build` and fix any TypeScript or build errors
- [X] T016 Deploy Convex to production with `npx convex deploy --yes`
- [X] T017 Run manual smoke test per `specs/001-peppol-submission-ui/quickstart.md` steps 1–9

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on T005 (PeppolStatusBadge) — can start as soon as badge is ready
- **US2 (Phase 3)**: Depends on T003 (Convex deploy), T004 (hooks) — needs mutations available
- **US3 (Phase 4)**: Depends on T008 (PeppolTransmissionPanel exists) — extends the panel
- **US4 (Phase 5)**: Depends on T008 (PeppolTransmissionPanel exists) — extends the panel
- **US5 (Phase 6)**: Can start T013 (StatusTimeline) in parallel with any phase; T014 depends on T008
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent — only needs PeppolStatusBadge from Foundational
- **US2 (P1)**: Independent — needs mutations + hooks from Foundational
- **US3 (P2)**: Depends on US2's PeppolTransmissionPanel component existing
- **US4 (P2)**: Depends on US2's PeppolTransmissionPanel component existing
- **US5 (P3)**: StatusTimeline (T013) is independent; integration (T014) depends on US2's panel

### Parallel Opportunities

- T005 (PeppolStatusBadge) can run in parallel with T001–T003 (mutations)
- T006 + T007 (US1 list integration) can run in parallel with T008–T009 (US2 panel) once dependencies met
- T011 (PeppolErrorPanel) can run in parallel with T010 (delivery confirmation)
- T013 (StatusTimeline) can run in parallel with US3 or US4 work

---

## Parallel Example: Foundational Phase

```
# These can run in parallel (different files):
Agent A: T001 + T002 → T003 → T004 (mutations → deploy → hooks)
Agent B: T005 (PeppolStatusBadge — independent component)
```

## Parallel Example: After Foundational

```
# Once Foundational is done, US1 and US2 can start in parallel:
Agent A: T006 → T007 (US1: list integration)
Agent B: T008 → T009 (US2: panel + detail page)

# Then US3, US4, US5 can overlap:
Agent A: T010 (US3: delivery confirmation)
Agent B: T011 → T012 (US4: error panel + panel integration)
Agent C: T013 → T014 (US5: timeline + panel integration)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Foundational (T001–T005)
2. Complete Phase 2: US1 — badges on list (T006–T007)
3. Complete Phase 3: US2 — transmit action (T008–T009)
4. **STOP and VALIDATE**: Badges visible on list, transmission works from detail page
5. Deploy/demo — core Peppol functionality is live

### Incremental Delivery

1. Foundational → ready
2. US1 (badges) → deploy (users see Peppol status) **← MVP**
3. US2 (transmit) → deploy (users can send via InvoiceNow)
4. US3 (delivery) → deploy (delivery confirmation visible)
5. US4 (errors) → deploy (error recovery available)
6. US5 (timeline) → deploy (visual timeline polish)
7. Each increment adds value without breaking previous work

---

## Notes

- All Peppol schema fields, validators, constants, and indexes are already deployed (#203) — no schema changes needed
- Convex real-time subscriptions mean status changes from backend webhooks auto-update the UI
- The `StatusTimeline` component (T013) is designed for reuse by LHDN submission UI (#204)
- Use existing `PEPPOL_STATUSES` constants from `src/lib/constants/statuses.ts` for all status references
- Use existing `ConfirmationDialog` from `src/components/ui/confirmation-dialog.tsx` for send/retry confirmations
- Use `formatBusinessDate` from `@/lib/utils` for all timestamp formatting
- Git author: `grootdev-ai <dev@hellogroot.com>` per CLAUDE.md
