# Tasks: Stripe Subscription Integration

**Input**: Design documents from `/specs/001-stripe-subscription/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Pattern**: [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)

**Tests**: Not explicitly requested - implementation tasks only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, configure Stripe, create shared utilities

- [x] T001 Install Stripe dependencies: `npm install stripe @stripe/stripe-js`
- [x] T002 [P] Add Stripe environment variables to `.env.example` and `.env.local`
- [x] T003 [P] Create Stripe client initialization in `src/lib/stripe/client.ts`
- [x] T004 [P] Create plan configuration in `src/lib/stripe/plans.ts`
- [x] T005 Create billing domain structure: `src/domains/billing/CLAUDE.md`

**Checkpoint**: Stripe SDK configured and ready for use

---

## Phase 2: Foundational (Database + Webhook Infrastructure)

**Purpose**: Database schema and webhook handler - MUST complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create migration: Add 5 Stripe columns to businesses table in `supabase/migrations/20251227100000_add_stripe_to_businesses.sql`
- [x] T007 [P] Create migration: stripe_events table in `supabase/migrations/20251227100001_create_stripe_events.sql`
- [x] T008 [P] Create migration: ocr_usage table in `supabase/migrations/20251227100002_create_ocr_usage.sql`
- [x] T009 Apply migrations via Supabase MCP
- [x] T010 Create webhook handler in `src/app/api/v1/billing/webhooks/route.ts`
- [x] T011 Implement webhook signature verification in webhook handler
- [x] T012 Implement idempotency check (stripe_events lookup) in webhook handler
- [x] T013 [P] Create webhook event handlers in `src/lib/stripe/webhook-handlers.ts`
- [ ] T014 Test webhook with Stripe CLI: `stripe listen --forward-to localhost:3000/api/v1/billing/webhooks`

**Checkpoint**: Database ready, webhooks processing events → Foundation complete

---

## Phase 3: User Story 1 - Subscribe to a Plan (Priority: P1) 🎯 MVP

**Goal**: Users can view pricing, select a plan, complete checkout, and have their subscription activated

**Independent Test**: Navigate to /pricing → Select Pro → Complete Stripe Checkout → Verify businesses.plan_name = 'pro'

### Implementation for User Story 1

- [x] T015 [P] [US1] Create checkout API route in `src/app/api/v1/billing/checkout/route.ts`
- [x] T016 [P] [US1] Create subscription status API route in `src/app/api/v1/billing/subscription/route.ts`
- [x] T017 [US1] Implement checkout session creation (get/create Stripe customer, create session)
- [x] T018 [US1] Handle `checkout.session.completed` webhook → update businesses table
- [x] T019 [US1] Handle `customer.subscription.created` webhook → update businesses table
- [x] T020 [US1] Handle `customer.subscription.updated` webhook → update businesses table
- [x] T021 [US1] Handle `customer.subscription.deleted` webhook → downgrade to free
- [x] T022 [P] [US1] Create useSubscription hook in `src/domains/billing/hooks/use-subscription.ts`
- [x] T023 [P] [US1] Create PricingTable component in `src/domains/billing/components/pricing-table.tsx`
- [x] T024 [US1] Create pricing page in `src/app/[locale]/pricing/page.tsx`
- [x] T025 [US1] Add current plan highlighting to PricingTable for subscribed users
- [x] T026 [US1] Add checkout redirect flow (click Subscribe → API → redirect to Stripe)

**Checkpoint**: User Story 1 complete - users can subscribe to Pro/Enterprise plans

---

## Phase 4: User Story 2 - Manage Subscription (Priority: P2)

**Goal**: Subscribed users can view billing details and manage subscription via Stripe Portal

**Independent Test**: Navigate to /settings/billing → Click "Manage Subscription" → Stripe Portal opens → Can update payment method

### Implementation for User Story 2

- [x] T027 [P] [US2] Create portal API route in `src/app/api/v1/billing/portal/route.ts`
- [x] T028 [US2] Implement portal session creation (requires stripe_customer_id)
- [x] T029 [P] [US2] Create billing settings page in `src/app/[locale]/settings/billing/page.tsx` (combined with BillingSettings)
- [x] T030 [US2] Display current plan, status, next billing date in billing settings page
- [x] T031 [US2] Display OCR usage with progress bar in billing settings page
- [x] T032 [US2] Add "Manage Subscription" button that redirects to Stripe Portal
- [x] T033 [US2] Handle return from Stripe Checkout (success/cancel URL parameters)

**Checkpoint**: User Story 2 complete - users can manage subscriptions via Stripe Portal

---

## Phase 5: User Story 3 - View Invoice History (Priority: P3)

**Goal**: Users can view and download past invoices from Stripe

**Independent Test**: Navigate to /settings/billing → See invoice list → Click download → PDF downloads

### Implementation for User Story 3

- [ ] T034 [P] [US3] Create invoices API route in `src/app/api/v1/billing/invoices/route.ts`
- [ ] T035 [US3] Implement invoice list fetch from Stripe API (stripe.invoices.list)
- [ ] T036 [P] [US3] Create InvoiceList component in `src/domains/billing/components/invoice-list.tsx`
- [ ] T037 [US3] Add InvoiceList to billing settings page
- [ ] T038 [US3] Implement invoice PDF download (use Stripe's hosted_invoice_url)

**Checkpoint**: User Story 3 complete - users can view and download invoices

---

## Phase 6: User Story 4 - Track OCR Usage Credits (Priority: P4)

**Goal**: Users see OCR usage, get warnings at 80%, and are soft-blocked at limit

**Independent Test**: Process OCR document → Usage count increments → At limit, OCR blocked with upgrade prompt

### Implementation for User Story 4

- [ ] T039 [P] [US4] Create usage API routes in `src/app/api/v1/billing/usage/route.ts`
- [ ] T040 [US4] Implement GET /usage - return current usage, limit, percentage
- [ ] T041 [US4] Implement GET /usage/check - return canUse boolean for soft-block
- [ ] T042 [US4] Implement POST /usage - record OCR credit consumption (internal)
- [ ] T043 [P] [US4] Create useUsage hook in `src/domains/billing/hooks/use-usage.ts`
- [ ] T044 [P] [US4] Create UsageDashboard component in `src/domains/billing/components/usage-dashboard.tsx`
- [ ] T045 [US4] Add UsageDashboard to billing settings page
- [ ] T046 [US4] Integrate usage check into OCR processing flow (soft-block)
- [ ] T047 [US4] Add upgrade prompt modal when usage limit reached
- [ ] T048 [US4] Add 80% usage warning notification

**Checkpoint**: User Story 4 complete - usage tracking and soft-block working

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T049 [P] Handle `invoice.payment_failed` webhook → mark past_due, show notification
- [ ] T050 [P] Handle `invoice.payment_succeeded` webhook → clear past_due status
- [ ] T051 Add error handling for Stripe API failures across all routes
- [ ] T052 Add loading states to all billing components
- [ ] T053 [P] Update CLAUDE.md in billing domain with implementation details
- [ ] T054 Run `npm run build` to validate all changes
- [ ] T055 Test complete flow with Stripe CLI: checkout → portal → cancel → usage

**Checkpoint**: Feature complete and polished

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → User Stories (3-6) → Phase 7 (Polish)
                         ↓
              BLOCKS all user stories
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 - Subscribe | Phase 2 | Foundational complete |
| US2 - Manage | Phase 2 + US1 (needs subscription to exist) | US1 complete |
| US3 - Invoices | Phase 2 + US1 (needs payment history) | US1 complete |
| US4 - Usage | Phase 2 | Foundational complete (independent of US1-3) |

### Task Dependencies Within Phases

**Phase 2:**
- T006, T007, T008 can run in parallel (different migrations)
- T009 depends on T006-T008
- T010-T014 depend on T009

**Phase 3 (US1):**
- T015, T016, T022, T023 can run in parallel (different files)
- T017 depends on T015
- T018-T021 depend on T010 (webhook handler)
- T024-T026 depend on T023

---

## Parallel Opportunities

### Phase 1 - All parallel:
```bash
# Run simultaneously:
- T002: Add env variables
- T003: Create Stripe client
- T004: Create plans config
```

### Phase 2 - Migrations parallel:
```bash
# Run simultaneously:
- T006: businesses columns migration
- T007: stripe_events migration
- T008: ocr_usage migration
```

### User Stories - Can parallelize US1 and US4:
```bash
# US1 and US4 have no dependencies on each other
# Developer A: US1 (Subscribe flow)
# Developer B: US4 (Usage tracking)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. ✅ Complete Phase 1: Setup
2. ✅ Complete Phase 2: Foundational (database + webhooks)
3. ✅ Complete Phase 3: User Story 1 (Subscribe to a Plan)
4. **STOP and VALIDATE**: Test checkout flow end-to-end
5. Deploy MVP - users can subscribe!

### Incremental Delivery

| Milestone | Stories | What Users Can Do |
|-----------|---------|-------------------|
| MVP | US1 | Subscribe to Pro/Enterprise |
| v1.1 | US1 + US2 | + Manage subscription via Portal |
| v1.2 | US1-3 | + View/download invoices |
| v1.3 | US1-4 | + See usage, soft-block at limit |

### Estimated Task Count

| Phase | Tasks | Parallel Opportunities |
|-------|-------|------------------------|
| Setup | 5 | 3 parallel |
| Foundational | 9 | 3 parallel migrations |
| US1 - Subscribe | 12 | 4 parallel |
| US2 - Manage | 7 | 2 parallel |
| US3 - Invoices | 5 | 2 parallel |
| US4 - Usage | 10 | 3 parallel |
| Polish | 7 | 3 parallel |
| **Total** | **55** | - |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US2 and US3 technically depend on US1 (need a subscription to manage/have invoices)
- US4 can be developed in parallel with US1 if resources allow
