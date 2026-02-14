# Tasks: Stripe Product Catalog Sync

**Input**: Design documents from `/specs/014-stripe-catalog-sync/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/convex-functions.md

**Tests**: Not explicitly requested — test tasks omitted. Use quickstart.md testing checklist for manual validation.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing codebase. This phase ensures foundational configuration is in place.

- [ ] T001 Create todo tracking file at `tasks/todo.md` with high-level implementation plan and checklist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes and module scaffolding that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Extend Convex schema with `stripe_integrations` table (businessId, stripeSecretKey, stripeAccountId, stripeAccountName, status, connectedAt, disconnectedAt, lastSyncAt, createdBy) and `sync_logs` table (businessId, startedAt, completedAt, status, productsCreated, productsUpdated, productsDeactivated, productsSkipped, totalStripeProducts, errors, triggeredBy) with indexes `by_businessId` on both tables in `convex/schema.ts`
- [x] T003 Extend `catalog_items` table in `convex/schema.ts` with new optional fields: `source` (string, "manual" or "stripe"), `stripeProductId` (string), `stripePriceId` (string), `lastSyncedAt` (number), `locallyDeactivated` (boolean). Add new index `by_businessId_stripeProductId` on `[businessId, stripeProductId]`
- [x] T004 Create `convex/functions/stripeIntegrations.ts` module with imports, role-check helpers, and export skeleton for `getConnection` query, `connect` action, and `disconnect` mutation (function signatures only, implementation in US1)

**Checkpoint**: Schema deployed, module scaffolded — user story implementation can begin

---

## Phase 3: User Story 1 — Connect Stripe Account (Priority: P1)

**Goal**: Business owner can enter Stripe API key, validate it, see connected status, and disconnect.

**Independent Test**: Enter a `sk_test_` key → system validates → shows "Connected" with account name. Disconnect → status reverts. Invalid key → clear error.

### Implementation for User Story 1

- [x] T005 [US1] Implement `getConnection` query in `convex/functions/stripeIntegrations.ts` — reads `stripe_integrations` by businessId, returns sanitized view (stripeAccountName, stripeAccountId, status, connectedAt, lastSyncAt). MUST NOT return stripeSecretKey. Require owner/finance_admin/manager role.
- [x] T006 [US1] Implement `connect` action in `convex/functions/stripeIntegrations.ts` — accepts businessId + stripeSecretKey, validates key by calling `stripe.account.retrieve()` with a new Stripe client instance, stores integration record (or updates existing), sets status to "connected". Require owner role only. Return success/error with accountName.
- [x] T007 [US1] Implement `disconnect` mutation in `convex/functions/stripeIntegrations.ts` — sets status to "disconnected", clears stripeSecretKey, sets disconnectedAt timestamp. Require owner role only. Preserve existing synced catalog items.
- [x] T008 [US1] Create `src/domains/sales-invoices/hooks/use-stripe-integration.ts` with hooks: `useStripeConnection()` (wraps `useQuery` for `getConnection`), `useStripeConnect()` (wraps `useAction` for `connect`), `useStripeDisconnect()` (wraps `useMutation` for `disconnect`)
- [x] T009 [US1] Create `src/domains/account-management/components/stripe-integration-card.tsx` — card component with: masked API key input field (`sk_...`), "Connect" button (primary style), connection status indicator (green dot + account name when connected), "Disconnect" button (destructive style) with confirmation dialog. Use semantic design tokens per CLAUDE.md.
- [x] T010 [US1] Add "Integrations" tab to `src/domains/account-management/components/tabbed-business-settings.tsx` — add new tab value `integrations` to the valid tabs list, render `StripeIntegrationCard` component. Restrict to owner role (same as existing owner-only tabs).

**Checkpoint**: User Story 1 complete — owners can connect/disconnect Stripe. Verify: enter `sk_test_` key → connected status shows → disconnect works.

---

## Phase 4: User Story 2 — Sync Product Catalog from Stripe (Priority: P1)

**Goal**: Finance admin clicks "Sync from Stripe" on catalog page, products are fetched and upserted into catalog with real-time progress.

**Independent Test**: Connect Stripe with test products → click "Sync from Stripe" → products appear in catalog with correct name, price, currency. Re-sync updates changes. Archived products deactivated.

### Implementation for User Story 2

- [x] T011 [US2] Implement `syncFromStripe` action in `convex/functions/catalogItems.ts` — reads Stripe key from `stripe_integrations` via internal query, creates Stripe client, fetches all active products with `expand: ['data.default_price']` using `autoPagingToArray()`, creates sync_log entry (status: running). For each product: resolve price (default_price → first one-time → first recurring → 0), upsert catalog item matched by stripeProductId (create if new, update Stripe-managed fields if existing, skip if locallyDeactivated). After processing: compare local synced items vs fetched set, deactivate items not in Stripe. Update sync_log with final counts. Update `stripe_integrations.lastSyncAt`. Require owner/finance_admin/manager role.
- [x] T012 [US2] Implement sync progress tracking in `convex/functions/catalogItems.ts` — during `syncFromStripe`, update the sync_log document's `productsCreated`/`productsUpdated` counts incrementally (batch updates every ~20 products to avoid excessive writes). Add `getSyncProgress` query that reads the latest running sync_log for the business and returns total/processed/status/message.
- [x] T013 [US2] Create `src/domains/sales-invoices/components/stripe-sync-button.tsx` — button component that shows "Sync from Stripe" (with Stripe icon) when connected, disabled with spinner + progress text ("Syncing 45 of 120...") during sync, success toast on completion with created/updated/deactivated counts. Uses `useStripeConnection()` to check connection state and `getSyncProgress` query for real-time updates.
- [x] T014 [US2] Integrate sync button into `src/domains/sales-invoices/components/catalog-item-manager.tsx` — add `StripeSyncButton` to the header area next to the existing "Add Item" button. Show last synced timestamp from connection data. Only visible when Stripe is connected.

**Checkpoint**: User Story 2 complete — sync works end-to-end. Verify: create products in Stripe → sync → items appear. Modify in Stripe → re-sync → updates apply. Archive in Stripe → re-sync → deactivated locally.

---

## Phase 5: User Story 3 — View Sync Status and Source (Priority: P2)

**Goal**: Users can distinguish Stripe-synced items from manual items, with source badges and filtering.

**Independent Test**: After sync, Stripe items show badge. Filter by "Stripe" → only synced items. Filter by "Manual" → only manual items.

### Implementation for User Story 3

- [x] T015 [P] [US3] Extend `list` query in `convex/functions/catalogItems.ts` — add optional `source` filter parameter ("manual" | "stripe"). When `source === "stripe"`, filter items where `source === "stripe"`. When `source === "manual"`, filter items where `source` is undefined or "manual". Update existing search/filter logic to incorporate source filter.
- [x] T016 [P] [US3] Extend `useCatalogItems` hook in `src/domains/sales-invoices/hooks/use-catalog-items.ts` — add `source` option parameter to the hook options, pass through to the `list` query args.
- [x] T017 [US3] Add source filter dropdown and Stripe badges to `src/domains/sales-invoices/components/catalog-item-manager.tsx` — add a source filter dropdown (All / Manual / Stripe) next to existing status filter. On each catalog item row, show a small Stripe icon badge when `source === "stripe"` and display "Last synced: [relative time]" from `lastSyncedAt` field.

**Checkpoint**: User Story 3 complete — visual distinction and filtering works. Verify: mixed catalog shows badges on Stripe items. Filters narrow correctly.

---

## Phase 6: User Story 4 — Edit Synced Items Locally (Priority: P3)

**Goal**: Users can enrich Stripe-synced items with local-only fields (SKU, tax rate, category) that survive re-syncs. Local deactivation is respected. Restore action available.

**Independent Test**: Sync a product → add SKU and tax rate → re-sync → SKU and tax rate preserved, name/price updated from Stripe. Deactivate → re-sync → stays deactivated. Restore → re-activates.

### Implementation for User Story 4

- [x] T018 [US4] Extend `deactivate` mutation in `convex/functions/catalogItems.ts` — when deactivating an item with `source === "stripe"`, also set `locallyDeactivated = true` so the sync respects this override.
- [x] T019 [US4] Implement `restoreFromStripe` mutation in `convex/functions/catalogItems.ts` — accepts item ID + businessId, validates item has `source === "stripe"` and `locallyDeactivated === true`, clears `locallyDeactivated`, sets status back to "active". Require owner/finance_admin/manager role.
- [x] T020 [US4] Add "Restore from Stripe" action and Stripe-managed field edit warning to `src/domains/sales-invoices/components/catalog-item-manager.tsx` — in the item action menu, show "Restore from Stripe" option for items where `source === "stripe"` and `locallyDeactivated === true`. When editing a Stripe-synced item, show a warning banner on Stripe-managed fields (name, description, price, currency): "This field is managed by Stripe and will be overwritten on the next sync."

**Checkpoint**: User Story 4 complete — local enrichment and deactivation override works. Verify: add SKU → re-sync → preserved. Deactivate → re-sync → stays inactive. Restore → re-activates.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Build validation, deployment, and final integration verification

- [x] T021 Run `npm run build` and fix any TypeScript compilation errors across all modified files
- [ ] T022 Run `npx convex deploy --yes` (requires CONVEX_DEPLOYMENT env — run in dev environment) to deploy schema and function changes to production (MANDATORY per CLAUDE.md after any Convex changes)
- [ ] T023 End-to-end validation (manual — requires running app + Stripe test key): connect Stripe test account → sync products → verify catalog → filter by source → deactivate synced item → re-sync → verify deactivation respected → restore → verify re-activated
- [ ] T024 Verify manual catalog items are completely unaffected (manual — part of E2E) by all sync operations (SC-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 Connect (Phase 3)**: Depends on Phase 2 — connection is prerequisite for sync
- **US2 Sync (Phase 4)**: Depends on Phase 3 (needs Stripe connection to function)
- **US3 Source View (Phase 5)**: Depends on Phase 4 (needs synced items to display badges)
- **US4 Local Edit (Phase 6)**: Depends on Phase 4 (needs synced items to deactivate/restore)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 2 (Foundation)
  └─► US1 Connect (Phase 3)
       └─► US2 Sync (Phase 4)
            ├─► US3 Source View (Phase 5) [P] can run parallel with US4
            └─► US4 Local Edit (Phase 6)  [P] can run parallel with US3
```

### Within Each User Story

- Backend (Convex functions) before frontend hooks
- Frontend hooks before UI components
- UI components before integration into existing pages

### Parallel Opportunities

- **Phase 2**: T002 and T003 modify the same file (`schema.ts`) — must be sequential. T004 can start after T002+T003.
- **Phase 5**: T015 and T016 are in different files — can run in parallel [P]
- **Phase 5 + Phase 6**: US3 and US4 are independent after US2 — can run in parallel

---

## Parallel Example: Phase 5 (US3)

```bash
# These tasks modify different files — run in parallel:
Task: "T015 - Extend list query in convex/functions/catalogItems.ts"
Task: "T016 - Extend useCatalogItems hook in src/domains/sales-invoices/hooks/use-catalog-items.ts"

# Then sequentially (depends on T015 + T016):
Task: "T017 - Add source filter and badges to catalog-item-manager.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T004)
3. Complete Phase 3: US1 Connect (T005-T010)
4. Complete Phase 4: US2 Sync (T011-T014)
5. **STOP and VALIDATE**: Connect Stripe → sync → products appear correctly
6. Deploy/demo — core value delivered

### Incremental Delivery

1. Setup + Foundation → schema ready
2. US1 Connect → Stripe account linked → Deploy
3. US2 Sync → Products flow from Stripe → Deploy (MVP!)
4. US3 Source View → Visual clarity → Deploy
5. US4 Local Edit → Full local control → Deploy
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- All Convex function changes MUST be followed by `npx convex deploy --yes` (T022)
- Build MUST pass before completion (T021)
- Stripe test-mode key (`sk_test_...`) sufficient for all development and testing
- Existing `stripe` npm package (v20.1.0) is already installed — no `npm install` needed
- Do NOT reuse `src/lib/stripe/client.ts` singleton — create per-business Stripe client instances in Convex actions
