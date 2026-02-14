# UAT Test Cases: Stripe Product Catalog Sync

**Feature Branch**: `014-stripe-catalog-sync`
**Date**: 2026-02-14
**Tester**: Test Engineer Agent

---

## Prerequisites

### Environment Setup

1. **Convex Dev Server**: Run `npx convex dev` in a separate terminal (must have `CONVEX_DEPLOYMENT` configured in `.env.local`)
2. **Next.js Dev Server**: Run `npm run dev` — app available at `http://localhost:3000`
3. **Logged-in User**: Sign in with a user that has **owner** role on a business
4. **Stripe Test Account**: Get a test-mode secret key (`sk_test_...`) from [Stripe Dashboard > Developers > API keys](https://dashboard.stripe.com/test/apikeys)

### Stripe Test Data Setup

Before running sync tests, create the following in your Stripe test account:

1. **Product A** — "Widget Pro" with a one-time price of $29.99 USD
2. **Product B** — "Monthly Service" with a recurring price of $9.99/month USD
3. **Product C** — "Free Sample" with a price of $0.00 USD
4. **Product D** — "Multi-Currency Item" with a price of 100 MYR
5. **Product E** — "No-Price Product" — create a product with NO price attached

Optional (for archive test):
6. **Product F** — "Archive Me" with a one-time price of $5.00 USD (will be archived later)

### Pre-test Validation

- [ ] `npm run build` compiles without errors (prerender warnings about Clerk env are OK)
- [ ] Convex dev server is running and synced
- [ ] App loads at localhost:3000
- [ ] User is logged in as business owner
- [ ] Navigate to Settings page — "Integrations" tab is visible

---

## User Story 1: Connect Stripe Account

### TC-1.1: Connect with Valid Test Key

**Precondition**: No Stripe account connected (fresh state or after disconnect)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings > Integrations tab | Stripe Integration card visible with "Not Connected" status |
| 2 | Paste a valid `sk_test_...` key into the API key field | Key appears masked in the input field |
| 3 | Click "Connect" button | Button shows loading spinner |
| 4 | Wait for response | Success: Green status indicator appears with Stripe account name (e.g., "Connected to: My Test Business") |
| 5 | Verify the API key field is no longer editable or visible | Key input is hidden/replaced by connected status |

**Pass Criteria**: Status shows "Connected" with correct Stripe account name. No errors.

---

### TC-1.2: Connect with Invalid Key

**Precondition**: No Stripe account connected

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings > Integrations tab | Card shows "Not Connected" |
| 2 | Enter an obviously invalid key (e.g., `sk_test_invalid123`) | Key accepted in input |
| 3 | Click "Connect" | Button shows loading spinner |
| 4 | Wait for response | Error message displayed (e.g., "Invalid API key" or Stripe error) |
| 5 | Verify no integration record was created | Status still shows "Not Connected" |

**Pass Criteria**: Clear error message. Status remains disconnected. No partial data saved.

---

### TC-1.3: Connect with Empty Key

**Precondition**: No Stripe account connected

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Leave API key field empty | Field is empty |
| 2 | Click "Connect" | Button should be disabled OR show validation error |

**Pass Criteria**: Cannot submit empty key. Appropriate feedback shown.

---

### TC-1.4: Connect with Live Key (sk_live_)

**Precondition**: No Stripe account connected

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter a key starting with `sk_live_...` (use a real or fabricated live key prefix) | Key accepted in input |
| 2 | Click "Connect" | Connection attempt proceeds |
| 3 | Observe behavior | Should either: (a) successfully connect (live keys are valid), or (b) show warning about using test mode |

**Pass Criteria**: System handles live keys gracefully (no crash, no data corruption).

---

### TC-1.5: Disconnect Stripe Account

**Precondition**: Stripe account is connected (TC-1.1 passed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings > Integrations tab | Status shows "Connected" with account name |
| 2 | Click "Disconnect" button | Confirmation dialog appears |
| 3 | Confirm disconnection | Status reverts to "Not Connected" |
| 4 | Navigate to Catalog page | Previously synced items should still be present (NOT deleted) |
| 5 | Go back to Integrations tab | No Stripe connection shown, "Connect" flow available again |

**Pass Criteria**: Disconnection clears connection but preserves all synced catalog items.

---

### TC-1.6: Disconnect — Cancel Confirmation

**Precondition**: Stripe account is connected

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Disconnect" button | Confirmation dialog appears |
| 2 | Click "Cancel" or dismiss dialog | Dialog closes, connection remains active |

**Pass Criteria**: Accidental disconnect prevented by confirmation dialog.

---

### TC-1.7: Reconnect After Disconnect

**Precondition**: Previously connected and then disconnected (TC-1.5 completed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter same or different valid `sk_test_...` key | Key accepted |
| 2 | Click "Connect" | Connection succeeds |
| 3 | Verify status | Shows "Connected" with account name |

**Pass Criteria**: Reconnection works cleanly after disconnect. Old integration record updated (not duplicated).

---

### TC-1.8: Role-Based Access — Non-Owner Cannot Connect

**Precondition**: Logged in as a user with `manager` or `finance_admin` role (NOT owner)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings page | "Integrations" tab should NOT be visible |

**Pass Criteria**: Only owners can see and access the Integrations tab.

---

## User Story 2: Sync Product Catalog from Stripe

### TC-2.1: Initial Sync — Products Appear

**Precondition**: Stripe connected (TC-1.1), test products exist in Stripe, no previous sync

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Catalog page (Sales Invoices > Catalog) | Catalog page loads. "Sync from Stripe" button visible near "Add Item" |
| 2 | Click "Sync from Stripe" button | Button shows spinner/loading state |
| 3 | Observe progress | Progress text updates (e.g., "Syncing 3 of 5...") |
| 4 | Wait for completion | Success toast/message with counts: "Created: X, Updated: 0, Deactivated: 0" |
| 5 | Verify catalog list | All Stripe products appear with correct: name, price, currency |

**Verification checklist**:
- [ ] "Widget Pro" — $29.99 USD
- [ ] "Monthly Service" — $9.99 USD (recurring price resolved)
- [ ] "Free Sample" — $0.00 USD
- [ ] "Multi-Currency Item" — RM 100.00 MYR (or $100.00 MYR depending on formatting)
- [ ] "No-Price Product" — $0.00 (fallback to 0 when no price)

**Pass Criteria**: All Stripe products appear with accurate name, price, and currency.

---

### TC-2.2: Re-Sync — Updates Applied

**Precondition**: Initial sync completed (TC-2.1)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Stripe Dashboard | Open test products |
| 2 | Change "Widget Pro" name to "Widget Pro v2" | Save in Stripe |
| 3 | Change "Widget Pro v2" price to $39.99 | Create new price, set as default |
| 4 | Return to FinanSEAL Catalog page | Existing items still show old data |
| 5 | Click "Sync from Stripe" | Sync runs |
| 6 | Wait for completion | Toast shows "Updated: 1" (or similar count) |
| 7 | Verify "Widget Pro v2" row | Name updated to "Widget Pro v2", price updated to $39.99 |

**Pass Criteria**: Re-sync pulls updated name and price from Stripe. Other items unchanged.

---

### TC-2.3: Archived Product Deactivation

**Precondition**: "Archive Me" product exists and was synced (TC-2.1, with Product F)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Stripe Dashboard | Find "Archive Me" product |
| 2 | Archive the product in Stripe | Product archived (not visible in active products) |
| 3 | Return to FinanSEAL, click "Sync from Stripe" | Sync runs |
| 4 | Wait for completion | Toast shows "Deactivated: 1" in counts |
| 5 | Check "Archive Me" in catalog | Status changed to "inactive" / deactivated |

**Pass Criteria**: Products archived in Stripe are deactivated locally after sync.

---

### TC-2.4: Sync with Zero Products

**Precondition**: Stripe connected but account has NO active products (or new empty test account)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Sync from Stripe" | Sync runs |
| 2 | Wait for completion | Toast shows "Created: 0, Updated: 0" or "No products found" |

**Pass Criteria**: Empty sync completes gracefully without errors.

---

### TC-2.5: Sync Progress — Real-Time Updates

**Precondition**: Stripe connected with 20+ products (create test products in Stripe if needed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Sync from Stripe" | Sync starts |
| 2 | Watch the button/progress area | Progress text updates incrementally (e.g., "Syncing 20 of 45...") |
| 3 | Wait for completion | Final count shown in success message |

**Pass Criteria**: Progress updates are visible and approximately accurate during sync.

---

### TC-2.6: Concurrent Sync Prevention

**Precondition**: Stripe connected with products

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Sync from Stripe" | Sync starts, button shows loading |
| 2 | Attempt to click "Sync from Stripe" again (if not disabled) | Either: button is disabled during sync, OR second sync is rejected with error message |

**Pass Criteria**: Cannot run two syncs simultaneously. No duplicate data.

---

### TC-2.7: Sync Without Connection

**Precondition**: Stripe is NOT connected

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Catalog page | "Sync from Stripe" button should NOT be visible |

**Pass Criteria**: Sync button only appears when Stripe is connected.

---

### TC-2.8: Last Synced Timestamp

**Precondition**: At least one successful sync completed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Catalog page | "Last synced: [relative time]" visible (e.g., "Last synced: just now" or "Last synced: 2 minutes ago") |
| 2 | Wait a few minutes, refresh page | Timestamp updates to reflect time since last sync |

**Pass Criteria**: Last synced timestamp is displayed and updates correctly.

---

## User Story 3: View Sync Status and Source

### TC-3.1: Stripe Badge on Synced Items

**Precondition**: Catalog contains both manual items AND Stripe-synced items

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Catalog page | All items listed |
| 2 | Look at Stripe-synced items | Each has a small Stripe icon/badge next to the name |
| 3 | Look at manually-created items | No Stripe badge — appear as before |

**Pass Criteria**: Visual distinction between Stripe-synced and manual items via badge.

---

### TC-3.2: Source Filter — All

**Precondition**: Mixed catalog (manual + Stripe items)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure "All" source filter is selected (default) | All catalog items visible (both manual and Stripe) |
| 2 | Count total items | Should equal manual items + Stripe items |

**Pass Criteria**: Default "All" filter shows everything.

---

### TC-3.3: Source Filter — Stripe Only

**Precondition**: Mixed catalog

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click/select "Stripe" source filter | Only Stripe-synced items visible |
| 2 | Verify each visible item has Stripe badge | All shown items are from Stripe |
| 3 | Verify manual items are hidden | No manually-created items in the list |

**Pass Criteria**: Filter correctly isolates Stripe-sourced items.

---

### TC-3.4: Source Filter — Manual Only

**Precondition**: Mixed catalog

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click/select "Manual" source filter | Only manually-created items visible |
| 2 | Verify no Stripe badges on any item | All items are manual |
| 3 | Verify Stripe items are hidden | No Stripe-synced items in the list |

**Pass Criteria**: Filter correctly isolates manually-created items.

---

### TC-3.5: Source Filter Combined with Status Filter

**Precondition**: Mixed catalog with some inactive items

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set source filter to "Stripe" | Only Stripe items shown |
| 2 | Set status filter to "Active" (if available) | Only active Stripe items shown |
| 3 | Set status filter to "Inactive" | Only inactive Stripe items shown |

**Pass Criteria**: Source and status filters work together correctly.

---

### TC-3.6: Last Synced Date on Individual Items

**Precondition**: Stripe items have been synced

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Look at a Stripe-synced item row (desktop view) | "Last synced: [relative time]" displayed |
| 2 | Look at a manual item row | No "Last synced" displayed |

**Pass Criteria**: Per-item last synced date only appears on Stripe items.

---

## User Story 4: Edit Synced Items Locally

### TC-4.1: Local Fields Preserved After Re-Sync

**Precondition**: Stripe-synced item exists in catalog

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit a Stripe-synced catalog item | Edit dialog/form opens |
| 2 | Add/change SKU field (e.g., "SKU-001") | Field updated |
| 3 | Add/change tax rate (e.g., 8%) | Field updated |
| 4 | Add/change category | Field updated |
| 5 | Save the item | Changes saved |
| 6 | Click "Sync from Stripe" | Re-sync runs |
| 7 | After sync, check the same item | SKU = "SKU-001", tax rate = 8%, category preserved |
| 8 | Also verify Stripe-managed fields updated | Name, price, currency should match Stripe (if changed) |

**Pass Criteria**: Local-only fields (SKU, tax rate, category) survive re-sync. Stripe-managed fields (name, description, price, currency) update from Stripe.

---

### TC-4.2: Stripe-Managed Field Edit Warning

**Precondition**: Stripe-synced item exists

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open edit dialog for a Stripe-synced item | Edit form appears |
| 2 | Look at name, description, price, currency fields | Warning banner/message visible: "This field is managed by Stripe and will be overwritten on the next sync" |
| 3 | Local-only fields (SKU, tax rate, category) | No warning on these fields |

**Pass Criteria**: Clear warning on Stripe-managed fields that edits will be overwritten on next sync.

---

### TC-4.3: Local Deactivation Respected on Re-Sync

**Precondition**: Active Stripe-synced item in catalog, product still active in Stripe

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find a Stripe-synced active item | Item visible in catalog |
| 2 | Deactivate the item locally (via existing deactivate action) | Item status changes to inactive |
| 3 | Click "Sync from Stripe" | Sync runs |
| 4 | After sync, check the deactivated item | Item remains INACTIVE (locallyDeactivated flag respected) |
| 5 | Verify the product is still active in Stripe | Confirms sync didn't re-activate it |

**Pass Criteria**: Locally deactivated Stripe items are NOT re-activated by sync. User's deactivation choice is respected.

---

### TC-4.4: Restore from Stripe

**Precondition**: Locally deactivated Stripe-synced item (TC-4.3 completed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find the locally deactivated Stripe item | Item shows as inactive |
| 2 | Open the item's action menu | "Restore from Stripe" option visible |
| 3 | Click "Restore from Stripe" | Item status changes back to "active" |
| 4 | Verify locallyDeactivated flag cleared | Item will now be updated by future syncs |
| 5 | Click "Sync from Stripe" | Sync runs, item remains active and gets updated |

**Pass Criteria**: Restore action clears local deactivation and re-enables sync updates.

---

### TC-4.5: Restore Not Available on Non-Stripe Items

**Precondition**: Catalog has both manual and Stripe items, some deactivated

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Deactivate a manually-created item | Item deactivated |
| 2 | Open its action menu | "Restore from Stripe" option should NOT be visible |

**Pass Criteria**: Restore action only appears on Stripe-synced items with locallyDeactivated flag.

---

### TC-4.6: Restore Not Available on Active Stripe Items

**Precondition**: Active Stripe-synced item

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open action menu for an active Stripe item | "Restore from Stripe" should NOT be visible (item isn't locally deactivated) |

**Pass Criteria**: Restore only shown when both `source === "stripe"` AND `locallyDeactivated === true`.

---

## Regression Tests

### TC-R1: Manual Catalog Items Unaffected by Sync

**Precondition**: Manual items exist in catalog before any Stripe operations

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Note down all existing manual catalog items (name, price, status, SKU, etc.) | Baseline recorded |
| 2 | Connect Stripe and run full sync | Sync completes with new Stripe items |
| 3 | Compare manual items to baseline | ALL manual items identical — no fields changed |
| 4 | Disconnect Stripe | Connection cleared |
| 5 | Re-check manual items | Still identical to baseline |

**Pass Criteria**: Zero impact on manually-created catalog items from any Stripe operations.

---

### TC-R2: Create Manual Item After Stripe Sync

**Precondition**: Stripe connected and synced

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Item" to create a manual catalog item | Creation form opens |
| 2 | Fill in details (name, price, etc.) and save | Item created successfully |
| 3 | Verify new item has NO Stripe badge | Source is "manual" (default) |
| 4 | Run "Sync from Stripe" | Sync completes |
| 5 | Verify manually created item is unchanged | No impact from sync |

**Pass Criteria**: Manual item creation still works normally alongside Stripe sync.

---

### TC-R3: Edit Manual Item After Stripe Sync

**Precondition**: Manual item exists alongside Stripe items

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit a manual catalog item | Edit form opens — NO "managed by Stripe" warning |
| 2 | Change name and price | Saves successfully |
| 3 | Run "Sync from Stripe" | Sync completes |
| 4 | Verify manual item retains your edits | Name and price as you set them |

**Pass Criteria**: Manual items fully editable and not overwritten by sync.

---

### TC-R4: Existing Invoice Line Items Not Affected

**Precondition**: Invoices exist that reference catalog items

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create/find an invoice using a catalog item | Invoice has line items |
| 2 | Run Stripe sync | Sync completes |
| 3 | Open the same invoice | Line items unchanged (invoices snapshot item data) |

**Pass Criteria**: Existing invoices are not affected by catalog sync changes.

---

## Edge Cases

### TC-E1: Very Long Product Name from Stripe

**Precondition**: Create a Stripe product with a very long name (200+ characters)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sync from Stripe | Item synced |
| 2 | Verify display in catalog | Name truncated or wrapped gracefully (no layout break) |

---

### TC-E2: Product with Special Characters

**Precondition**: Create Stripe product with name containing: `& < > " ' / \ emoji`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sync from Stripe | Item synced |
| 2 | Verify display | Special characters rendered correctly, no XSS or encoding issues |

---

### TC-E3: Large Catalog Sync (50+ Products)

**Precondition**: Stripe account with 50+ active products

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Sync from Stripe" | Sync starts with progress updates |
| 2 | Monitor progress | Incremental updates visible (every ~20 products) |
| 3 | Wait for completion | All products synced, counts accurate |

**Pass Criteria**: Handles larger catalogs without timeout or data loss.

---

### TC-E4: Network Error During Sync

**Precondition**: Stripe connected. Hard to simulate — observe behavior if Stripe API is slow/unreachable.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start sync | Sync attempts to fetch from Stripe |
| 2 | If network fails | Error message displayed, sync_log status set to "failed" |
| 3 | Catalog state | No partial corruption — either all updates applied or none |

---

### TC-E5: Mobile Responsiveness

**Precondition**: Stripe items synced into catalog

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app on mobile viewport (or resize browser to ~375px) | Catalog renders in card layout |
| 2 | Verify Stripe badges visible on cards | Badges render correctly in mobile view |
| 3 | Verify "Sync from Stripe" button accessible | Button visible and clickable |
| 4 | Verify source filter works | Filter pills/dropdown functional on mobile |

---

## Test Execution Summary Template

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-1.1 Connect Valid Key | | |
| TC-1.2 Connect Invalid Key | | |
| TC-1.3 Connect Empty Key | | |
| TC-1.4 Connect Live Key | | |
| TC-1.5 Disconnect | | |
| TC-1.6 Disconnect Cancel | | |
| TC-1.7 Reconnect | | |
| TC-1.8 Non-Owner Access | | |
| TC-2.1 Initial Sync | | |
| TC-2.2 Re-Sync Updates | | |
| TC-2.3 Archived Deactivation | | |
| TC-2.4 Sync Zero Products | | |
| TC-2.5 Sync Progress | | |
| TC-2.6 Concurrent Sync | | |
| TC-2.7 Sync Without Connection | | |
| TC-2.8 Last Synced Timestamp | | |
| TC-3.1 Stripe Badge | | |
| TC-3.2 Filter All | | |
| TC-3.3 Filter Stripe | | |
| TC-3.4 Filter Manual | | |
| TC-3.5 Combined Filters | | |
| TC-3.6 Per-Item Synced Date | | |
| TC-4.1 Local Fields Preserved | | |
| TC-4.2 Stripe Field Warning | | |
| TC-4.3 Local Deactivation Respected | | |
| TC-4.4 Restore from Stripe | | |
| TC-4.5 Restore Not on Manual | | |
| TC-4.6 Restore Not on Active | | |
| TC-R1 Manual Items Unaffected | | |
| TC-R2 Create Manual After Sync | | |
| TC-R3 Edit Manual After Sync | | |
| TC-R4 Invoice Lines Not Affected | | |
| TC-E1 Long Product Name | | |
| TC-E2 Special Characters | | |
| TC-E3 Large Catalog (50+) | | |
| TC-E4 Network Error | | |
| TC-E5 Mobile Responsiveness | | |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Schema: stripe_integrations, sync_logs, catalog_items extensions |
| `convex/functions/stripeIntegrations.ts` | Connection management (connect/disconnect/getConnection) |
| `convex/functions/catalogItems.ts` | Sync logic, progress tracking, restore, extended list query |
| `src/domains/sales-invoices/hooks/use-stripe-integration.ts` | React hooks for Stripe connection |
| `src/domains/sales-invoices/hooks/use-catalog-items.ts` | Extended with source filter |
| `src/domains/account-management/components/stripe-integration-card.tsx` | Settings UI for connection |
| `src/domains/sales-invoices/components/stripe-sync-button.tsx` | Sync button with progress |
| `src/domains/sales-invoices/components/catalog-item-manager.tsx` | Catalog UI: badges, filters, restore |
| `src/domains/account-management/components/tabbed-business-settings.tsx` | Integrations tab |
