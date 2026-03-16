# Implementation Plan: LHDN E-Invoice Buyer Rejection Flow

**Branch**: `023-einv-buyer-rejection-flow` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-einv-buyer-rejection-flow/spec.md`

## Summary

Implement LHDN-compliant e-invoice buyer rejection flow — allowing finance admins to reject received e-invoices within the 72-hour LHDN window via API submission. The feature extends the existing expense claims and AP invoice domains with rejection capabilities, updates linked records, sends notifications, and provides 72-hour countdown UI.

**Primary Technical Approach**: Extend LHDN client library with `rejectDocument()` method (mirrors existing `cancelDocument()`), add Next.js API route with Clerk auth, create Convex mutations for status updates and notification dispatch, add rejection UI components to expense claims and AP invoices domains.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Clerk 6.30.0, React 19.1.2, Radix UI
**Storage**: Convex document database (tables: `einvoice_received_documents`, `invoices`, `expense_claims`, `notifications`)
**Testing**: Jest + React Testing Library (component tests), Convex test framework (mutation tests)
**Target Platform**: Web application (responsive desktop/mobile)
**Project Type**: Web (Next.js frontend + Convex backend + AWS Lambda infrastructure)
**Performance Goals**: Rejection submission <2s, UI countdown updates every 30s, notification delivery <10s
**Constraints**: LHDN API rate limit 12 RPM, 72-hour rejection window enforced, Clerk auth required, idempotent rejection
**Scale/Scope**: ~5-10 new files, extend 3 existing Convex mutations, 1 new API route, 2-3 UI components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Gate 1: Domain-Driven Design (MANDATORY)

**Rule**: Features must map to business domains (`src/domains/`) or shared capabilities (`src/lib/`).

**Compliance**: ✅ **PASS**
- Buyer rejection is a business capability spanning two domains:
  - **Primary**: AP invoices (`src/domains/invoices/`) — B2B supplier e-invoice rejection
  - **Secondary**: Expense claims (`src/domains/expense-claims/`) — employee merchant e-invoice rejection (grey area)
- LHDN client extension (`src/lib/lhdn/client.ts`) is a shared capability — reusable rejection method
- UI components live in their respective domains, not as standalone pages

### Gate 2: Security — Least Privilege (CRITICAL)

**Rule**: Clerk auth required, role-based access (owner/finance_admin/manager only), no secrets in Convex.

**Compliance**: ✅ **PASS**
- API route uses Clerk `auth()` with role validation
- LHDN credentials fetched from AWS SSM (not Convex)
- Rejection mutation uses `internalMutation` for backend-only operations
- Frontend calls public API route (not Convex mutation directly) to enforce auth boundary

### Gate 3: Convex Deployment (MANDATORY)

**Rule**: Run `npx convex deploy --yes` after schema/function changes.

**Compliance**: ✅ **PASS**
- Schema already extended with rejection fields (022-einvoice-lhdn-buyer-flows)
- New mutations added to existing files (no new tables)
- Deployment checklist added to tasks

### Gate 4: AWS Infrastructure (CRITICAL)

**Rule**: No new Lambda functions without approval. Use existing infrastructure.

**Compliance**: ✅ **PASS**
- No new Lambda needed — rejection uses existing LHDN client library
- API route runs on Vercel serverless (existing Next.js pattern)
- LHDN authentication handled via existing intermediary flow

### Gate 5: Testing (MANDATORY)

**Rule**: Tests written → User approved → Tests fail → Then implement (TDD).

**Compliance**: ⚠️ **DEFERRED TO PHASE 2**
- Test specs will be written in Phase 2 (tasks.md)
- User must approve test scenarios before implementation
- Tests must pass before deployment

**Post-Phase 1 Re-check**: All gates remain valid. No violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/023-einv-buyer-rejection-flow/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (already exists)
├── checklists/          # Quality checklists (already exists)
│   └── requirements.md
├── research.md          # Phase 0 output (to be created)
├── data-model.md        # Phase 1 output (to be created)
├── quickstart.md        # Phase 1 output (to be created)
├── contracts/           # Phase 1 output (to be created)
│   └── reject-api.yml   # OpenAPI spec for rejection API
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── lib/lhdn/
│   ├── client.ts                 # EXTEND: Add rejectDocument() method
│   └── types.ts                  # EXTEND: Add LhdnRejectRequest type
│
├── domains/
│   ├── expense-claims/
│   │   └── components/
│   │       └── einvoice-reject-dialog.tsx        # NEW: Rejection dialog component
│   │
│   └── invoices/                                  # AP invoices domain
│       └── components/
│           └── received-einvoice-reject-button.tsx  # NEW: Rejection button component
│
└── app/api/v1/
    └── einvoice-received/[uuid]/
        └── reject/
            └── route.ts                           # NEW: POST rejection API route

convex/
├── schema.ts                                      # NO CHANGE: Schema already updated in 022
│
└── functions/
    ├── einvoiceReceivedDocuments.ts               # EXTEND: Add rejectReceivedDocument mutation
    ├── invoices.ts                                # EXTEND: Update clearEinvoiceReference mutation
    ├── expenseClaims.ts                           # EXTEND: Update clearEinvoiceAttachment mutation
    └── notifications.ts                           # EXTEND: Add createRejectionNotification helper

tests/
├── unit/
│   ├── lhdn-client.test.ts                       # NEW: Test rejectDocument() method
│   └── einvoice-rejection.test.ts                # NEW: Test rejection mutations
│
└── integration/
    └── reject-einvoice-flow.test.ts              # NEW: End-to-end rejection flow
```

**Structure Decision**: The feature extends existing domain structure (`expense-claims`, `invoices`) rather than creating a new domain, since buyer rejection is a capability within these domains, not a standalone feature. The LHDN client extension (`src/lib/lhdn/`) follows the shared capability pattern.

## Complexity Tracking

*No Constitution violations — this section is not applicable.*

---

## Phase 0: Research & Technical Decisions

### Research Topics

1. **LHDN API Rejection Endpoint**
   - Endpoint: `PUT /api/v1.0/documents/state/{uuid}/state`
   - Request body: `{ status: "rejected", reason: string }`
   - Rate limit: 12 RPM (shared with cancellation)
   - Response: 204 No Content (success), 400/404/429 (errors)
   - Authentication: Bearer token via intermediary TIN

2. **Existing LHDN Client Pattern**
   - `cancelDocument()` method exists at `src/lib/lhdn/client.ts:186`
   - Uses `lhdnFetch()` helper with rate limiting
   - Same endpoint, different status field (`"cancelled"` vs `"rejected"`)
   - Pattern: async function with documentUuid, reason, accessToken params

3. **Convex Mutation Patterns**
   - Use `mutation` for user-facing operations (frontend calls)
   - Use `internalMutation` for backend-only operations (API routes call)
   - Pattern: validate inputs, check auth, update records, trigger notifications
   - Example: `expenseClaims.ts` line 2691 (`resolveEinvoiceMatch`)

4. **API Route Auth Pattern**
   - Clerk `auth()` for user identity
   - Role check via `resolveUserByClerkId` → `user.role`
   - Return 401 (unauthorized) or 403 (forbidden) for auth failures
   - Example: `src/app/api/v1/account-management/businesses/route.ts`

5. **72-Hour Window Calculation**
   - Field: `einvoice_received_documents.dateTimeValidated` (ISO 8601 string)
   - Calculation: `const expiryMs = new Date(dateTimeValidated).getTime() + (72 * 60 * 60 * 1000)`
   - Client-side: React hook with `setInterval` for countdown updates
   - Server-side: Validate window before LHDN API call

6. **Notification System**
   - Table: `notifications` with fields: userId, type, title, message, severity, link, createdAt
   - Pattern: Create notification record → real-time subscription updates UI
   - Types: `"lhdn_submission"` (existing), add handling for rejection events
   - Recipients: For AP invoices → invoice creator; For expense claims → claim submitter

### Technical Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|-------------------------|
| **Extend LHDN client library** | Mirrors existing `cancelDocument()` pattern, reusable across domains | Create separate rejection service (overkill, duplicates auth logic) |
| **API route over Convex mutation** | Enforces auth boundary, prevents direct Convex calls bypassing role checks | Expose mutation directly (security risk, harder to audit) |
| **Tier 1 field matching only** | LHDN e-invoices are highly structured (TIN + amount + reference = 90%+ accuracy) | Add DSPy AI matching immediately (premature, defer until <80% match rate) |
| **In-app notifications only** | Existing infrastructure, real-time delivery, user preference control | Add email notifications immediately (out of scope per spec) |
| **72-hour countdown with 30s updates** | Balance UX (visible updates) with performance (avoid excessive re-renders) | 1s updates (excessive), 5min updates (stale UX) |
| **Idempotent rejection** | Prevent duplicate LHDN API calls if user retries | Non-idempotent (risk of LHDN rate limit violations) |

---

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md) for full entity relationship diagram and field definitions.

**Key Entities Extended**:
1. **`einvoice_received_documents`** (Convex table — schema already updated in 022)
   - Fields: `rejectedAt`, `rejectionReason`, `rejectedByUserId`
   - Status values: `"valid" | "rejected" | "cancelled"`
   - Links: `matchedInvoiceId` (new), `matchedExpenseClaimId` (existing)

2. **`invoices`** (AP invoices — existing table)
   - New pattern: Store e-invoice rejection details on the invoice record
   - Fields: `einvoiceRejected: boolean`, `einvoiceRejectionReason: string`, `einvoiceRejectedAt: number`

3. **`expense_claims`** (existing table, no schema changes needed)
   - Existing fields: `einvoiceAttached`, `lhdnReceivedStatus`, `lhdnReceivedDocumentUuid`
   - On rejection: Set `einvoiceAttached: false`, `lhdnReceivedStatus: "rejected"`

4. **`notifications`** (existing table, no schema changes needed)
   - Type: `"lhdn_submission"` (existing)
   - Severity: `"warning"` (rejection is non-blocking, user can take action)

### API Contracts

See [contracts/reject-api.yml](./contracts/reject-api.yml) for OpenAPI 3.0 specification.

**Endpoint**: `POST /api/v1/einvoice-received/[uuid]/reject`

**Request**:
```typescript
{
  reason: string  // Required, non-empty rejection reason
}
```

**Response** (200 OK):
```typescript
{
  success: true,
  document: {
    _id: string,
    lhdnDocumentUuid: string,
    status: "rejected",
    rejectedAt: number,
    rejectionReason: string,
    rejectedByUserId: string
  }
}
```

**Error Responses**:
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: User role not authorized (must be owner/finance_admin/manager)
- `404 Not Found`: Document UUID not found
- `400 Bad Request`: Rejection window expired, document not in "valid" status, or reason empty
- `429 Too Many Requests`: LHDN rate limit exceeded
- `500 Internal Server Error`: LHDN API failure or Convex update failure

### Component Architecture

**Rejection Dialog Component** (`src/domains/expense-claims/components/einvoice-reject-dialog.tsx`):
- Props: `documentUuid`, `currentStatus`, `dateTimeValidated`, `onSuccess`, `onCancel`
- State: `reason` (string), `isSubmitting` (boolean), `error` (string | null)
- UI: Radix Dialog with textarea, 72-hour countdown banner, confirmation prompt
- Validation: Reason non-empty, window not expired
- API call: POST to `/api/v1/einvoice-received/[uuid]/reject`

**Rejection Button Component** (`src/domains/invoices/components/received-einvoice-reject-button.tsx`):
- Reusable trigger button for the rejection dialog
- Conditional rendering: Only show if status = "valid" and within 72-hour window
- Visual states: Enabled (within window), Urgent (< 12 hours remaining), Disabled (expired)

### Quickstart

See [quickstart.md](./quickstart.md) for developer onboarding guide.

**Key Integration Points**:
1. LHDN client: `import { rejectDocument } from '@/lib/lhdn/client'`
2. Rejection mutation: `api.functions.einvoiceReceivedDocuments.rejectReceivedDocument`
3. API route: `POST /api/v1/einvoice-received/[uuid]/reject`
4. UI components: Import rejection dialog into expense claims and AP invoices detail pages

---

## Phase 2: Task Breakdown (Deferred to /speckit.tasks)

Task generation is handled by the `/speckit.tasks` command. The following task categories are anticipated:

1. **Backend Tasks** (~5 tasks)
   - Extend LHDN client with `rejectDocument()` method
   - Add `rejectReceivedDocument` mutation to `einvoiceReceivedDocuments.ts`
   - Update `invoices.ts` and `expenseClaims.ts` for side-effect handling
   - Create rejection API route with Clerk auth and role validation
   - Add notification helper for rejection events

2. **Frontend Tasks** (~4 tasks)
   - Create rejection dialog component with 72-hour countdown
   - Create rejection button component with conditional rendering
   - Integrate dialog into expense claims detail page
   - Integrate dialog into AP invoices detail page

3. **Testing Tasks** (~3 tasks)
   - Unit tests for LHDN `rejectDocument()` method (mock LHDN API)
   - Integration tests for rejection flow (Convex mutations + API route)
   - End-to-end tests for UI rejection flow (React Testing Library)

4. **Deployment Tasks** (~2 tasks)
   - Run `npx convex deploy --yes` to deploy mutations
   - Verify rejection flow in staging environment (test with LHDN sandbox)

**Total Estimated Tasks**: 14 tasks across 4 categories

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **LHDN API downtime during rejection** | User cannot reject, 72-hour window may expire | Retry logic with exponential backoff, clear error message, allow user to retry manually |
| **Concurrent rejection attempts** | Duplicate API calls, LHDN rate limit violation | Idempotent API route (check current status before LHDN call), pessimistic locking in Convex mutation |
| **72-hour window edge case** | User submits rejection, window expires mid-request | Server-side validation before LHDN API call, return 400 if expired |
| **Notification delivery failure** | User not informed of rejection side-effects | Notification failure is non-blocking (log error, continue with rejection), user can see updated status on refresh |
| **AP invoice matching not implemented** | Can only reject expense claim e-invoices | Document as known limitation, add AP matching in follow-up task (defer to Phase 2) |

---

## Success Metrics (from Spec)

- **SC-001**: Users can reject within 3 clicks and <30s total ✅ (API route + dialog UX)
- **SC-002**: 100% rejection success rate (excluding LHDN downtime) ✅ (Retry logic + idempotency)
- **SC-003**: Linked records updated within 5s ✅ (Convex real-time mutations)
- **SC-004**: Notifications delivered within 10s ✅ (Convex notification system)
- **SC-005**: Zero accidental rejections ✅ (Confirmation dialog with clear prompt)
- **SC-006**: Zero rejections outside 72-hour window ✅ (Server-side + client-side validation)

---

## Next Steps

1. **Run `/speckit.tasks`** to generate dependency-ordered task breakdown in `tasks.md`
2. **Review and approve tasks** with user before implementation
3. **Run `/speckit.implement`** to execute tasks with TDD workflow
4. **Deploy to staging** and verify with LHDN sandbox environment
5. **User acceptance testing** with real rejection scenarios
6. **Deploy to production** after UAT approval

**Estimated Implementation Time**: 2-3 days (backend + frontend + testing)
