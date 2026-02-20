# Research: LHDN MyInvois Submission UI

**Branch**: `017-lhdn-submission-ui` | **Date**: 2026-02-20

## R-001: Existing Mutation & Hook Patterns

**Decision**: Follow existing `useSalesInvoiceMutations()` pattern — custom hook wrapping Convex mutations with individual `useState` loading flags.

**Rationale**: The codebase consistently uses this pattern (`useSalesInvoiceMutations`, `useSalesInvoice`). Loading states are per-action booleans (`isSending`, `isVoiding`), not a generic loading framework.

**Alternatives considered**:
- React Query mutations — rejected, Convex's real-time sync already handles cache invalidation
- Global loading state — rejected, per-action flags match existing pattern and allow finer control

**Key pattern**:
```typescript
const { sendInvoice } = useSalesInvoiceMutations()
const [isSubmitting, setIsSubmitting] = useState(false)
```

## R-002: Confirmation Dialog Pattern

**Decision**: Use inline Card-based confirmation (existing pattern), not AlertDialog.

**Rationale**: The invoice detail page uses custom `<Card className="border-destructive bg-destructive/5">` blocks with boolean state toggles (`showVoidConfirm`, `showDeleteConfirm`). This is the established pattern.

**Alternatives considered**:
- Radix AlertDialog — available in `@/components/ui/` but not used for invoice actions
- Browser `confirm()` — too basic, doesn't match design system

## R-003: Status Badge Color Pattern

**Decision**: Create `LhdnStatusBadge` following `InvoiceStatusBadge` pattern — STATUS_CONFIG record mapping status to `{label, className}`.

**Rationale**: Exact pattern from `invoice-status-badge.tsx`:
```typescript
const STATUS_CONFIG: Record<LhdnStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 ...' },
  submitted: { label: 'Submitted', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ...' },
  valid:     { label: 'Valid',     className: 'bg-green-500/10 text-green-600 dark:text-green-400 ...' },
  invalid:   { label: 'Invalid',   className: 'bg-red-500/10 text-red-600 dark:text-red-400 ...' },
  cancelled: { label: 'Cancelled', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ...' },
}
```

**Alternatives considered**:
- Reusing `InvoiceStatusBadge` with LHDN statuses — rejected, different status enum and different semantic meaning (payment vs compliance)

## R-004: Role-Based Access Control for LHDN Submission

**Decision**: Use `useUserRole()` client hook with `hasPermission('finance_admin')` for UI gating; Convex mutation uses `requireFinanceAdmin()` pattern for server enforcement.

**Rationale**: Existing RBAC system has:
- Client: `useUserRole()` from `@/domains/security/lib/rbac-client` returns `hasPermission()`, `canApprove`, etc.
- Server/Convex: `requireFinanceAdmin()` helper in `convex/functions/salesInvoices.ts` checks membership role includes `['owner', 'finance_admin']`
- Role hierarchy: owner(4) > finance_admin(3) > manager(2) > employee(1)

**For LHDN submission**: Owner + Finance Admin = `hasPermission('finance_admin')` which maps to roles with hierarchy >= 3.

**Alternatives considered**:
- Custom permission flag (e.g., `canSubmitToLhdn`) — rejected, `finance_admin` permission already models the right access boundary
- Convex-level only check — rejected, UI should hide the button entirely for unauthorized roles

## R-005: QR Code in PDF

**Decision**: Add LHDN QR code as a dedicated section in the PDF template, separate from payment method QR codes.

**Rationale**: The PDF template already supports QR codes via `paymentMethods[].qrCodeUrl` (Image component with 48x48px). However, the LHDN verification QR code serves a different purpose (government compliance verification, not payment). It should appear as a distinct section — likely in the footer area or near the invoice header — to meet LHDN compliance requirements.

**Approach**:
- Web: Use a QR code generation library (e.g., `qrcode` or `react-qr-code`) to render the QR code from the `lhdnLongId`
- PDF: Generate QR code as a data URL or base64 image, pass to `@react-pdf/renderer` Image component
- URL format: `https://myinvois.hasil.gov.my/{lhdnLongId}/share`

**Alternatives considered**:
- Embed in existing paymentMethods array — rejected, semantically different (compliance vs payment)
- External QR code API — rejected, adds external dependency; client-side generation is sufficient

## R-006: SalesInvoice Type Extension

**Decision**: Extend `SalesInvoice` interface in `types/index.ts` to include LHDN fields already present in the Convex schema.

**Rationale**: The Convex schema already has all LHDN fields (`lhdnStatus`, `lhdnSubmissionId`, etc.) but the TypeScript `SalesInvoice` interface doesn't include them yet. The interface needs to match what Convex returns.

**Fields to add**:
```typescript
// LHDN MyInvois tracking
lhdnSubmissionId?: string
lhdnDocumentUuid?: string
lhdnLongId?: string
lhdnStatus?: LhdnStatus
lhdnSubmittedAt?: number
lhdnValidatedAt?: number
lhdnValidationErrors?: Array<{ code: string; message: string; target?: string }>
lhdnDocumentHash?: string
einvoiceType?: EinvoiceType
```

## R-007: Convex Mutation for LHDN Submission

**Decision**: Create a `submitToLhdn` mutation in `convex/functions/salesInvoices.ts` that validates prerequisites and sets `lhdnStatus` to "pending". The actual LHDN API call is out of scope (#75).

**Rationale**: The UI needs a mutation to trigger the submission flow. Since the LHDN API integration (#75) is separate work, this mutation serves as the interface contract:
1. Validate business has TIN, BRN, MSIC code
2. Validate invoice is in "sent" status with no existing `lhdnStatus`
3. Auto-determine `einvoiceType` from document type
4. Set `lhdnStatus` to "pending" and `lhdnSubmittedAt` timestamp
5. Return success — the actual API call will be wired in #75

**Alternatives considered**:
- Convex action (HTTP call to LHDN API) — deferred to #75
- Next.js API route — rejected, Convex mutations are the established pattern for data writes

## R-008: Business LHDN Configuration Check

**Decision**: Read business LHDN fields (`lhdnTin`, `businessRegistrationNumber`, `msicCode`) from the existing `useBusinessProfile()` or `useActiveBusiness()` hook and validate client-side before calling the submission mutation.

**Rationale**: The business query already returns all fields. No new query needed. The pre-flight check on the client prevents unnecessary mutation calls, while the mutation also validates server-side as defense in depth.

**Pattern**: Check `business.lhdnTin && business.businessRegistrationNumber && business.msicCode` before enabling the submit button.
