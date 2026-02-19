# Tasks: Usage Tracking (AI Chat, E-Invoice, Credit Packs)

**Input**: Design documents from `/specs/001-usage-tracking/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/usage-api.md, research.md, quickstart.md

**Tests**: Not explicitly requested — omitted. Build verification via `npm run build` is the primary validation.

**Organization**: Tasks grouped by user story. Credit pack core module is foundational (required by US1 for credit pack fallback).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and plan configuration that all user stories depend on

- [x] T001 Add `ai_message_usage`, `einvoice_usage`, and `credit_packs` table definitions with all indexes to `convex/schema.ts` — follow the existing `ocr_usage` pattern (lines 727-746). See `specs/001-usage-tracking/data-model.md` for field definitions, types, and index specifications
- [x] T002 Extend `PlanConfig` interface in `src/lib/stripe/catalog.ts` with `aiMessageLimit`, `invoiceLimit`, and `einvoiceLimit` number fields. Update `FALLBACK_PLANS` to include these limits for all plan tiers (trial: Pro limits, starter: 30/10/100, pro: 300/-1/-1, enterprise: -1/-1/-1). Update Stripe metadata parsing in `fetchCatalogFromStripe()` to read `ai_message_limit`, `invoice_limit`, `einvoice_limit` from product metadata

---

## Phase 2: Foundational (Credit Packs Core)

**Purpose**: Credit pack module that MUST be complete before US1 can implement credit pack fallback in `checkAndRecord`

- [x] T003 Create `convex/functions/creditPacks.ts` with all Convex functions per `specs/001-usage-tracking/contracts/usage-api.md` section 5: queries `getActivePacks` (sorted by `purchasedAt` asc for FIFO), `getActiveCredits` (filtered by packType); internalMutations `consumeCredit` (FIFO deduction, marks depleted when remaining=0), `createFromPurchase` (sets expiresAt = purchasedAt + 90 days, status = active), `expireDaily` (queries active packs where expiresAt <= now, sets status to expired). Follow auth/membership patterns from `convex/functions/ocrUsage.ts`
- [x] T004 Add `expire-credit-packs` daily cron job in `convex/crons.ts` — schedule at `{ hourUTC: 3, minuteUTC: 0 }` targeting `internal.functions.creditPacks.expireDaily`. Follow the existing `mark-overdue-invoices` pattern

**Checkpoint**: Schema deployed, plan config extended, credit pack module ready. User story implementation can begin.

---

## Phase 3: User Story 1 — AI Chat Usage Enforcement (Priority: P1)

**Goal**: Track AI chat message usage per-business per-month. Block messages when plan allocation + credit packs are exhausted. Fail-open on transient errors.

**Independent Test**: Send AI chat messages as a Starter business (30/month limit). Verify the 31st message is blocked. Verify a trial business gets Pro limits (300/month). Verify credit pack fallback when plan is exhausted.

### Implementation for User Story 1

- [x] T005 [US1] Create `convex/functions/aiMessageUsage.ts` with query `getCurrentUsage` (returns `{ month, messagesUsed, planLimit, remaining, percentUsed } | null` for current month) and query `hasCredits` (returns boolean combining plan remaining + active AI credit packs). Use `by_businessId_month` index for lookup. Follow `ocrUsage.getCurrentUsage` pattern. See contracts section 2
- [x] T006 [US1] Add mutation `recordUsage` and internalMutation `checkAndRecord` to `convex/functions/aiMessageUsage.ts`. `checkAndRecord` must: (1) get or create monthly record with plan limit from business's plan, (2) if messagesUsed < planLimit or planLimit === -1, increment and return `{ allowed: true, source: "plan" }`, (3) if plan exhausted, call `creditPacks.consumeCredit` for `ai_credits` type, (4) if credit consumed return `{ allowed: true, source: "credit_pack" }`, (5) otherwise return `{ allowed: false }`. Resolve plan limit via business.planName → catalog lookup per FR-015 (trial = Pro limits)
- [x] T007 [US1] Add AI chat pre-flight check to `src/app/api/copilotkit/route.ts` — after resolving `userId` and `resolvedBusinessId` (line ~25), call `aiMessageUsage.checkAndRecord`. If `allowed: false`, return 429 response with limit-reached message. Wrap entire check in try-catch for fail-open behavior (FR-016): on error, log `[Usage Tracking] AI chat pre-flight failed, proceeding (fail-open)` and continue to CopilotKit handler

**Checkpoint**: AI chat messages are tracked per-business per-month. Starter limit (30), Pro limit (300), Enterprise (unlimited), Trial (Pro limits). Credit pack fallback works.

---

## Phase 4: User Story 2 — E-Invoice Submission Tracking (Priority: P2)

**Goal**: Track LHDN e-invoice submissions per-business per-month. Block submissions when Starter allocation (100/month) is exhausted.

**Independent Test**: E-invoice submission feature is not yet implemented. Module is ready for integration when built.

### Implementation for User Story 2

- [x] T008 [P] [US2] Create `convex/functions/einvoiceUsage.ts` with query `getCurrentUsage` (returns `{ month, submissionsUsed, planLimit, remaining, percentUsed } | null`) and mutation `recordUsage`. Follow the same pattern as `aiMessageUsage.ts` but using `submissionsUsed` field and `einvoice_usage` table. See contracts section 3
- [x] T009 [US2] Add internalMutation `checkAndRecord` to `convex/functions/einvoiceUsage.ts` — atomic check-and-increment against plan limit only (no credit pack fallback for e-invoices). Returns `{ allowed: boolean, remaining: number }`. Resolve `einvoiceLimit` from business plan (Starter: 100, Pro/Enterprise/Trial: -1 unlimited)

**Checkpoint**: E-invoice usage module is complete and ready for integration when the e-invoice submission feature is built. Pre-flight check will be added to the future submission mutation.

---

## Phase 5: User Story 3 — Credit Pack Purchase Lifecycle (Priority: P2)

**Goal**: Enable credit pack purchases via Stripe checkout. Process webhook events to create credit pack records. Complete the credit pack lifecycle (purchase → consume → expire).

**Independent Test**: Trigger a Stripe test checkout for an AI Chat Boost pack. Verify the webhook creates a credit pack record with correct fields (50 credits, 90-day expiry, active status).

### Implementation for User Story 3

- [x] T010 [US3] Add credit pack checkout handler in `src/lib/stripe/webhook-handlers-convex.ts` — create a new `handleCreditPackPurchaseConvex()` function that: (1) extracts `business_id`, `addon_type`, and `message_count` or `scan_count` from session metadata, (2) maps to packType/packName/totalCredits, (3) calls `creditPacks.createFromPurchase` internalMutation. Follow the existing `handleCheckoutSessionCompletedConvex` pattern for Convex client usage
- [x] T011 [US3] Extend `checkout.session.completed` handler in `src/app/api/v1/billing/webhooks/route.ts` to detect credit pack purchases (check for `addon_type` in session metadata) and route to `handleCreditPackPurchaseConvex()` instead of the subscription handler. Ensure idempotency via existing `stripeEvents` table check

**Checkpoint**: Credit pack purchase → webhook → Convex record creation → FIFO consumption → daily expiry. Full lifecycle works end-to-end.

---

## Phase 6: User Story 4 — Sales Invoice Count Enforcement (Priority: P3)

**Goal**: Count sales invoices per-business per-month from existing records. Block creation when Starter limit (10/month) is reached.

**Independent Test**: Create 10 sales invoices as a Starter business. Verify the 11th is blocked with a limit message.

### Implementation for User Story 4

- [x] T012 [US4] Create `convex/functions/salesInvoiceUsage.ts` with query `getCurrentCount` (counts `sales_invoices` where businessId matches and `_creationTime` falls within current calendar month, returns `{ month, count, planLimit, remaining, percentUsed }`) and query `canCreate` (returns boolean: `count < planLimit || planLimit === -1`). Resolve `invoiceLimit` from business plan (Starter: 10, Pro/Enterprise/Trial: -1 unlimited). See contracts section 4
- [x] T013 [US4] Add sales invoice count pre-flight check to the `create` mutation in `convex/functions/salesInvoices.ts` — after authorization check, before validation, query `salesInvoiceUsage.canCreate`. If false, throw `Error("Sales invoice limit reached for this month. Upgrade to Pro for unlimited invoices.")`

**Checkpoint**: Sales invoice creation is gated by plan limits. Starter (10/month), Pro/Enterprise/Trial (unlimited).

---

## Phase 7: User Story 5 — Unified Usage Dashboard (Priority: P3)

**Goal**: Expose all usage types (AI messages, OCR, sales invoices, e-invoices) and credit packs through the billing subscription API and client hook.

**Independent Test**: Call `GET /api/v1/billing/subscription` and verify response includes all 4 usage types with used/limit/remaining/percentage values, plus active credit packs array.

### Implementation for User Story 5

- [x] T014 [US5] Extend `GET /api/v1/billing/subscription` in `src/app/api/v1/billing/subscription/route.ts` — after existing OCR usage fetch, add parallel queries for `aiMessageUsage.getCurrentUsage`, `einvoiceUsage.getCurrentUsage`, `salesInvoiceUsage.getCurrentCount`, and `creditPacks.getActivePacks`. Add all results to the response `usage` object (aiMessagesUsed/Limit/Remaining/Percentage/IsUnlimited, salesInvoicesUsed/Limit/..., einvoicesUsed/Limit/...) and a new `creditPacks` array. Wrap each query in try-catch with 0 fallback (fail-open, matching existing OCR pattern)
- [x] T015 [US5] Extend `SubscriptionData` interface and `useSubscription` hook in `src/domains/billing/hooks/use-subscription.ts` — add all new usage fields to the `usage` object type (aiMessagesUsed, aiMessagesLimit, aiMessagesRemaining, aiMessagesPercentage, aiMessagesIsUnlimited; same pattern for salesInvoices and einvoices). Add `creditPacks` array type with id, packType, packName, totalCredits, creditsUsed, creditsRemaining, purchasedAt, expiresAt, status. Map from API response in the fetch handler

**Checkpoint**: All usage data is available to the client. The billing/usage UI can now display all 4 resource types and active credit packs.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, deployment, and final validation

- [x] T016 Run `npm run build` in project root and fix any TypeScript compilation errors across all modified and created files — TypeScript compilation (`tsc --noEmit`) passes clean. `next build` prerender fails due to missing Clerk env vars (pre-existing, not code issue)
- [ ] T017 Run `npx convex deploy --yes` to deploy schema changes and Convex functions to production. Verify all new tables and functions are available — requires `.env.local` with `CONVEX_DEPLOYMENT`
- [x] T018 Verify pre-flight check in copilotkit route by reviewing the complete request flow: auth → usage check (fail-open) → CopilotKit handler → message recorded

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must exist for credit pack functions)
- **US1 (Phase 3)**: Depends on Phase 2 (needs credit pack `consumeCredit` for fallback)
- **US2 (Phase 4)**: Depends on Phase 1 only (no credit pack dependency)
- **US3 (Phase 5)**: Depends on Phase 2 (extends existing credit pack module with webhook)
- **US4 (Phase 6)**: Depends on Phase 1 only (uses existing sales_invoices table)
- **US5 (Phase 7)**: Depends on Phase 3, 4, 5, 6 (aggregates all usage modules)
- **Polish (Phase 8)**: Depends on all phases

### User Story Dependencies

```
Phase 1 (Setup)
  └─→ Phase 2 (Foundational: Credit Packs Core)
        ├─→ Phase 3: US1 - AI Chat Enforcement (P1)
        └─→ Phase 5: US3 - Credit Pack Purchase (P2)
  ├─→ Phase 4: US2 - E-Invoice Tracking (P2)      [parallel with US1]
  └─→ Phase 6: US4 - Sales Invoice Enforcement (P3) [parallel with US1]
              ↓ all complete ↓
        Phase 7: US5 - Unified Usage Dashboard (P3)
              ↓
        Phase 8: Polish
```

### Parallel Opportunities

After Phase 2 completes:
- **US1 (Phase 3)** and **US2 (Phase 4)** can run in parallel (different files)
- **US4 (Phase 6)** can run in parallel with US1/US2 (different files, depends only on Phase 1)
- **US3 (Phase 5)** can run in parallel with US2/US4 (different files, extends credit packs module)

Within Phase 4 (US2):
- T008 is marked [P] — it creates a new file with no dependencies on other Phase 4 tasks

---

## Parallel Example: After Phase 2

```bash
# These can all launch together after Phase 2 (Foundational) completes:

# Agent A: US1 - AI Chat Enforcement
Task T005: "Create aiMessageUsage.ts queries in convex/functions/aiMessageUsage.ts"
Task T006: "Add checkAndRecord mutation to convex/functions/aiMessageUsage.ts"
Task T007: "Add pre-flight check to src/app/api/copilotkit/route.ts"

# Agent B: US2 - E-Invoice Tracking (parallel with Agent A)
Task T008: "Create einvoiceUsage.ts in convex/functions/einvoiceUsage.ts"
Task T009: "Add checkAndRecord to convex/functions/einvoiceUsage.ts"

# Agent C: US4 - Sales Invoice Enforcement (parallel with Agents A & B)
Task T012: "Create salesInvoiceUsage.ts in convex/functions/salesInvoiceUsage.ts"
Task T013: "Add pre-flight check to convex/functions/salesInvoices.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 (T005-T007)
4. **STOP and VALIDATE**: Test AI chat limit enforcement independently
5. Run `npm run build` to verify

### Incremental Delivery

1. Setup + Foundational → Schema + credit packs ready
2. Add US1 → AI chat enforcement works → **MVP!**
3. Add US2 → E-invoice tracking ready for future integration
4. Add US3 → Credit pack purchases via Stripe webhook
5. Add US4 → Sales invoice enforcement works
6. Add US5 → All usage visible in billing dashboard
7. Polish → Build + deploy

### Parallel Team Strategy

With 3 developers after Phase 2:
- **Dev A**: US1 (AI Chat) → then US5 (Dashboard) when others finish
- **Dev B**: US2 (E-Invoice) → then US3 (Credit Pack Purchase)
- **Dev C**: US4 (Sales Invoice) → then assist with US5

---

## Notes

- All new Convex functions follow `ocrUsage.ts` patterns (auth, membership check, indexes, error handling)
- Month format: `"YYYY-MM"` consistently across all usage tables
- Plan limit resolution: business.planName → catalog.getPlan() → limit field (trial = Pro limits)
- Unlimited = -1 sentinel; pre-flight always passes when limit === -1
- Credit pack FIFO: query by `purchasedAt` ascending, consume oldest active pack first
- Fail-open: try-catch at API route level for pre-flight checks; log and proceed on error
- E-invoice pre-flight will be integrated when the e-invoice submission feature is built (out of scope for this task set)
- `npm run build` and `npx convex deploy --yes` are mandatory before task completion per CLAUDE.md
