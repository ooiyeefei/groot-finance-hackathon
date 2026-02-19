# Data Model: Usage Tracking

**Branch**: `001-usage-tracking`
**Date**: 2026-02-19
**Database**: Convex (document store)

## New Tables

### `ai_message_usage`

Tracks AI chat message consumption per-business per-calendar-month. Mirrors the existing `ocr_usage` table pattern.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `Id<"businesses">` | Yes | Reference to the owning business |
| `month` | `string` | Yes | Calendar month key in `"YYYY-MM"` format |
| `messagesUsed` | `number` | Yes | Count of AI messages sent this month |
| `planLimit` | `number` | Yes | Plan limit snapshot at record creation (-1 = unlimited) |
| `updatedAt` | `number` | No | Millisecond timestamp of last update |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_month` → `["businessId", "month"]` (primary lookup)

**Lifecycle**: Created lazily on first AI message of the month. No explicit reset — a new month starts with no record (treated as zero usage).

---

### `einvoice_usage`

Tracks LHDN e-invoice submissions per-business per-calendar-month.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `Id<"businesses">` | Yes | Reference to the owning business |
| `month` | `string` | Yes | Calendar month key in `"YYYY-MM"` format |
| `submissionsUsed` | `number` | Yes | Count of e-invoices submitted this month |
| `planLimit` | `number` | Yes | Plan limit snapshot at record creation (-1 = unlimited) |
| `updatedAt` | `number` | No | Millisecond timestamp of last update |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_month` → `["businessId", "month"]` (primary lookup)

**Lifecycle**: Same as `ai_message_usage` — lazy creation on first submission.

---

### `credit_packs`

Represents purchased credit pack bundles with 90-day expiry and FIFO consumption.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `Id<"businesses">` | Yes | Reference to the owning business |
| `packType` | `string` | Yes | `"ai_credits"` or `"ocr_credits"` |
| `packName` | `string` | Yes | Display name: `"boost"`, `"power"`, or `"extra_ocr"` |
| `totalCredits` | `number` | Yes | Credits at purchase (50, 150, or 100) |
| `creditsUsed` | `number` | Yes | Credits consumed so far |
| `creditsRemaining` | `number` | Yes | `totalCredits - creditsUsed` |
| `purchasedAt` | `number` | Yes | Millisecond timestamp of purchase |
| `expiresAt` | `number` | Yes | Millisecond timestamp: `purchasedAt + 90 days` |
| `status` | `string` | Yes | `"active"`, `"depleted"`, or `"expired"` |
| `stripePaymentIntentId` | `string` | No | Stripe payment reference for audit |
| `stripeSessionId` | `string` | No | Stripe checkout session ID for idempotency |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_packType` → `["businessId", "packType"]`
- `by_businessId_status` → `["businessId", "status"]`
- `by_status_expiresAt` → `["status", "expiresAt"]` (for daily expiry cron)

**State Transitions**:
```
active → depleted  (when creditsRemaining reaches 0)
active → expired   (when current time >= expiresAt, via daily cron)
```

No reverse transitions. Depleted and expired are terminal states.

**FIFO Consumption**: When consuming from credit packs, query active packs for the business ordered by `purchasedAt` ascending, and deduct from the oldest pack first.

---

## Modified Tables

### `businesses` (existing)

No schema changes required. The `planName` and `subscriptionStatus` fields already provide the information needed to resolve plan limits.

Relevant existing fields:
- `planName`: `"trial"` | `"starter"` | `"pro"` | `"enterprise"`
- `subscriptionStatus`: `"trialing"` | `"active"` | `"past_due"` | `"canceled"` | `"incomplete"`
- `stripeSubscriptionId`: Reference to Stripe subscription
- `stripeCustomerId`: Reference to Stripe customer

### `sales_invoices` (existing — read only)

No schema changes. Sales invoice count is derived by querying this table filtered by `businessId` and `_creationTime` within the current calendar month. The existing `by_businessId` index supports this query.

### `messages` (existing — read only)

No schema changes. The `messages` table tracks individual chat messages. However, we use a dedicated `ai_message_usage` counter table rather than counting messages each time (avoiding expensive full-table scans on every pre-flight check).

---

## Entity Relationships

```
businesses (1) ──── (*) ai_message_usage     [per month]
businesses (1) ──── (*) einvoice_usage        [per month]
businesses (1) ──── (*) credit_packs          [per purchase]
businesses (1) ──── (*) sales_invoices        [derived count]
businesses (1) ──── (*) ocr_usage             [existing, per month]
```

## Validation Rules

- `month` must match pattern `"YYYY-MM"` (e.g., `"2026-02"`)
- `planLimit` must be >= -1 (where -1 means unlimited)
- `messagesUsed` and `submissionsUsed` must be >= 0
- `creditsRemaining` must equal `totalCredits - creditsUsed`
- `creditsRemaining` must be >= 0
- `expiresAt` must equal `purchasedAt + (90 * 24 * 60 * 60 * 1000)`
- `status` transitions are one-way: `active → depleted` or `active → expired`
- `packType` must be one of `"ai_credits"` or `"ocr_credits"`
- `packName` must be one of `"boost"`, `"power"`, or `"extra_ocr"`
