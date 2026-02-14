# Data Model: Stripe Product Catalog Sync

**Date**: 2026-02-14 | **Branch**: `014-stripe-catalog-sync`

## New Tables

### `stripe_integrations`

Stores per-business Stripe connection credentials and metadata.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | Reference (`businesses`) | Yes | One integration per business |
| `stripeSecretKey` | String | Yes | Stripe secret API key (server-side only, never exposed to client) |
| `stripeAccountId` | String | Yes | Stripe account ID (e.g., `acct_1234`) |
| `stripeAccountName` | String | No | Display name from Stripe account |
| `status` | Enum: `connected`, `disconnected` | Yes | Current connection state |
| `connectedAt` | Number (timestamp) | Yes | When the integration was established |
| `disconnectedAt` | Number (timestamp) | No | When disconnected (if applicable) |
| `lastSyncAt` | Number (timestamp) | No | Last successful sync timestamp |
| `createdBy` | String | Yes | Clerk user ID of the owner who connected |

**Indexes**:
- `by_businessId` on `[businessId]` — lookup by business (unique per business)

**Security constraints**:
- `stripeSecretKey` is NEVER returned by public queries
- Only internal actions/mutations read the key field
- Public queries return: `stripeAccountName`, `status`, `connectedAt`, `lastSyncAt`

---

### `sync_logs`

Records each sync operation for audit and debugging.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | Reference (`businesses`) | Yes | Which business triggered the sync |
| `startedAt` | Number (timestamp) | Yes | When the sync started |
| `completedAt` | Number (timestamp) | No | When the sync finished |
| `status` | Enum: `running`, `completed`, `partial`, `failed` | Yes | Sync outcome |
| `productsCreated` | Number | Yes | Count of new catalog items created |
| `productsUpdated` | Number | Yes | Count of existing items updated |
| `productsDeactivated` | Number | Yes | Count of items deactivated (archived in Stripe) |
| `productsSkipped` | Number | Yes | Count of locally deactivated items skipped |
| `totalStripeProducts` | Number | Yes | Total products fetched from Stripe |
| `errors` | Array of Strings | No | Error messages encountered during sync |
| `triggeredBy` | String | Yes | Clerk user ID of the user who triggered sync |

**Indexes**:
- `by_businessId` on `[businessId]` — list sync history for a business

---

## Extended Table: `catalog_items`

New fields added to the existing `catalog_items` table.

| New Field | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `source` | Enum: `manual`, `stripe` | No | `undefined` (treated as `manual`) | Where this item originated |
| `stripeProductId` | String | No | - | Stripe product ID (e.g., `prod_abc123`) |
| `stripePriceId` | String | No | - | Stripe price ID used for unit price |
| `lastSyncedAt` | Number (timestamp) | No | - | When this item was last synced from Stripe |
| `locallyDeactivated` | Boolean | No | `false` | User manually deactivated this synced item; sync respects this flag |

**New indexes**:
- `by_businessId_stripeProductId` on `[businessId, stripeProductId]` — lookup synced items by Stripe product ID for upsert matching

**Backward compatibility**: All new fields are optional. Existing catalog items with no `source` field are treated as `manual`. No migration needed.

---

## Transient Document: Sync Progress

Written during sync for real-time progress feedback. Not a permanent table — can reuse a single document per business.

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | Reference (`businesses`) | Which business is syncing |
| `total` | Number | Total products to process |
| `processed` | Number | Products processed so far |
| `status` | Enum: `running`, `completed`, `failed` | Current sync state |
| `message` | String | Human-readable status (e.g., "Syncing 45 of 120 products...") |

This can be stored in the `sync_logs` table (the current running sync log entry) rather than requiring a separate table.

---

## Entity Relationships

```
businesses (1) ──── (0..1) stripe_integrations
businesses (1) ──── (0..N) catalog_items
businesses (1) ──── (0..N) sync_logs

stripe_integrations.businessId → businesses._id
catalog_items.businessId → businesses._id
catalog_items.stripeProductId → Stripe Product (external)
sync_logs.businessId → businesses._id
```

## State Transitions

### Stripe Integration Status
```
(none) → connected    [user enters valid key]
connected → disconnected  [user clicks disconnect]
disconnected → connected  [user enters new key]
```

### Catalog Item Sync States
```
(new from Stripe) → active + source=stripe             [initial sync]
active + source=stripe → updated (active)               [re-sync, data changed in Stripe]
active + source=stripe → inactive (Stripe archived)     [re-sync, product archived]
active + source=stripe → inactive + locallyDeactivated  [user deactivates locally]
inactive + locallyDeactivated → active                  [user clicks "Restore from Stripe"]
```

### Sync Log Status
```
running → completed  [all products processed successfully]
running → partial    [some products failed, rest succeeded]
running → failed     [critical error, e.g., auth failure]
```
