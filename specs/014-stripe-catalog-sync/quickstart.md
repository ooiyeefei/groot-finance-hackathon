# Quickstart: Stripe Product Catalog Sync

**Branch**: `014-stripe-catalog-sync`

## Prerequisites

- Stripe test-mode secret key (`sk_test_...`) — get from [Stripe Dashboard > Developers > API keys](https://dashboard.stripe.com/test/apikeys)
- Some test products created in your Stripe account (with prices)
- Local dev environment running (`npm run dev` + `npx convex dev`)

## Implementation Order

### Phase 1: Schema + Backend (P1 features)

1. **Extend Convex schema** (`convex/schema.ts`)
   - Add `stripe_integrations` table
   - Add `sync_logs` table
   - Add new fields to `catalog_items` table (`source`, `stripeProductId`, `stripePriceId`, `lastSyncedAt`, `locallyDeactivated`)
   - Add new index `by_businessId_stripeProductId` on `catalog_items`

2. **Create `convex/functions/stripeIntegrations.ts`**
   - `getConnection` query (public, returns sanitized view)
   - `connect` action (validates key via `stripe.account.retrieve()`, stores in DB)
   - `disconnect` mutation (clears key, sets status)

3. **Extend `convex/functions/catalogItems.ts`**
   - `syncFromStripe` action (the core sync logic)
   - `getSyncProgress` query (for real-time progress)
   - `restoreFromStripe` mutation
   - Extend `list` query with `source` filter
   - Extend `deactivate` mutation with `locallyDeactivated` flag

### Phase 2: Frontend (P1 features)

4. **Business Settings — Integrations tab**
   - New "Integrations" tab in tabbed business settings
   - Stripe connection card: API key input, Connect/Disconnect buttons, status display

5. **Catalog page — Sync button + progress**
   - "Sync from Stripe" button (shown when connected)
   - Real-time progress bar during sync
   - Last synced timestamp display

### Phase 3: Catalog UI Enhancements (P2-P3)

6. **Source badges and filtering**
   - Stripe icon badge on synced items
   - Source filter dropdown (All / Manual / Stripe)

7. **Restore from Stripe action**
   - Action menu item on deactivated synced items
   - Stripe-managed field edit warning

## Testing Checklist

- [ ] Connect with valid `sk_test_` key — shows account name
- [ ] Connect with invalid key — shows error, doesn't store
- [ ] Disconnect — status reverts, catalog items preserved
- [ ] Sync 5 products — all appear with correct name/price/currency
- [ ] Modify a product in Stripe, re-sync — catalog updates
- [ ] Archive a product in Stripe, re-sync — catalog item deactivated
- [ ] Manually deactivate a synced item, re-sync — stays deactivated
- [ ] "Restore from Stripe" on deactivated item — re-activates
- [ ] Sync with 0 products — shows "No products found"
- [ ] Manual catalog items unchanged after sync

## Key Files

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Schema extensions |
| `convex/functions/stripeIntegrations.ts` | Connection management |
| `convex/functions/catalogItems.ts` | Sync logic + extended CRUD |
| `src/domains/sales-invoices/hooks/use-stripe-integration.ts` | React hooks for connection + sync |
| `src/domains/account-management/components/stripe-integration-card.tsx` | Settings UI |
| `src/domains/sales-invoices/components/catalog-item-manager.tsx` | Extended catalog UI |
