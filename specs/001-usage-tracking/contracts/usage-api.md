# API Contracts: Usage Tracking

**Branch**: `001-usage-tracking`
**Date**: 2026-02-19

## 1. Extended Subscription API

### `GET /api/v1/billing/subscription`

Extends the existing endpoint to include all usage types and credit packs.

**Authentication**: Required (Clerk JWT)

**Response** (extended fields marked with `+`):

```json
{
  "success": true,
  "data": {
    "plan": { "..." },
    "subscription": { "..." },
    "usage": {
      "ocrUsed": 80,
      "ocrLimit": 150,
      "ocrRemaining": 70,
      "ocrPercentage": 53.3,
      "isUnlimited": false,
      "+aiMessagesUsed": 20,
      "+aiMessagesLimit": 30,
      "+aiMessagesRemaining": 10,
      "+aiMessagesPercentage": 66.7,
      "+aiMessagesIsUnlimited": false,
      "+salesInvoicesUsed": 5,
      "+salesInvoicesLimit": 10,
      "+salesInvoicesRemaining": 5,
      "+salesInvoicesPercentage": 50.0,
      "+salesInvoicesIsUnlimited": false,
      "+einvoicesUsed": 45,
      "+einvoicesLimit": 100,
      "+einvoicesRemaining": 55,
      "+einvoicesPercentage": 45.0,
      "+einvoicesIsUnlimited": false
    },
    "+creditPacks": [
      {
        "id": "pack_abc123",
        "packType": "ai_credits",
        "packName": "boost",
        "totalCredits": 50,
        "creditsUsed": 10,
        "creditsRemaining": 40,
        "purchasedAt": "2026-02-01T00:00:00Z",
        "expiresAt": "2026-05-02T00:00:00Z",
        "status": "active"
      }
    ],
    "trial": { "..." },
    "renewal": { "..." },
    "business": { "..." }
  }
}
```

---

## 2. Convex Functions: AI Message Usage

### `query: aiMessageUsage.getCurrentUsage`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ month, messagesUsed, planLimit, remaining, percentUsed } | null`
**Auth**: Business member

### `query: aiMessageUsage.hasCredits`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `boolean` (true if plan + credit packs have remaining allocation)
**Auth**: Business member

### `mutation: aiMessageUsage.recordUsage`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ usageId, messagesUsed, remaining }`
**Auth**: Business member
**Side effects**: Increments counter; creates monthly record if first use

### `internalMutation: aiMessageUsage.checkAndRecord`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ allowed: boolean, source: "plan" | "credit_pack" | "unlimited", remaining: number }`
**Auth**: Internal (server-to-server)
**Behavior**: Atomic check-and-increment. If plan limit reached, attempts credit pack consumption (FIFO). Returns whether the action was allowed and the source of the allocation.

---

## 3. Convex Functions: E-Invoice Usage

### `query: einvoiceUsage.getCurrentUsage`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ month, submissionsUsed, planLimit, remaining, percentUsed } | null`
**Auth**: Business member

### `mutation: einvoiceUsage.recordUsage`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ usageId, submissionsUsed, remaining }`
**Auth**: Business member

### `internalMutation: einvoiceUsage.checkAndRecord`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ allowed: boolean, remaining: number }`
**Auth**: Internal
**Behavior**: Atomic check-and-increment. E-invoices do not have credit pack support — only plan allocation.

---

## 4. Convex Functions: Sales Invoice Usage

### `query: salesInvoiceUsage.getCurrentCount`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `{ month, count, planLimit, remaining, percentUsed }`
**Auth**: Business member
**Behavior**: Counts from `sales_invoices` table (no separate counter). Queries `sales_invoices` where `businessId` matches and `_creationTime` falls within the current calendar month.

### `query: salesInvoiceUsage.canCreate`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: `boolean`
**Auth**: Business member
**Behavior**: Returns `count < planLimit` or `planLimit === -1`.

---

## 5. Convex Functions: Credit Packs

### `query: creditPacks.getActivePacks`

**Args**: `{ businessId: Id<"businesses"> }`
**Returns**: Array of active credit packs sorted by `purchasedAt` ascending (FIFO order)
**Auth**: Business member

### `query: creditPacks.getActiveCredits`

**Args**: `{ businessId: Id<"businesses">, packType: "ai_credits" | "ocr_credits" }`
**Returns**: `{ totalRemaining: number, packs: Array<{ id, creditsRemaining, expiresAt }> }`
**Auth**: Business member

### `internalMutation: creditPacks.consumeCredit`

**Args**: `{ businessId: Id<"businesses">, packType: "ai_credits" | "ocr_credits", credits: number }`
**Returns**: `{ consumed: boolean, packId: Id<"credit_packs">, remaining: number }`
**Auth**: Internal
**Behavior**: Finds oldest active pack of the given type. Deducts credits. Marks as "depleted" if remaining reaches 0.

### `internalMutation: creditPacks.createFromPurchase`

**Args**: `{ businessId: Id<"businesses">, packType, packName, totalCredits, stripePaymentIntentId?, stripeSessionId? }`
**Returns**: `Id<"credit_packs">`
**Auth**: Internal (called from Stripe webhook handler)

### `internalMutation: creditPacks.expireDaily`

**Args**: None
**Returns**: `{ expired: number }` (count of packs expired)
**Auth**: Internal (called from cron)
**Behavior**: Queries all active packs where `expiresAt <= now`. Sets status to "expired".

---

## 6. Pre-flight Check Contract

### AI Chat Pre-flight (API Route Level)

**Location**: `src/app/api/copilotkit/route.ts`

```
1. Resolve businessId from authenticated user
2. Call aiMessageUsage.checkAndRecord({ businessId })
3. If { allowed: false } → return 429 with limit message
4. If check throws (transient failure) → log error, proceed (fail-open)
5. Proceed to CopilotKit handler
```

### Sales Invoice Pre-flight (Convex Mutation Level)

**Location**: `convex/functions/salesInvoices.ts` → `create()` mutation

```
1. After auth check, before validation
2. Call salesInvoiceUsage.canCreate({ businessId })
3. If false → throw Error("Sales invoice limit reached")
4. Proceed with invoice creation
```

### E-Invoice Pre-flight (Convex Mutation Level)

**Location**: Future e-invoice submission mutation

```
1. After auth check
2. Call einvoiceUsage.checkAndRecord({ businessId })
3. If { allowed: false } → throw Error("E-invoice limit reached")
4. Proceed with LHDN submission
```
