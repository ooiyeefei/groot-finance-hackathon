# API Contracts: Convex Functions

**Date**: 2026-02-14 | **Branch**: `014-stripe-catalog-sync`

This project uses Convex (not REST APIs). All client-server interactions are Convex queries, mutations, and actions.

---

## Module: `convex/functions/stripeIntegrations.ts`

### Query: `getConnection`

Returns the Stripe connection status for a business (never exposes the secret key).

```typescript
getConnection(args: {
  businessId: Id<"businesses">
}) → {
  status: "connected" | "disconnected" | null  // null = never connected
  stripeAccountName?: string
  stripeAccountId?: string
  connectedAt?: number
  lastSyncAt?: number
} | null
```

**Access**: owner, finance_admin, manager

---

### Action: `connect`

Validates a Stripe secret key and stores the connection.

```typescript
connect(args: {
  businessId: Id<"businesses">
  stripeSecretKey: string  // sk_live_... or sk_test_...
}) → {
  success: boolean
  accountName?: string
  accountId?: string
  error?: string
}
```

**Access**: owner only
**Side effects**: Creates/updates `stripe_integrations` record, sets status to `connected`
**Validation**: Calls `stripe.account.retrieve()` to validate key

---

### Mutation: `disconnect`

Removes the Stripe connection for a business.

```typescript
disconnect(args: {
  businessId: Id<"businesses">
}) → void
```

**Access**: owner only
**Side effects**: Sets integration status to `disconnected`, clears `stripeSecretKey`

---

## Module: `convex/functions/catalogItems.ts` (extended)

### Action: `syncFromStripe`

Triggers a full catalog sync from the connected Stripe account.

```typescript
syncFromStripe(args: {
  businessId: Id<"businesses">
}) → {
  success: boolean
  syncLogId: Id<"sync_logs">
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: string[]
}
```

**Access**: owner, finance_admin, manager
**Side effects**:
- Creates a `sync_logs` entry (status: running)
- Fetches all active Stripe products with expanded default_price
- Upserts catalog items (matched by stripeProductId)
- Deactivates items not found in Stripe (unless locallyDeactivated)
- Updates sync log with final counts and status
- Updates `stripe_integrations.lastSyncAt`

---

### Query: `getSyncProgress`

Returns the current sync progress for real-time UI updates.

```typescript
getSyncProgress(args: {
  businessId: Id<"businesses">
}) → {
  status: "running" | "completed" | "partial" | "failed" | null
  total: number
  processed: number
  message: string
} | null
```

**Access**: owner, finance_admin, manager

---

### Mutation: `restoreFromStripe`

Re-activates a locally deactivated synced item and refreshes it from Stripe.

```typescript
restoreFromStripe(args: {
  id: Id<"catalog_items">
  businessId: Id<"businesses">
}) → void
```

**Access**: owner, finance_admin, manager
**Precondition**: Item must have `source === "stripe"` and `locallyDeactivated === true`
**Side effects**: Clears `locallyDeactivated`, sets status to `active`

---

### Query: `list` (extended)

Existing query gains optional `source` filter parameter.

```typescript
list(args: {
  businessId: Id<"businesses">
  status?: "active" | "inactive"
  category?: string
  search?: string
  source?: "manual" | "stripe"  // NEW
  limit?: number
}) → CatalogItem[]
```

---

### Mutation: `deactivate` (extended)

Existing mutation gains `locallyDeactivated` flag behavior.

```typescript
deactivate(args: {
  id: Id<"catalog_items">
  businessId: Id<"businesses">
}) → void
```

**New behavior**: If the item has `source === "stripe"`, also sets `locallyDeactivated = true`.

---

## Module: `convex/functions/syncLogs.ts` (new, optional for P2)

### Query: `listByBusiness`

Returns recent sync logs for a business.

```typescript
listByBusiness(args: {
  businessId: Id<"businesses">
  limit?: number  // default 10
}) → SyncLog[]
```

**Access**: owner, finance_admin, manager
