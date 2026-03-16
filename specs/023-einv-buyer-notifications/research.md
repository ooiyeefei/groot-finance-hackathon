# Research: E-Invoice Buyer Notifications

**Date**: 2026-03-16
**Feature**: 023-einv-buyer-notifications
**Purpose**: Answer technical design questions for buyer notification implementation

---

## Research Question 1: Email Sending Approach

**Question**: Should we use existing SES infrastructure directly from Convex actions (via `fetch`), create a Next.js API route, or use Lambda with IAM?

### Decision

**Use existing email service via Convex action calling Next.js API route** (hybrid pattern).

### Rationale

1. **Existing Pattern**: The codebase already implements this exact pattern in the `/deliver` route:
   - File: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/deliver/route.ts` (lines 152-165)
   - Pattern: Convex action (`lhdnJobs.ts:triggerAutoDelivery`, line 343) → HTTP fetch → Next.js API route → email service
   - Result: Successfully sends validated e-invoice PDFs to buyers

2. **Email Service Exists**: `src/lib/services/email-service.ts` provides:
   - AWS SES integration with IAM-native access (Vercel OIDC role assumption)
   - Resend fallback for sandbox mode
   - Proven methods: `sendInvoiceEmail()`, `sendLeaveNotificationEmail()`, etc.

3. **Security**: Internal service key (`MCP_INTERNAL_SERVICE_KEY`) authenticates Convex → API route calls, preventing public access.

4. **AWS SDK Compatibility**: Next.js API routes run in Node.js environment with full AWS SDK support. Convex actions have limited AWS SDK support (HTTP-only).

### Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Convex action → Next.js route → email service** | Existing pattern, proven, secure, reusable | Slight latency (HTTP hop) | ✅ **Selected** |
| Convex action → direct SES SDK | Simplest, fewest hops | Convex has limited AWS SDK support, need to manage credentials | ❌ Rejected |
| Lambda with IAM | Best for pure AWS services | Overkill for simple email, increases infrastructure complexity | ❌ Rejected |
| Convex action → Resend API | Direct third-party API call | Bypasses existing SES infrastructure, increases cost | ❌ Rejected |

### Code References

- **Email service**: `src/lib/services/email-service.ts` (lines 1-1829)
- **Existing delivery pattern**: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/deliver/route.ts` (lines 151-165)
- **Convex action trigger**: `convex/functions/lhdnJobs.ts:triggerAutoDelivery` (lines 343-382)

---

## Research Question 2: Notification Log Schema

**Question**: What fields should `buyerNotificationLog[]` include for audit and idempotency?

### Decision

**Append-only log array with 7 core fields** stored on `sales_invoices` table.

### Schema

```typescript
buyerNotificationLog: v.optional(v.array(v.object({
  eventType: v.union(
    v.literal("validation"),
    v.literal("cancellation"),
    v.literal("rejection")
  ),
  recipientEmail: v.string(),
  timestamp: v.number(),              // Date.now()
  sendStatus: v.union(
    v.literal("sent"),
    v.literal("skipped"),
    v.literal("failed")
  ),
  skipReason: v.optional(v.string()), // "no_email", "invalid_format", "business_settings_disabled", "already_sent"
  errorMessage: v.optional(v.string()), // SES error for debugging
  sesMessageId: v.optional(v.string())  // SES tracking (for delivery confirmation)
})))
```

### Rationale

1. **Idempotency**: Before sending, query log for `{ eventType, sendStatus: "sent" }`. If found, skip (prevents duplicate emails on retry/polling).

2. **Audit Trail**: Captures every attempt (sent/skipped/failed) with reason and timestamp. Supports compliance investigations.

3. **Debugging**: `errorMessage` + `sesMessageId` enable troubleshooting failed deliveries.

4. **Minimal Overhead**: Storing on `sales_invoices` avoids new table/indexes. Array appends are lightweight in Convex.

### Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Log array on sales_invoices** | Simple, co-located with invoice data, no joins | Array grows unbounded (minor for ~3 events/invoice) | ✅ **Selected** |
| Separate `buyer_notifications` table | Scalable for high-volume, queryable | Requires new table, indexes, joins | ❌ Overkill for 3 events/invoice |
| No log (fire-and-forget) | Simplest | No idempotency, no audit trail, duplicate emails | ❌ Violates FR-011, FR-012 |

### Code References

- **Sales invoices schema**: `convex/schema.ts` (lines 1692-1842)
- **Existing log pattern**: `lhdnValidationErrors` array (line 1756) — same append-only pattern

---

## Research Question 3: Email Templates

**Question**: Should we use HTML templates, plain text, or both?

### Decision

**Simple transactional HTML emails** with plain text fallback (standard practice).

### Rationale

1. **Existing Pattern**: Email service already uses HTML templates:
   - `sendInvoiceEmail()` — sends HTML invoice with PDF attachment
   - `sendLeaveNotificationEmail()` — HTML notification with styling
   - All methods include plain text fallback

2. **Transactional Nature**: These are compliance notifications, not marketing. Simple HTML with:
   - Clear subject line (e.g., "E-Invoice INV-001 Validated by LHDN")
   - Structured body (invoice details, MyInvois link, business footer)
   - No images or complex styling (avoid spam filters)

3. **Brand Consistency**: Footer states "This is an automated notification from [Business Name] via Groot Finance" (FR-009).

### Template Structure

**Validation Email**:
```
Subject: E-Invoice [Invoice Number] Validated by LHDN

Hi [Buyer Name],

Your e-invoice [Invoice Number] from [Business Name] has been validated by LHDN Malaysia.

Document UUID: [UUID]
Validation Date: [Date]
Amount: [Currency] [Amount]

View on MyInvois: https://myinvois.hasil.gov.my/[LongId]/share

This is an automated notification from [Business Name] via Groot Finance.
```

**Cancellation Email**: Same structure + "Reason: [Cancellation Reason]"

**Rejection Confirmation**: Same structure, confirms buyer's own action processed.

### Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Simple transactional HTML** | Professional, readable, existing pattern | Minor complexity vs plain text | ✅ **Selected** |
| Plain text only | Simplest | Less professional, no formatting | ❌ Below standard for B2B |
| Rich HTML with branding | Most polished | Requires per-business templates, scope creep | ❌ Deferred to v2 |

### Code References

- **Email service templates**: `src/lib/services/email-service.ts` (methods like `sendInvoiceEmail`, `sendLeaveNotificationEmail`)
- **Existing invoice email**: Lines 143-165 in `/deliver/route.ts` show PDF attachment pattern

---

## Research Question 4: Business Settings Location

**Question**: Where do business settings currently live? Where should notification toggles be added?

### Decision

**Extend existing e-invoice settings in business management domain**.

### Location

- **Directory**: `src/domains/account-management/components/`
- **Files**:
  - `business-settings-section.tsx` — likely container for settings sections
  - `business-profile-settings.tsx` — general business info
  - `tabbed-business-settings.tsx` — tabbed settings interface
- **Target**: Add "Buyer Notifications" section to e-invoice settings tab (or create new tab if e-invoice doesn't exist)

### Rationale

1. **Domain Cohesion**: E-invoice settings belong in business account management, not sales-invoices domain (settings are business-wide, not per-invoice).

2. **Existing Pattern**: Business settings already handle:
   - LHDN credentials (TIN, certificate)
   - Auto-delivery preferences (`einvoiceAutoDelivery`, referenced in `lhdnJobs.ts:306`)
   - These are the right neighbors for notification toggles

3. **UI Convention**: Settings pages use toggles (Switch component from Radix UI, seen throughout codebase).

### Schema Fields (businesses table)

Already confirmed in CLAUDE.md that businesses table exists. Add:

```typescript
// New fields for 023-einv-buyer-notifications
einvoiceNotifyBuyerOnValidation: v.optional(v.boolean()),   // Default: true (undefined treated as enabled)
einvoiceNotifyBuyerOnCancellation: v.optional(v.boolean()), // Default: true
```

### Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Extend business settings (account-management domain)** | Correct domain, existing UI, business-scoped | None | ✅ **Selected** |
| Create settings in sales-invoices domain | Co-located with invoices | Wrong domain (settings are business-wide, not invoice-specific) | ❌ Violates DDD |
| Hardcode defaults (no UI) | Simplest | No user control (violates FR-006) | ❌ Violates spec |

### Code References

- **Settings components**: `src/domains/account-management/components/business-settings-section.tsx`, `tabbed-business-settings.tsx`
- **Auto-delivery setting reference**: `convex/functions/lhdnJobs.ts:306` checks `business.einvoiceAutoDelivery`

---

## Research Question 5: Rejection Detection

**Question**: How does the polling detect buyer rejections?

### Decision

**Already implemented in Issue #310** (022-einvoice-lhdn-buyer-flows).

### Implementation

From schema analysis (`convex/schema.ts` lines 1788-1795):

```typescript
// Existing fields on sales_invoices (022-einvoice-lhdn-buyer-flows)
lhdnRejectedAt: v.optional(v.number()),
lhdnStatusReason: v.optional(v.string()),
lhdnReviewRequired: v.optional(v.boolean()),
lhdnPdfDeliveredAt: v.optional(v.number()),
lhdnPdfDeliveredTo: v.optional(v.string()),
```

**Detection Mechanism**:
1. LHDN polling (in `lhdnJobs.ts:pollForResults`, lines 173-211) queries LHDN API
2. LHDN response includes status: `"valid"`, `"invalid"`, `"rejected"`, `"cancelled"`, etc.
3. `updateSourceRecord` (lines 217-333) patches `lhdnStatus` field
4. When `lhdnStatus` changes to `"rejected"`, set `lhdnRejectedAt` and `lhdnStatusReason`

### Buyer Notification Trigger Point

**Location**: `convex/functions/lhdnJobs.ts:updateSourceRecord` (line 217)

**Insertion Point**: After line 273 (after job status update), check for rejection status:

```typescript
// Existing: Lines 274-331 handle "valid" and "invalid" statuses
// NEW: Add rejection notification after line 331:
if (args.status === "rejected") {
  // Trigger buyer rejection confirmation email
  await ctx.scheduler.runAfter(1000, internal.functions.buyerNotifications.sendRejectionConfirmation, {
    invoiceId: job.sourceId,
    businessId: job.businessId,
  });
}
```

### Rationale

1. **No Research Needed**: Rejection detection is fully implemented (Issue #310, PR merged 2026-03-14 per git log).

2. **Status Values**: `lhdnStatus` validator includes rejection states (need to verify exact enum values by reading validator).

3. **Polling Frequency**: Existing schedule is 5s for first 2 min, then 30s (lines 103-166). Rejection detection piggybacks on this.

### Code References

- **Polling logic**: `convex/functions/lhdnJobs.ts:pollForResults` (lines 173-211)
- **Status update**: `convex/functions/lhdnJobs.ts:updateSourceRecord` (lines 217-333)
- **Rejection tracking fields**: `convex/schema.ts:sales_invoices` (lines 1788-1795)
- **LHDN status validator**: `convex/schema.ts` (search for `lhdnStatusValidator` definition)

---

## Summary of Decisions

| Question | Decision | Files to Modify |
|----------|----------|-----------------|
| **Email Approach** | Convex action → Next.js API route → email service | Create API route + email templates, extend email service |
| **Notification Log** | 7-field array on `sales_invoices` table | `convex/schema.ts` (extend table) |
| **Email Templates** | Simple transactional HTML + plain text fallback | `src/lib/email/buyer-notification-templates.ts` (new) |
| **Business Settings** | Extend account-management domain settings | `src/domains/account-management/components/` + `convex/schema.ts` (businesses) |
| **Rejection Detection** | Already implemented (Issue #310) | `convex/functions/lhdnJobs.ts` (add notification trigger) |

---

## Next Steps (Phase 1: Design & Contracts)

1. ✅ **Generate `data-model.md`**: Document schema extensions for `sales_invoices` + `businesses`
2. ✅ **Generate `contracts/`**: Email service API contract (JSON schema)
3. ✅ **Generate `quickstart.md`**: Dev setup, env vars, testing workflow
4. ✅ **Run agent context update**: Add new technologies (SES, email validation, idempotency)

**Research Complete** — All unknowns resolved. Ready to proceed to Phase 1 design.
