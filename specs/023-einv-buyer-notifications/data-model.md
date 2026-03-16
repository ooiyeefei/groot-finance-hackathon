# Data Model: E-Invoice Buyer Notifications

**Date**: 2026-03-16
**Feature**: 023-einv-buyer-notifications
**Purpose**: Schema extensions and validation rules for buyer notification system

---

## Schema Extensions

### 1. `sales_invoices` Table Extension

**File**: `convex/schema.ts` (line ~1692)

#### New Field: `buyerNotificationLog`

```typescript
sales_invoices: defineTable({
  // ... existing fields ...

  // 023-einv-buyer-notifications: Buyer notification audit log
  buyerNotificationLog: v.optional(v.array(v.object({
    eventType: v.union(
      v.literal("validation"),
      v.literal("cancellation"),
      v.literal("rejection")
    ),
    recipientEmail: v.string(),
    timestamp: v.number(),           // Unix timestamp (Date.now())
    sendStatus: v.union(
      v.literal("sent"),             // Email successfully sent via SES
      v.literal("skipped"),          // Intentionally not sent (reason in skipReason)
      v.literal("failed")            // Send attempt failed (error in errorMessage)
    ),
    skipReason: v.optional(v.string()), // "no_email" | "invalid_format" | "business_settings_disabled" | "already_sent"
    errorMessage: v.optional(v.string()), // SES error message for debugging failed sends
    sesMessageId: v.optional(v.string())  // AWS SES Message ID for tracking delivery
  }))),

  // ... rest of existing fields ...
})
```

**Migration Strategy**: Convex handles `v.optional` fields automatically. Existing invoices will have `undefined` (treated as empty array).

#### Purpose

- **Idempotency**: Before sending, check if `{ eventType, sendStatus: "sent" }` exists. If yes, skip (prevents duplicate emails).
- **Audit Trail**: Every send attempt (successful or failed) is logged for compliance investigations.
- **Debugging**: `errorMessage` and `sesMessageId` enable troubleshooting delivery issues.

---

### 2. `businesses` Table Extension

**File**: `convex/schema.ts` (line ~400-500, exact location TBD)

#### New Fields: Notification Preferences

```typescript
businesses: defineTable({
  // ... existing fields ...

  // 023-einv-buyer-notifications: Buyer notification preferences
  einvoiceNotifyBuyerOnValidation: v.optional(v.boolean()),   // Default: true (undefined = enabled)
  einvoiceNotifyBuyerOnCancellation: v.optional(v.boolean()), // Default: true (undefined = enabled)

  // ... rest of existing fields ...
})
```

**Default Behavior**: `undefined` is treated as `true` (notifications enabled by default).

**Rationale**: Consistent with existing pattern (`einvoiceAutoDelivery` field, referenced in `lhdnJobs.ts:306`).

#### Purpose

- **User Control** (FR-006): Business admins can disable specific notification types.
- **Gradual Rollout**: Can disable for testing, then enable for production.
- **Rejection Confirmation**: NOT configurable (always send per spec clarification — it confirms buyer's own action).

---

## Validation Rules

### Email Address Validation

**Rule**: Buyer email must conform to RFC 5322 standard.

**Implementation**:
```typescript
import { z } from 'zod';

const buyerEmailSchema = z.string().email().min(3).max(255);

function validateBuyerEmail(email: string): boolean {
  try {
    buyerEmailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}
```

**Behavior**:
- **Invalid email**: Log with `sendStatus: "skipped"`, `skipReason: "invalid_format"`. Do not attempt send.
- **Missing email**: Log with `sendStatus: "skipped"`, `skipReason: "no_email"`.

---

### Notification Log Constraints

1. **Append-Only**: Never modify existing log entries. Only append new entries.
2. **Event Type Uniqueness**: Multiple entries of same `eventType` are allowed (e.g., retry after failure), but only one `sendStatus: "sent"` per `eventType` (enforced by idempotency check).
3. **Timestamp Order**: Entries naturally ordered by `timestamp` (most recent = last in array).
4. **Size Limit**: No enforced limit (3 events per invoice max — validation, cancellation, rejection). Extremely low volume.

---

### Business Settings Validation

**Rule**: If `einvoiceNotifyBuyerOnValidation` or `einvoiceNotifyBuyerOnCancellation` is disabled, skip notification.

**Implementation**:
```typescript
function shouldNotifyBuyer(
  business: Business,
  eventType: "validation" | "cancellation" | "rejection"
): boolean {
  if (eventType === "validation") {
    // undefined = true (default enabled)
    return business.einvoiceNotifyBuyerOnValidation !== false;
  }
  if (eventType === "cancellation") {
    return business.einvoiceNotifyBuyerOnCancellation !== false;
  }
  // Rejection confirmation: always send (not configurable)
  return true;
}
```

**Behavior**:
- If `shouldNotifyBuyer()` returns `false`, log with `sendStatus: "skipped"`, `skipReason: "business_settings_disabled"`.

---

## Idempotency Logic

### Check Before Send

Before triggering email, query the notification log:

```typescript
function hasAlreadySent(
  invoice: SalesInvoice,
  eventType: "validation" | "cancellation" | "rejection"
): boolean {
  if (!invoice.buyerNotificationLog) return false;

  return invoice.buyerNotificationLog.some(entry =>
    entry.eventType === eventType && entry.sendStatus === "sent"
  );
}
```

**Flow**:
1. Load invoice from database
2. Call `hasAlreadySent(invoice, eventType)`
3. If `true`: Log with `sendStatus: "skipped"`, `skipReason: "already_sent"`. Do not send.
4. If `false`: Proceed with email send

### Atomic Logging

**Pattern**: Log entry is appended **after** successful SES send (or after determining skip/failure).

```typescript
// Pseudo-code
try {
  const result = await emailService.sendBuyerNotification(...)

  if (result.success) {
    // Append "sent" log entry
    await ctx.runMutation(internal.salesInvoices.appendNotificationLog, {
      invoiceId,
      entry: {
        eventType,
        recipientEmail: buyerEmail,
        timestamp: Date.now(),
        sendStatus: "sent",
        sesMessageId: result.messageId,
      }
    });
  } else {
    // Append "failed" log entry
    await ctx.runMutation(internal.salesInvoices.appendNotificationLog, {
      invoiceId,
      entry: {
        eventType,
        recipientEmail: buyerEmail,
        timestamp: Date.now(),
        sendStatus: "failed",
        errorMessage: result.error,
      }
    });
  }
} catch (error) {
  // Append "failed" log entry for unexpected errors
  await ctx.runMutation(internal.salesInvoices.appendNotificationLog, {
    invoiceId,
    entry: {
      eventType,
      recipientEmail: buyerEmail,
      timestamp: Date.now(),
      sendStatus: "failed",
      errorMessage: error.message,
    }
  });
}
```

---

## Data Lifecycle

### Notification Log Retention

- **No expiration**: Notification logs are kept indefinitely for audit purposes.
- **PDPA Compliance**: Logs contain only transactional data (email address, timestamps). No sensitive content. Covered by PDPA transactional exemption (research.md Q1).

### Business Settings Lifecycle

- **Default State**: `undefined` (treated as enabled).
- **User Action**: Admin explicitly sets `false` to disable.
- **Inheritance**: Settings are business-wide, inherited by all invoices in that business.

---

## Edge Cases & Error Handling

### Case 1: Buyer Email Changes After Invoice Creation

**Scenario**: Invoice created with `customerSnapshot.email = "old@example.com"`. Customer updates email to `"new@example.com"` in CRM.

**Behavior**: Notification uses **snapshot email** (`customerSnapshot.email` from invoice record), not live customer record. This ensures:
- Consistency: Notification references the email at invoice creation time
- Auditability: Log entry matches the invoice state

### Case 2: Business Settings Change Mid-Flight

**Scenario**: Invoice validated → notification triggered → admin disables setting before email sends.

**Behavior**: Notification proceeds (uses settings state at trigger time). This avoids race conditions and ensures consistent behavior.

### Case 3: SES Rate Limit Exceeded

**Scenario**: Business sends 100 invoices in burst → SES throttles.

**Behavior**:
- Log with `sendStatus: "failed"`, `errorMessage: "SES rate limit exceeded"`
- **No automatic retry** per spec (edge case: "No automatic retry for transactional notifications")
- Admin can manually resend via UI (future feature)

### Case 4: Buyer Email Bounces (Hard Bounce)

**Scenario**: Email sent successfully (SES accepts) but later bounces.

**Behavior**:
- Log shows `sendStatus: "sent"`, `sesMessageId: "..."` (initial send succeeded)
- SES bounce webhook (if configured) could trigger a follow-up action (future feature)
- Current implementation: No bounce handling (acceptable for v1)

---

## Queries & Indexes

### No New Indexes Required

Notification log queries are **always scoped to a single invoice** (loaded by `invoiceId`). No cross-invoice queries needed.

**Example Queries**:
```typescript
// Idempotency check (in-memory after invoice load)
const alreadySent = invoice.buyerNotificationLog?.some(
  entry => entry.eventType === "validation" && entry.sendStatus === "sent"
);

// Debugging: Get all failed notifications for an invoice
const failures = invoice.buyerNotificationLog?.filter(
  entry => entry.sendStatus === "failed"
);
```

---

## Migration Checklist

When deploying schema changes:

- [ ] **Add `buyerNotificationLog` field to `sales_invoices` table** (optional array)
- [ ] **Add `einvoiceNotifyBuyerOnValidation` field to `businesses` table** (optional boolean)
- [ ] **Add `einvoiceNotifyBuyerOnCancellation` field to `businesses` table** (optional boolean)
- [ ] **Run `npx convex dev`** (auto-applies schema in dev environment)
- [ ] **Run `npx convex deploy --yes`** (apply schema to production)
- [ ] **Verify schema migration** (check Convex dashboard for new fields)
- [ ] **Test idempotency** (send notification twice, verify second attempt skipped)
- [ ] **Test settings toggles** (disable notification, verify skip with correct reason)

---

## Related Files

- **Schema definition**: `convex/schema.ts`
- **Validation logic**: `convex/lib/buyer-notification-helper.ts` (new)
- **Log append mutation**: `convex/functions/salesInvoices.ts` (extend with `appendNotificationLog`)
- **Settings UI**: `src/domains/account-management/components/business-settings-section.tsx` (new section)

---

**Data Model Complete** — Schema extensions, validation rules, and idempotency logic fully specified. Ready for contract definition (Phase 1 next step).
