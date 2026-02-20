# Research: Peppol InvoiceNow Transmission UI

**Date**: 2026-02-20
**Branch**: `001-peppol-submission-ui`

## Decision Log

### D1: Peppol Status Badge Component Pattern

**Decision**: Create a new `PeppolStatusBadge` component following the existing `InvoiceStatusBadge` pattern — a standalone component with a status config map and custom className overrides on the shared `Badge` UI component.

**Rationale**: The existing `InvoiceStatusBadge` (`src/domains/sales-invoices/components/invoice-status-badge.tsx`) uses this exact pattern and it works well for the design system. Custom classNames per-status provide precise color control (bg-{color}-500/10 + text-{color}-600 + border) with dark mode support.

**Alternatives considered**:
- Using Badge semantic variants (success, warning, error, info) — rejected because the 4 Peppol statuses don't cleanly map to the existing variant set, and the InvoiceStatusBadge already established custom-className as the domain pattern.

### D2: Timeline Component — New Reusable Component

**Decision**: Create a new `StatusTimeline` component in `src/components/ui/` designed to be reusable across both Peppol and LHDN (issue #204) status flows.

**Rationale**: No timeline/stepper component exists in `src/components/ui/`. Both Peppol and LHDN need similar visual timelines with different stages. A generic component accepting steps (label, timestamp, status) keeps the UI consistent and avoids duplication.

**Alternatives considered**:
- Domain-specific timeline only in `src/domains/sales-invoices/components/` — rejected because LHDN (#204) needs the same pattern and sharing via `src/components/ui/` is cleaner.
- Third-party timeline library — rejected; the requirement is simple enough for a custom component and avoids adding dependencies.

### D3: Confirmation Dialog for Peppol Transmission

**Decision**: Reuse the existing `ConfirmationDialog` component (`src/components/ui/confirmation-dialog.tsx`) for the "Send via InvoiceNow" confirmation.

**Rationale**: The existing component supports `title`, `message`, `confirmText`, `confirmVariant`, and `isLoading` — everything needed. The receiver's Peppol participant ID can be shown in the `message` prop.

**Alternatives considered**:
- Inline card confirmation (like the Void pattern on the detail page) — rejected because the Peppol dialog needs to show the receiver's Peppol ID prominently, which benefits from a focused modal.

### D4: Customer peppolParticipantId — Fetching Strategy

**Decision**: The invoice detail page will use the existing `customerId` on the invoice to fetch the customer record and check for `peppolParticipantId`. This requires adding a customer query call to the detail page.

**Rationale**: The `customerSnapshot` saved with invoices intentionally excludes `peppolParticipantId` (by design in #203 — the snapshot captures point-in-time compliance data, while Peppol ID is a routing identifier that should reflect current state). The live customer record must be checked.

**Alternatives considered**:
- Adding `peppolParticipantId` to `customerSnapshot` — rejected because it was intentionally excluded in #203's design.
- Creating a dedicated Convex query for Peppol eligibility — rejected as over-engineering; a simple customer fetch suffices.

### D5: Peppol Transmission Mutation — Stub Approach

**Decision**: Create a Convex mutation `initiatePeppolTransmission` in `convex/functions/salesInvoices.ts` that validates prerequisites and sets `peppolStatus` to "pending". The actual Peppol API call will be handled by the backend integration (#196).

**Rationale**: The spec says "UI only, assuming mutations exist." Since no mutation exists yet, we create a thin mutation that does the UI's job (validate + set pending status) without the API integration. Issue #196 will later add the actual Access Point call or wire it via an action.

**Alternatives considered**:
- Not creating any mutation (pure UI mockup) — rejected because the UI needs a real mutation to test against, and the validation logic (check sender/receiver Peppol IDs, invoice status) belongs in the mutation.
- Full API integration — out of scope per issue #205.

### D6: Business peppolParticipantId — Access via Active Business Context

**Decision**: The `useActiveBusiness()` hook already returns the business record. Since `peppolParticipantId` is a field on the `businesses` table (added in #203), it should already be available via this hook. Verify and use directly.

**Rationale**: The active business context fetches the full business record. No additional query needed.

### D7: Peppol Status Badge Placement on Invoice List

**Decision**: Add the Peppol badge inline after the existing invoice status badge in the Status column (desktop) and in the header row alongside the invoice status badge (mobile card).

**Rationale**: Adding a separate column would require restructuring the table and reduce space for other columns. The existing Status column has room for a second badge, and the Peppol badge only appears for invoices with `peppolStatus` set — keeping it adjacent to the invoice status creates a clear "status cluster."

**Alternatives considered**:
- Separate "Peppol" column — rejected due to table width constraints and the fact that most invoices won't have Peppol data (sparse column).
- Tooltip/icon instead of badge — rejected because explicit text labels provide better accessibility (spec requires color + text distinction).

## Codebase Patterns Documented

### Existing Mutation Pattern

```
1. requireFinanceAdmin(ctx, businessId)  — auth check
2. ctx.db.get(id) + validate            — resource fetch
3. Business logic                        — status checks, calculations
4. ctx.db.patch(id, updates)             — persist changes
5. return id                             — return resource ID
```

### Existing Action Button Gating (Detail Page)

```
isDraft  = status === "draft"
isVoid   = status === "void"
isPaid   = status === "paid"

PDF:            always
Edit:           isDraft
Send:           isDraft
Resend Email:   !isDraft && !isVoid
Record Payment: !isVoid && !isPaid
Void:           !isVoid && !isPaid
Delete:         isDraft
```

### Data Flow

```
Convex Query → useQuery hook → Component renders → useMutation for actions
```

All queries are reactive (Convex subscriptions) — status changes from the backend automatically reflect in the UI.
