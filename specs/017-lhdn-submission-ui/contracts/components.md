# Component Contracts: LHDN Submission UI

## Component: `LhdnStatusBadge`

**File**: `src/domains/sales-invoices/components/lhdn-status-badge.tsx`

```typescript
interface LhdnStatusBadgeProps {
  status: LhdnStatus | undefined
}
```

**Behavior**:
- If `status` is undefined → render nothing (return null)
- Otherwise → render `<Badge>` with color from STATUS_CONFIG
- Color mapping: pending=gray, submitted=blue, valid=green, invalid=red, cancelled=yellow

---

## Component: `LhdnSubmitButton`

**File**: `src/domains/sales-invoices/components/lhdn-submit-button.tsx`

```typescript
interface LhdnSubmitButtonProps {
  invoice: SalesInvoice
  business: Business
  userRole: UserRoleInfo
  onSubmitSuccess?: () => void
}
```

**Behavior**:
- Hidden if: invoice status is not "sent", OR lhdnStatus is already set, OR user lacks finance_admin permission
- Shows "Submit to LHDN" for first submission, "Resubmit to LHDN" when lhdnStatus is "invalid"
- Pre-flight checks: business LHDN config completeness, customer TIN presence
- Confirmation card shown inline before executing mutation
- Loading state with disabled button + spinner during mutation

---

## Component: `LhdnValidationErrors`

**File**: `src/domains/sales-invoices/components/lhdn-validation-errors.tsx`

```typescript
interface LhdnValidationErrorsProps {
  errors: Array<{ code: string; message: string; target?: string }>
  status: LhdnStatus
}
```

**Behavior**:
- Only renders when `status === "invalid"`
- Displays error list: code, message, target (if present)
- Shows generic message if errors array is empty
- Styled as alert/warning card

---

## Component: `LhdnSubmissionTimeline`

**File**: `src/domains/sales-invoices/components/lhdn-submission-timeline.tsx`

```typescript
interface LhdnSubmissionTimelineProps {
  lhdnStatus?: LhdnStatus
  lhdnSubmittedAt?: number
  lhdnValidatedAt?: number
}
```

**Behavior**:
- Renders vertical timeline: Pending → Submitted → Valid/Invalid/Cancelled
- Each step shows timestamp (formatted) when available
- Current step highlighted, future steps grayed out
- Uses semantic colors: green for valid, red for invalid, yellow for cancelled

---

## Component: `LhdnQrCode`

**File**: `src/domains/sales-invoices/components/lhdn-qr-code.tsx`

```typescript
interface LhdnQrCodeProps {
  lhdnLongId: string | undefined
}
```

**Behavior**:
- If `lhdnLongId` is undefined → render nothing
- Otherwise → generate QR code encoding `https://myinvois.hasil.gov.my/{lhdnLongId}/share`
- Display with label "LHDN e-Invoice Verification"
- Exportable as data URL for PDF inclusion

---

## Component: `LhdnDetailSection`

**File**: `src/domains/sales-invoices/components/lhdn-detail-section.tsx`

```typescript
interface LhdnDetailSectionProps {
  invoice: SalesInvoice
  business: Business
  userRole: UserRoleInfo
}
```

**Behavior**:
- Orchestrator component for the invoice detail page
- Renders (conditionally based on data availability):
  1. LHDN document IDs (submission ID, document UUID)
  2. `LhdnSubmitButton` (when eligible)
  3. `LhdnValidationErrors` (when invalid)
  4. `LhdnSubmissionTimeline` (when any LHDN status exists)
  5. `LhdnQrCode` (when lhdnLongId exists)
- Wrapped in a Card with "LHDN e-Invoice" heading
