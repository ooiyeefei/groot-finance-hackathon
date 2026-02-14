# Feature Specification: Stripe Product Catalog Sync

**Feature Branch**: `014-stripe-catalog-sync`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Sync product catalog from Stripe to FinanSEAL. Store Stripe API key, connect via button, pull products/prices into existing catalog. Manual items remain independent."

## Clarifications

### Session 2026-02-14

- Q: If a user locally deactivates a Stripe-synced catalog item, should the next sync re-activate it (because it's still active in Stripe)? → A: Respect local deactivation — item stays inactive on re-sync. A "restore from Stripe" action can undo this.
- Q: When a user disconnects Stripe and later reconnects (possibly a different account), what happens to previously synced catalog items? → A: Orphan and re-link — items keep their data but lose Stripe link. On reconnect, items are re-matched by Stripe product ID if same account. Unmatched items remain as independent catalog entries.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Stripe Account (Priority: P1)

A business owner or finance admin navigates to Business Settings and connects their Stripe account by entering their Stripe Secret API key. The system validates the key by making a test call to Stripe, then stores it securely. A "Connected" status indicator confirms the link is active.

**Why this priority**: Without a valid connection, no sync is possible. This is the foundational step.

**Independent Test**: Can be fully tested by entering a Stripe test-mode API key (`sk_test_...`) and verifying the system accepts it, displays a connected status, and can be disconnected.

**Acceptance Scenarios**:

1. **Given** a business with no Stripe connection, **When** the owner enters a valid Stripe Secret API key and clicks "Connect", **Then** the system validates the key against Stripe, stores it, and shows a "Connected" status with the Stripe account display name.
2. **Given** a business with no Stripe connection, **When** the owner enters an invalid or revoked key, **Then** the system shows a clear error message ("Invalid API key" or "Key has been revoked") and does not store it.
3. **Given** a business with an active Stripe connection, **When** the owner clicks "Disconnect", **Then** the stored key is removed and the status reverts to "Not connected". Existing synced catalog items remain but are no longer linked to Stripe.

---

### User Story 2 - Sync Product Catalog from Stripe (Priority: P1)

A finance admin with an active Stripe connection navigates to the Product Catalog page and clicks "Sync from Stripe". The system fetches all active products and their default prices from Stripe, maps them to catalog items, and upserts them into the catalog. New products are created, existing synced products are updated, and products deleted/archived in Stripe are deactivated locally. Manually created catalog items are left untouched. Items that a user has locally deactivated are skipped during sync (their local deactivation is respected).

**Why this priority**: This is the core value of the feature — pulling Stripe's product catalog into FinanSEAL so users don't maintain data in two places.

**Independent Test**: Can be tested by creating 3-5 products in Stripe (with various prices and currencies), clicking "Sync from Stripe", and verifying they appear in the catalog with correct names, prices, and currencies.

**Acceptance Scenarios**:

1. **Given** a connected Stripe account with 5 active products (each with a default price), **When** the user clicks "Sync from Stripe", **Then** all 5 products appear in the catalog with correct name, description, unit price (converted from smallest currency unit to decimal), currency, and unit label.
2. **Given** a catalog with 3 previously synced Stripe products, **When** one product's name and price are updated in Stripe and user syncs, **Then** the local catalog item is updated to match the new Stripe data.
3. **Given** a catalog with a previously synced product that has since been archived in Stripe, **When** user syncs, **Then** the local catalog item status is set to "inactive".
4. **Given** a catalog with 2 manually created items and 3 Stripe-synced items, **When** user syncs, **Then** only the 3 Stripe-synced items are updated; the 2 manual items remain unchanged.
5. **Given** a Stripe product with no default price set, **When** user syncs, **Then** the product is still imported with price set to 0 and a visual indicator that the price needs to be set.
6. **Given** a synced catalog item that the user has locally deactivated, **When** the user syncs and the product is still active in Stripe, **Then** the item remains inactive locally (local deactivation is respected).
7. **Given** a locally deactivated synced item, **When** the user clicks "Restore from Stripe" on that item, **Then** the item is re-activated and updated with the latest Stripe data.

---

### User Story 3 - View Sync Status and Source (Priority: P2)

On the Product Catalog page, the user can distinguish between manually created items and Stripe-synced items. Synced items show a small Stripe badge/icon and the last sync timestamp. The user can filter the catalog by source (All / Manual / Stripe).

**Why this priority**: Visibility into which items are managed by Stripe vs locally is important for ongoing catalog management, but not required for initial sync functionality.

**Independent Test**: Can be tested by having a mix of manual and synced items, verifying badges appear on synced items, and filtering works correctly.

**Acceptance Scenarios**:

1. **Given** a catalog with both manual and Stripe-synced items, **When** viewing the catalog list, **Then** Stripe-synced items display a Stripe icon/badge and "Last synced: [timestamp]".
2. **Given** a catalog with mixed-source items, **When** the user filters by "Stripe", **Then** only Stripe-synced items are shown.
3. **Given** a catalog with mixed-source items, **When** the user filters by "Manual", **Then** only manually created items are shown.

---

### User Story 4 - Edit Synced Items Locally (Priority: P3)

A user can edit a Stripe-synced catalog item locally (e.g., adding a SKU, adjusting tax rate, or changing the category). Local edits are preserved and not overwritten on the next sync for fields that are not managed by Stripe (SKU, tax rate, category, unit measurement). Stripe-managed fields (name, description, price, currency, active status) are always overwritten from Stripe on sync.

**Why this priority**: Allows users to enrich Stripe product data with local-only fields (like SKU codes or tax rates specific to their region) without those being lost on re-sync.

**Independent Test**: Can be tested by syncing a product, adding a local SKU and tax rate, re-syncing, and verifying the SKU and tax rate are preserved while name/price update from Stripe.

**Acceptance Scenarios**:

1. **Given** a synced catalog item with a locally added SKU and tax rate, **When** the user syncs again and the Stripe product's name has changed, **Then** the name updates from Stripe but SKU and tax rate remain as locally set.
2. **Given** a synced catalog item, **When** the user edits the name locally, **Then** a warning is shown that this field will be overwritten on the next Stripe sync.

---

### Edge Cases

- What happens when the Stripe API key expires or is revoked between syncs? The sync should fail gracefully with a clear message prompting the user to re-enter a valid key.
- What happens when a Stripe account has 1,000+ products? The sync should paginate through all products using Stripe's auto-pagination and show progress feedback.
- What happens when two products in Stripe have the same name? They are treated as separate catalog items, each linked by their unique Stripe product ID.
- What happens during a sync if the network drops mid-way? Partial results are committed (items synced so far are saved), and the user is notified to retry for remaining items.
- What happens if the same Stripe account is connected to multiple businesses? Each business maintains its own independent copy of the catalog items.
- What happens when a Stripe product has multiple prices? The system uses the product's default price. If no default price is set, the first active one-time price is used. If only recurring prices exist, the per-unit amount of the first active recurring price is used.
- What happens when a user locally deactivates a synced item and then syncs? The local deactivation is respected — the item stays inactive. The user can explicitly "Restore from Stripe" to re-activate and re-sync it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a business owner or finance admin to store a Stripe Secret API key per business, encrypted at rest.
- **FR-002**: System MUST validate the Stripe API key on entry by making a test call (e.g., retrieving the account info) and display the connected account name.
- **FR-003**: System MUST allow disconnecting the Stripe integration, which removes the stored key but preserves existing synced catalog items.
- **FR-004**: System MUST provide a "Sync from Stripe" action on the Product Catalog page that fetches all products and their prices from the connected Stripe account.
- **FR-005**: System MUST map Stripe product fields to catalog item fields: `product.name` to name, `product.description` to description, `price.unit_amount` (converted from cents to decimal) to unit price, `price.currency` to currency, `product.unit_label` to unit measurement, `product.active` to status.
- **FR-006**: System MUST track the source of each catalog item (manual or Stripe) and store the Stripe product ID for synced items.
- **FR-007**: System MUST upsert catalog items on sync — create new items for new Stripe products, update existing items for previously synced products (matched by Stripe product ID).
- **FR-008**: System MUST deactivate catalog items whose corresponding Stripe product has been archived or deleted.
- **FR-009**: System MUST NOT modify manually created catalog items during sync.
- **FR-010**: System MUST preserve locally-set fields (SKU, tax rate, category) on Stripe-synced items during re-sync.
- **FR-011**: System MUST handle Stripe API pagination to sync catalogs with large product counts (100+ products).
- **FR-012**: System MUST display sync progress feedback during the operation (e.g., "Syncing 45 of 120 products...").
- **FR-013**: System MUST show the last successful sync timestamp on the catalog page.
- **FR-014**: System MUST restrict Stripe connection management to business owner role only.
- **FR-015**: System MUST restrict sync execution to finance admin, manager, or owner roles (matching existing catalog permissions).
- **FR-016**: System MUST respect local deactivation of synced items — if a user deactivates a Stripe-synced catalog item, subsequent syncs MUST NOT re-activate it.
- **FR-017**: System MUST provide a "Restore from Stripe" action on locally deactivated synced items that re-activates the item and updates it with the latest Stripe data.

### Key Entities

- **Stripe Integration**: A per-business record storing the encrypted Stripe API key, connected account name, connection status, and timestamps. One integration per business.
- **Catalog Item** (extended): The existing `catalog_items` entity gains source tracking (manual vs Stripe), Stripe product ID reference, Stripe price ID reference, last synced timestamp, and a local override flag to track user-initiated deactivations distinct from Stripe-driven deactivations.
- **Sync Log**: A record of each sync operation — business ID, timestamp, products created/updated/deactivated/skipped counts, errors encountered, and sync status (success/partial/failed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect a Stripe account and complete their first catalog sync in under 2 minutes.
- **SC-002**: Sync accurately maps 100% of active Stripe products (with prices) to catalog items with correct names, prices, and currencies.
- **SC-003**: Re-syncing a 100-product catalog completes within 30 seconds.
- **SC-004**: Manually created catalog items are never modified by sync operations (zero unintended overwrites).
- **SC-005**: Users can clearly distinguish Stripe-synced items from manual items in the catalog view.
- **SC-006**: After initial sync, users no longer need to manually duplicate product data between Stripe and FinanSEAL.

## Assumptions

- Stripe is the authoritative source of truth for product and pricing data. Sync is one-way: Stripe to FinanSEAL.
- Each business connects at most one Stripe account.
- The Stripe Secret API key (starting with `sk_live_` or `sk_test_`) provides sufficient permissions to read products and prices. No OAuth/Stripe Connect flow is needed for the initial implementation.
- Products in Stripe have at most one "primary" price relevant for invoicing (the default price). Complex multi-price scenarios are out of scope.
- The sync is triggered manually by the user (no automatic periodic sync in the initial implementation).
- Stripe's product API rate limits (100 reads/sec in live mode) are sufficient for our use case and unlikely to be hit during a catalog sync.
- When a user disconnects Stripe, previously synced catalog items become orphaned — they retain their data but lose their Stripe link. If the user reconnects (same or different account), a fresh sync re-links items by Stripe product ID where matches exist.
