# UI Component Contracts: Peppol Submission UI

**Date**: 2026-02-20

## New Components

### 1. `PeppolStatusBadge`

**Location**: `src/domains/sales-invoices/components/peppol-status-badge.tsx`
**Pattern**: Mirrors `invoice-status-badge.tsx`

```typescript
interface PeppolStatusBadgeProps {
  status: PeppolStatus
}
```

**Status → Visual Mapping**:

| Status | Label | Color Pattern |
|--------|-------|---------------|
| `pending` | Pending | Gray: `bg-muted text-muted-foreground border border-border` |
| `transmitted` | Transmitted | Blue: `bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30` |
| `delivered` | Delivered | Green: `bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30` |
| `failed` | Failed | Red: `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30` |

### 2. `StatusTimeline`

**Location**: `src/components/ui/status-timeline.tsx`
**Purpose**: Reusable timeline for both Peppol and LHDN status flows

```typescript
interface TimelineStep {
  label: string
  timestamp?: number      // undefined = not yet reached
  status: 'completed' | 'current' | 'upcoming' | 'failed'
}

interface StatusTimelineProps {
  steps: TimelineStep[]
  className?: string
}
```

**Visual Rules**:
- Completed steps: green circle + line, timestamp shown
- Current step: blue pulsing indicator
- Upcoming steps: gray circle + dashed line
- Failed step: red circle with X icon

### 3. `PeppolTransmissionPanel`

**Location**: `src/domains/sales-invoices/components/peppol-transmission-panel.tsx`
**Purpose**: Composite component for the invoice detail page that renders the appropriate Peppol UI based on current state

```typescript
interface PeppolTransmissionPanelProps {
  invoice: SalesInvoice
  customerPeppolId?: string
  businessPeppolId?: string
}
```

**Renders based on state**:

| Condition | Renders |
|-----------|---------|
| No `peppolStatus` + eligible (has IDs, right invoice status) | "Send via InvoiceNow" button |
| No `peppolStatus` + not eligible | Nothing |
| `peppolStatus === "pending"` | Timeline (Created ✓, Transmitted pending) + "Transmission in progress" message |
| `peppolStatus === "transmitted"` | Timeline (Created ✓, Transmitted ✓) |
| `peppolStatus === "delivered"` | Timeline (all ✓) + Delivery confirmation card with timestamp |
| `peppolStatus === "failed"` | Timeline (Created ✓, Failed ✗) + Error panel + Retry button |

### 4. `PeppolErrorPanel`

**Location**: `src/domains/sales-invoices/components/peppol-error-panel.tsx`
**Purpose**: Displays Peppol transmission errors with retry action

```typescript
interface PeppolErrorPanelProps {
  errors: Array<{ code: string; message: string }>
  onRetry: () => void
  isRetrying: boolean
}
```

**Visual**: Card with `border-destructive bg-destructive/5` styling (matching Void confirmation pattern), listing each error as code + message, with a "Retry transmission" button.

## Modified Components

### 5. `sales-invoice-list.tsx` — Add Peppol Badge

**Change**: In both desktop table row and mobile card, render `PeppolStatusBadge` adjacent to existing `InvoiceStatusBadge` when `invoice.peppolStatus` is defined.

**Desktop**: After `<InvoiceStatusBadge>` in the Status column cell
**Mobile**: After `<InvoiceStatusBadge>` in the header row

### 6. Invoice Detail Page — Add Peppol Panel

**Change**: Add `PeppolTransmissionPanel` to the sidebar area (below "Invoice Details" card and above "Payment History"), passing invoice data, customer `peppolParticipantId`, and business `peppolParticipantId`.

### 7. `use-sales-invoices.ts` — Add Peppol Mutations

**Change**: Add mutation hooks to `useSalesInvoiceMutations()`:

```typescript
const initiatePeppol = useMutation(api.functions.salesInvoices.initiatePeppolTransmission)
const retryPeppol = useMutation(api.functions.salesInvoices.retryPeppolTransmission)
```

## No Changes to Existing Types

The `SalesInvoice` type in `src/domains/sales-invoices/types/index.ts` already includes all Peppol fields (added in #203). No type changes needed.
